"""
Pipeline service: orchestration, status, transcript, and document management.
"""

from uuid import UUID
from datetime import datetime, timezone
import logging
import json

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.repositories.pipeline_repo import PipelineRepository
from app.repositories.task_repo import TaskRepository
from app.models.pipeline import PipelineRun, PipelineStep, PipelineStatus, StepStatus
from app.models.transcript import Transcript
from app.models.ai_document import AIDocument
from app.models.task import TaskFile, FileType
from app.pipeline.base import PipelineContext
from app.pipeline.orchestrator import PipelineOrchestrator, PIPELINE_STEPS
from app.core.exceptions import NotFoundError, BadRequestError, ConflictError
from app.schemas.pipeline import AIDocumentUpdate


class PipelineService:
    """Pipeline orchestration and status management."""

    def __init__(self, pipeline_repo: PipelineRepository, task_repo: TaskRepository, db: AsyncSession):
        self.pipeline_repo = pipeline_repo
        self.task_repo = task_repo
        self.db = db

    async def trigger_pipeline(self, task_id: UUID, org_id: UUID) -> PipelineRun:
        """Create a pipeline run and return it. Execution is started via background task."""
        # Verify task exists
        task = await self.task_repo.get_task_in_org(task_id, org_id)
        if not task:
            raise NotFoundError("Task", str(task_id))

        # Check for existing run
        existing = await self.pipeline_repo.get_by_task(task_id)
        if existing and existing.status in (PipelineStatus.QUEUED, PipelineStatus.PROCESSING):
            raise ConflictError("A pipeline is already running for this task")

        # If there was a previous completed/failed run, delete it
        if existing:
            await self.pipeline_repo.delete(existing)

        # Create pipeline run
        pipeline_run = PipelineRun(task_id=task_id)
        pipeline_run = await self.pipeline_repo.create(pipeline_run)

        # Create step records
        for order, step_cls in enumerate(PIPELINE_STEPS, start=1):
            step = step_cls()
            step_record = PipelineStep(
                pipeline_run_id=pipeline_run.id,
                step_name=step.name,
                step_order=order,
            )
            await self.pipeline_repo.create_step(step_record)

        # Reload with steps
        pipeline_run = await self.pipeline_repo.get_by_task(task_id)

        # Commit immediately to ensure background tasks see the new run and avoid race conditions/locks
        await self.db.commit()

        return pipeline_run

    async def execute_pipeline(self, task_id: UUID, org_id: UUID) -> None:
        """
        Execute the pipeline (called from background task).
        This creates a new session context for the background execution.
        """
        from app.db.session import AsyncSessionLocal
        from app.repositories.pipeline_repo import PipelineRepository
        from app.repositories.task_repo import TaskRepository

        async with AsyncSessionLocal() as session:
            # Create fresh repository instances bound to the background session
            pipeline_repo = PipelineRepository(session)
            task_repo = TaskRepository(session)

            pipeline_run = await pipeline_repo.get_by_task(task_id)
            if not pipeline_run:
                return

            # Build context
            task_files = await task_repo.get_files(task_id)
            context = PipelineContext(
                task_id=task_id,
                organization_id=org_id,
            )

            # Populate file paths
            all_raw_paths = []
            examination_paths = []
            for f in task_files:
                if f.file_type == FileType.AUDIO:
                    context.audio_file_path = f.file_path
                elif f.file_type == FileType.RAW_DATA:
                    if f.file_name.endswith("_examination.pdf"):
                        examination_paths.append(f.file_path)
                    else:
                        all_raw_paths.append(f.file_path)
                        
            context.raw_data_file_paths = examination_paths if examination_paths else all_raw_paths

            # Run orchestrator using the background session
            orchestrator = PipelineOrchestrator(session)
            await orchestrator.run(pipeline_run, context)

            # Save transcript if generated
            if context.transcript:
                existing_transcript = await pipeline_repo.get_transcript(task_id)
                if not existing_transcript:
                    transcript = Transcript(
                        task_id=task_id,
                        content={"segments": context.transcript.get("segments", [])},
                        language=context.transcript.get("language", "en"),
                        confidence_score=context.transcript.get("confidence"),
                    )
                    await pipeline_repo.save_transcript(transcript)
                else:
                    existing_transcript.content = {"segments": context.transcript.get("segments", [])}
                    existing_transcript.language = context.transcript.get("language", "en")
                    existing_transcript.confidence_score = context.transcript.get("confidence")

            # Save document if generated
            if context.generated_document:
                content_data = context.generated_document["content"]
                if context.generated_document.get("corrected_chunks"):
                    content_data = json.dumps(context.generated_document["corrected_chunks"], ensure_ascii=False)

                doc = AIDocument(
                    task_id=task_id,
                    title=context.generated_document["title"],
                    content=content_data,
                    version=context.generated_document.get("version", 1),
                    is_draft=context.generated_document.get("is_draft", True),
                    corrected_chunks=context.generated_document.get("corrected_chunks"),
                )
                await pipeline_repo.save_document(doc)

            await session.commit()

    async def get_status(self, task_id: UUID, org_id: UUID) -> PipelineRun:
        """Get the pipeline run status for a task (eagerly loading task and files)."""
        run = await self.pipeline_repo.get_by_task_in_org(task_id, org_id)
        if not run:
            task = await self.task_repo.get_task_in_org(task_id, org_id)
            if not task:
                raise NotFoundError("Task", str(task_id))
            raise NotFoundError("Pipeline run for this task")

        return run

    async def get_transcript(self, task_id: UUID, org_id: UUID) -> Transcript:
        """Get the transcript for a task."""
        await self.task_repo.get_task_in_org(task_id, org_id)  # Verify access

        transcript = await self.pipeline_repo.get_transcript(task_id)
        if not transcript:
            raise NotFoundError("Transcript")

        return transcript

    async def get_document(self, task_id: UUID, org_id: UUID) -> AIDocument:
        """Get the latest AI document for a task."""
        await self.task_repo.get_task_in_org(task_id, org_id)

        doc = await self.pipeline_repo.get_document(task_id)
        if not doc:
            raise NotFoundError("AI Document")

        return doc

    async def update_document(
        self, task_id: UUID, org_id: UUID, data: AIDocumentUpdate
    ) -> AIDocument:
        """Create a new version of the document (V2, V3, etc.)."""
        current_doc = await self.get_document(task_id, org_id)

        if not current_doc.is_draft:
            raise BadRequestError("Cannot edit a finalized document")

        # Create a new version row instead of mutating the existing one
        content_data = data.content or current_doc.content
        if data.corrected_chunks:
            content_data = json.dumps(data.corrected_chunks, ensure_ascii=False)

        new_doc = AIDocument(
            task_id=task_id,
            title=data.title or current_doc.title,
            content=content_data,
            version=current_doc.version + 1,
            is_draft=True,
            parent_id=current_doc.id,
            corrected_chunks=data.corrected_chunks or current_doc.corrected_chunks,
        )
        self.db.add(new_doc)
        await self.db.flush()
        await self.db.refresh(new_doc)

        return new_doc

    async def finalize_document(self, task_id: UUID, org_id: UUID) -> AIDocument:
        """Mark an AI document as final (no longer a draft)."""
        doc = await self.get_document(task_id, org_id)

        if not doc.is_draft:
            raise BadRequestError("Document is already finalized")

        doc.is_draft = False
        await self.db.flush()
        await self.db.refresh(doc)

        return doc

    async def get_document_versions(
        self, task_id: UUID, org_id: UUID
    ) -> list[AIDocument]:
        """List all versions of the AI document for a task."""
        await self.task_repo.get_task_in_org(task_id, org_id)
        return await self.pipeline_repo.get_all_document_versions(task_id)

    async def get_detailed_results(self, task_id: UUID, org_id: UUID) -> dict:
        """
        Aggregates all pipeline output in a single optimized DB query.
        Previously did ~7 sequential queries (~5s). Now does 1 query with eager joins.
        """
        from datetime import datetime
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.models.pipeline import PipelineRun
        from app.models.transcript import Transcript
        from app.models.task import Task, TaskFile, FileType

        # ── 1. Verify task belongs to org (single lightweight check) ──────────
        task_check = await self.task_repo.get_task_in_org(task_id, org_id)
        if not task_check:
            raise NotFoundError("Task", str(task_id))

        # ── 2. Single query: load PipelineRun + task + task.files ─────
        run_result = await self.db.execute(
            select(PipelineRun)
            .where(PipelineRun.task_id == task_id)
            .options(
                selectinload(PipelineRun.task).selectinload(Task.files),
            )
        )
        pipeline_run = run_result.scalar_one_or_none()
        if not pipeline_run:
            raise NotFoundError("Pipeline run for this task")

        # ── 3. Single query: load Transcript (content + chunks + matches) ─────
        tr_result = await self.db.execute(
            select(Transcript).where(Transcript.task_id == task_id)
        )
        transcript = tr_result.scalar_one_or_none()

        # Load latest AI Document
        doc_result = await self.db.execute(
            select(AIDocument)
            .where(AIDocument.task_id == task_id)
            .order_by(AIDocument.version.desc())
        )
        doc = doc_result.scalars().first()

        # ── Build response from already-loaded data (no extra queries) ─────────
        audio_file_path = None
        pdf_raw_data_path = None
        if pipeline_run.task and pipeline_run.task.files:
            for f in pipeline_run.task.files:
                if f.file_type == FileType.AUDIO:
                    audio_file_path = f.file_path
                elif f.file_type == FileType.RAW_DATA:
                    pdf_raw_data_path = f.file_path

        # Load matching step's metadata_json directly (avoids fetching massive STT JSONB)
        step_result = await self.db.execute(
            select(PipelineStep.metadata_json)
            .where(PipelineStep.pipeline_run_id == pipeline_run.id, PipelineStep.step_name == "matching")
        )
        summary = step_result.scalar_one_or_none() or {}

        transcribed_data = []
        if transcript and transcript.content:
            if isinstance(transcript.content, dict):
                transcribed_data = transcript.content.get("segments", [])
            elif isinstance(transcript.content, list):
                transcribed_data = transcript.content

        return {
            "audio_file_path": audio_file_path,
            "transcribed_data": transcribed_data,
            "pdf_raw_data": transcript.chunks if transcript else [],
            "metadata": {
                "audio_source": audio_file_path,
                "raw_data_source": pdf_raw_data_path,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "version": "8.0"
            },
            "summary": summary,
            "matches": transcript.matches if transcript else [],
            "document": doc
        }

    async def stream_status(self, task_id: UUID, org_id: UUID):
        """Async generator for Server-Sent Events (SSE) realtime status updates."""
        import asyncio
        import json
        from app.schemas.pipeline import PipelineRunRead

        try:
            while True:
                # Rollback any stale transaction to read fresh data from the background worker
                try:
                    await self.db.rollback()
                except Exception:
                    pass

                try:
                    run = await self.get_status(task_id, org_id)
                except NotFoundError:
                    yield {"event": "error", "data": json.dumps({"detail": "Not found"})}
                    break

                run_schema = PipelineRunRead.model_validate(run)
                yield {"event": "status", "data": run_schema.model_dump_json()}

                if run.status in (PipelineStatus.COMPLETED, PipelineStatus.FAILED):
                    break

                await asyncio.sleep(1.5)

        except asyncio.CancelledError:
            # Client disconnected — this is expected behaviour, not an error.
            # Silently exit the generator so SQLAlchemy can close cleanly.
            logger.debug("SSE client disconnected for task %s", task_id)

    async def get_document_pdf(self, task_id: UUID, org_id: UUID) -> bytes:
        """Fetch the latest AI document and generate a beautifully formatted PDF."""
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.models.pipeline import PipelineRun

        # 1. Fetch task and check access
        task = await self.task_repo.get_task_in_org(task_id, org_id)
        if not task:
            raise NotFoundError("Task", str(task_id))

        # 2. Fetch the latest AI Document
        doc = await self.pipeline_repo.get_document(task_id)
        if not doc:
            raise NotFoundError("AI Document")

        # 3. Fetch summary stats
        run_result = await self.db.execute(
            select(PipelineRun)
            .where(PipelineRun.task_id == task_id)
            .options(selectinload(PipelineRun.steps))
        )
        pipeline_run = run_result.scalar_one_or_none()
        summary = {}
        if pipeline_run:
            for step in pipeline_run.steps:
                if step.step_name == "matching":
                    summary = step.metadata_json or {}

        # 4. Format lines for PDF
        lines = []
        lines.append(f"Task Name: {task.name}")
        lines.append(f"Document Title: {doc.title}")
        lines.append(f"Version: {doc.version}")
        lines.append(f"Status: {'Draft' if doc.is_draft else 'Final'}")
        if doc.created_at:
            lines.append(f"Generated At: {doc.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")



        # Add chunks
        chunks = doc.corrected_chunks
        if not chunks:
            # Fallback to transcript matches
            from app.models.transcript import Transcript
            tr_result = await self.db.execute(
                select(Transcript).where(Transcript.task_id == task_id)
            )
            transcript = tr_result.scalar_one_or_none()
            if transcript and transcript.matches:
                chunks = []
                for m in transcript.matches:
                    chunks.append({
                        "raw_chunk_id": m.get("raw_chunk_id"),
                        "original_raw_text": m.get("raw_chunk_text"),
                        "corrected_text": m.get("raw_chunk_text"),
                        "match_status": m.get("match_status", "unknown"),
                        "confidence_score": m.get("confidence_score", 0),
                        "audio_start_time_sec": m.get("audio_start_time_sec"),
                        "audio_end_time_sec": m.get("audio_end_time_sec"),
                        "speakers": m.get("speakers", [])
                    })

        if chunks:
            for chunk in chunks:
                lines.append(chunk.get("corrected_text") or chunk.get("original_raw_text") or "")
        else:
            # Fallback to plain content
            lines.extend(doc.content.split("\n"))

        # 5. Generate AI PDF bytes
        generated_pdf_bytes = self._generate_pdf_from_lines(doc.title, lines)
        
        # 6. Check if there is a cover file and merge it
        import os
        from app.config import settings
        import fitz
        task_files = await self.task_repo.get_files(task_id)
        cover_files = [f for f in task_files if f.file_name.endswith("_cover.pdf")]
        if cover_files:
            cover_path = os.path.join(settings.STORAGE_PATH, cover_files[0].file_path)
            if os.path.exists(cover_path):
                try:
                    cover_doc = fitz.open(cover_path)
                    ai_doc = fitz.open("pdf", generated_pdf_bytes)
                    cover_doc.insert_pdf(ai_doc)
                    combined_bytes = cover_doc.write()
                    cover_doc.close()
                    ai_doc.close()
                    return combined_bytes
                except Exception as e:
                    logger.warning(f"Failed to merge cover PDF: {e}")
                    
        return generated_pdf_bytes

    def _generate_pdf_from_lines(self, title: str, lines: list[str]) -> bytes:
        import fitz
        width, height = 595, 842  # A4 size (approx 8.27 x 11.69 inches)
        doc = fitz.open()
        
        # User requested constants
        left_margin = 28
        right_margin = 30
        top_margin = 32
        bottom_margin = 36
        font_name = "courier"
        font_size = 10
        line_number_width = 22
        max_lines_per_page = 25

        # Dynamically calculate line height so 25 lines exactly fill the page height
        available_height = height - top_margin - bottom_margin
        # Leave a tiny bit of extra padding so the last line doesn't scrape the margin
        line_height = available_height / max_lines_per_page

        # Text starts after the line numbers and vertical lines plus a gap
        text_start_x = left_margin + line_number_width + 12
        max_width = width - text_start_x - right_margin

        page_num = 1
        
        def start_new_page():
            nonlocal page_num
            p = doc.new_page(width=width, height=height)
            
            # Page Number
            p_num_str = str(page_num)
            p.insert_text(fitz.Point(width - right_margin - 20, top_margin), p_num_str, fontsize=font_size, fontname=font_name)
            
            # Draw line numbers 1-25 down the left margin
            y_line = top_margin + line_height # Start transcript just below the top margin
            
            for i in range(1, max_lines_per_page + 1):
                num_str = str(i)
                # right align number in its column
                nw = fitz.get_text_length(num_str, fontname=font_name, fontsize=font_size)
                x_offset = left_margin + line_number_width - nw
                p.insert_text(fitz.Point(x_offset, y_line), num_str, fontsize=font_size, fontname=font_name)
                y_line += line_height
            
            # Draw typical deposition vertical lines
            shape = p.new_shape()
            line_x1 = left_margin + line_number_width + 4
            line_x2 = left_margin + line_number_width + 6
            shape.draw_line(fitz.Point(line_x1, top_margin), fitz.Point(line_x1, height - bottom_margin))
            shape.draw_line(fitz.Point(line_x2, top_margin), fitz.Point(line_x2, height - bottom_margin))
            
            right_line_x = width - right_margin + 4
            shape.draw_line(fitz.Point(right_line_x, top_margin), fitz.Point(right_line_x, height - bottom_margin))
            shape.commit()
            
            page_num += 1
            return p

        page = start_new_page()
        current_line_on_page = 1
        y = top_margin + line_height

        def get_wrapped_lines(text: str, max_w: float) -> list[str]:
            words = text.split()
            if not words:
                return ['']
            wrapped = []
            current_line = []
            for word in words:
                test_line = ' '.join(current_line + [word])
                w = fitz.get_text_length(test_line, fontname=font_name, fontsize=font_size)
                if w <= max_w:
                    current_line.append(word)
                else:
                    if current_line:
                        wrapped.append(' '.join(current_line))
                        current_line = [word]
                    else:
                        wrapped.append(word)
            if current_line:
                wrapped.append(' '.join(current_line))
            return wrapped

        for line in lines:
            if not line.strip():
                if current_line_on_page <= max_lines_per_page:
                    y += line_height
                    current_line_on_page += 1
                continue

            # Format Q/A prefixes
            if line.startswith('Q:') or line.startswith('Q '):
                line = 'Q. ' + line[2:].lstrip()
            elif line.startswith('A:') or line.startswith('A '):
                line = 'A. ' + line[2:].lstrip()

            # Identify headers and format them ALL CAPS
            is_header = any(line.startswith(prefix) for prefix in (
                'Task Name:', 'Document Title:', 'Version:', 'Status:', 'Generated At:', '--- '
            ))
            
            if is_header:
                line = line.upper()

            wrapped = get_wrapped_lines(line, max_width)
            for i, w_line in enumerate(wrapped):
                if current_line_on_page > max_lines_per_page:
                    page = start_new_page()
                    current_line_on_page = 1
                    y = top_margin + line_height
                
                # Wrapped lines start under text, not under Q/A
                indent_x = text_start_x
                if i > 0 and (line.startswith('Q. ') or line.startswith('A. ')):
                    indent_x += fitz.get_text_length('Q. ', fontname=font_name, fontsize=font_size)

                page.insert_text(fitz.Point(indent_x, y), w_line, fontsize=font_size, fontname=font_name)
                y += line_height
                current_line_on_page += 1

        pdf_bytes = doc.write()
        doc.close()
        return pdf_bytes

    async def get_document_word(self, task_id: UUID, org_id: UUID) -> bytes:
        """Get the generated AI document as a Word DOCX file."""
        from app.models.pipeline import PipelineRun

        task = await self.task_repo.get_task_in_org(task_id, org_id)
        if not task:
            raise NotFoundError("Task", str(task_id))

        doc = await self.pipeline_repo.get_document(task_id)
        if not doc:
            raise NotFoundError("AI Document")

        lines = []
        lines.append(f"Task Name: {task.name}")
        lines.append(f"Document Title: {doc.title}")
        lines.append(f"Version: {doc.version}")
        lines.append(f"Status: {'Draft' if doc.is_draft else 'Final'}")
        if doc.created_at:
            lines.append(f"Generated At: {doc.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")

        chunks = doc.corrected_chunks
        if not chunks:
            from app.models.transcript import Transcript
            tr_result = await self.db.execute(
                select(Transcript).where(Transcript.task_id == task_id)
            )
            transcript = tr_result.scalar_one_or_none()
            if transcript and transcript.matches:
                chunks = []
                for m in transcript.matches:
                    chunks.append({
                        "raw_chunk_id": m.get("raw_chunk_id"),
                        "original_raw_text": m.get("raw_chunk_text"),
                        "corrected_text": m.get("raw_chunk_text"),
                    })

        if chunks:
            for chunk in chunks:
                lines.append(chunk.get("corrected_text") or chunk.get("original_raw_text") or "")
        else:
            lines.extend(doc.content.split("\n"))

        return self._generate_word_from_lines(doc.title, lines)

    def _generate_word_from_lines(self, title: str, lines: list[str]) -> bytes:
        import docx
        from docx.shared import Pt, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from io import BytesIO

        document = docx.Document()
        
        # Configure A4 page size
        section = document.sections[0]
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)

        # Base style
        style = document.styles['Normal']
        font = style.font
        font.name = 'Courier New'
        font.size = Pt(11)

        # Header / padding for title space
        document.add_paragraph()

        for line in lines:
            if not line.strip():
                document.add_paragraph()
                continue
                
            if line.startswith('Q:') or line.startswith('Q '):
                line = 'Q. ' + line[2:].lstrip()
            elif line.startswith('A:') or line.startswith('A '):
                line = 'A. ' + line[2:].lstrip()

            is_header = any(line.startswith(prefix) for prefix in (
                'Task Name:', 'Document Title:', 'Version:', 'Status:', 'Generated At:', '--- '
            ))
            
            p = document.add_paragraph()
            p.paragraph_format.space_after = Pt(12)
            
            run = p.add_run(line.upper() if is_header else line)
            
            if is_header:
                run.bold = True
                run.font.name = 'Times New Roman'
                run.font.size = Pt(12)

        file_stream = BytesIO()
        document.save(file_stream)
        return file_stream.getvalue()


def _format_time(seconds: float) -> str:
    """Format seconds into HH:MM:SS format."""
    if seconds is None:
        return "00:00:00"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

