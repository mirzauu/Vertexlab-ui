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

            # Safety net: persist transcript content if it wasn't already saved
            # by the STT step (it should have been, but this ensures nothing is lost).
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
                elif not existing_transcript.content:
                    # Only update if content is still missing
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
        """Create a new version of the document (V2, V3, etc.) or create V1 if not exists."""
        # Verify task exists in org
        await self.task_repo.get_task_in_org(task_id, org_id)

        # Retrieve the latest document version if it exists
        current_doc = await self.pipeline_repo.get_document(task_id)

        if current_doc:
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
        else:
            # Document does not exist yet. Create the first draft version (V1)
            content_data = data.content or ""
            if data.corrected_chunks:
                content_data = json.dumps(data.corrected_chunks, ensure_ascii=False)

            new_doc = AIDocument(
                task_id=task_id,
                title=data.title or "AI-Corrected Proof Document",
                content=content_data,
                version=1,
                is_draft=True,
                parent_id=None,
                corrected_chunks=data.corrected_chunks or [],
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
        Aggregates all pipeline output in a single optimized DB query with eager joins.
        Reduces DB network round-trips from 5 down to 1.
        """
        from datetime import datetime
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.models.pipeline import PipelineRun
        from app.models.transcript import Transcript
        from app.models.task import Task, TaskFile, FileType

        # ── 1. Single query: load Task + files + pipeline_run + steps + transcript + ai_documents ─────
        task_result = await self.db.execute(
            select(Task)
            .where(Task.id == task_id, Task.organization_id == org_id)
            .options(
                selectinload(Task.files),
                selectinload(Task.pipeline_run).selectinload(PipelineRun.steps),
                selectinload(Task.transcript),
                selectinload(Task.ai_documents)
            )
        )
        task = task_result.scalar_one_or_none()
        if not task:
            raise NotFoundError("Task", str(task_id))

        pipeline_run = task.pipeline_run
        if not pipeline_run:
            raise NotFoundError("Pipeline run for this task")

        transcript = task.transcript

        # Sort documents by version descending to get the latest one
        doc = None
        if task.ai_documents:
            doc = sorted(task.ai_documents, key=lambda d: d.version, reverse=True)[0]

        # ── Build response from already-loaded data (no extra queries) ─────────
        audio_file_path = None
        pdf_raw_data_path = None
        if task.files:
            for f in task.files:
                if f.file_type == FileType.AUDIO:
                    audio_file_path = f.file_path
                elif f.file_type == FileType.RAW_DATA:
                    pdf_raw_data_path = f.file_path

        # Find matching step's metadata_json directly in memory (avoids Query 5)
        summary = {}
        if pipeline_run and pipeline_run.steps:
            for step in pipeline_run.steps:
                if step.step_name == "matching":
                    summary = step.metadata_json or {}
                    break

        transcribed_data = []
        if transcript and transcript.content:
            if isinstance(transcript.content, dict):
                transcribed_data = transcript.content.get("segments", [])
            elif isinstance(transcript.content, list):
                transcribed_data = transcript.content

        return {
            "audio_file_path": audio_file_path,
            "transcribed_data": transcribed_data,
            "pdf_raw_data": [],  # Exclude unused raw steno chunks payload to minimize network size
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

    async def get_workstation_data(self, task_id: UUID, org_id: UUID) -> dict:
        """
        Combined endpoint payload for the workstation (Review/Edit) page.

        Returns pipeline results AND the resolved audio file metadata in a
        single DB round-trip, replacing the previous two-request pattern
        (pipeline/results + tasks/{id}/files) on the frontend.
        """
        from app.models.task import TaskFile, FileType
        from sqlalchemy import select

        # Re-use the existing detailed results aggregator (already optimised)
        results = await self.get_detailed_results(task_id, org_id)

        # Fetch only the audio file row — a lightweight targeted query
        audio_result = await self.db.execute(
            select(TaskFile)
            .where(
                TaskFile.task_id == task_id,
                TaskFile.file_type == FileType.AUDIO,
            )
        )
        audio_file = audio_result.scalar_one_or_none()

        audio_file_info = None
        if audio_file:
            audio_file_info = {
                "id": str(audio_file.id),
                "file_path": audio_file.file_path,
                "file_type": audio_file.file_type.value,
            }

        return {
            "results": results,
            "audio_file": audio_file_info,
        }

    def _split_qa_lines(self, text: str) -> list[str]:
        import re
        if not text:
            return [""]
        # Split on whitespace followed by Q/A indicators (e.g. Q:, A:, Q., A. case-insensitive)
        sub_lines = re.split(r'\s+(?=[qQaA][:\.](?:\s|$))', text)
        return [s.strip() for s in sub_lines if s.strip()]

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
                chunk_text = chunk.get("corrected_text") or chunk.get("original_raw_text") or ""
                lines.extend(self._split_qa_lines(chunk_text))
        else:
            # Fallback to plain content
            for line in doc.content.split("\n"):
                lines.extend(self._split_qa_lines(line))

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
        width, height = 612, 792  # Letter size (8.5 x 11 inches)
        doc = fitz.open()
        
        # User requested constants
        left_margin = 79  # 1.1 inches (1.1 * 72 = 79.2 points)
        right_margin = 79 # 1.1 inches
        top_margin = 100  # Increased top margin by ~0.4 inches (72 + 28 points) -> approx 1.3-1.4"
        bottom_margin = 72
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
            upper_line = line.strip()
            if upper_line.upper().startswith('Q:') or upper_line.upper().startswith('Q '):
                line = 'Q. ' + upper_line[2:].lstrip()
            elif upper_line.upper().startswith('A:') or upper_line.upper().startswith('A '):
                line = 'A. ' + upper_line[2:].lstrip()
            elif upper_line.upper().startswith('Q.'):
                line = 'Q. ' + upper_line[2:].lstrip()
            elif upper_line.upper().startswith('A.'):
                line = 'A. ' + upper_line[2:].lstrip()

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
                chunk_text = chunk.get("corrected_text") or chunk.get("original_raw_text") or ""
                lines.extend(self._split_qa_lines(chunk_text))
        else:
            for line in doc.content.split("\n"):
                lines.extend(self._split_qa_lines(line))

        # Check for cover page file
        import os
        from app.config import settings
        cover_path = None
        task_files = await self.task_repo.get_files(task_id)
        cover_files = [f for f in task_files if f.file_name.endswith("_cover.pdf")]
        if cover_files:
            cp = os.path.join(settings.STORAGE_PATH, cover_files[0].file_path)
            if os.path.exists(cp):
                cover_path = cp

        return self._generate_word_from_lines(doc.title, lines, cover_path)

    def _generate_word_from_lines(self, title: str, lines: list[str], cover_path: str = None) -> bytes:
        """
        Generate a deposition-grade DOCX from transcript lines.

        Architecture:
        - Custom 'Transcript' style (never overwrites Normal).
        - Grouped paragraphs: each Q/A block is ONE <w:p> with <w:br/> between
          wrapped continuation lines. New <w:p> only on blank lines or Q/A transitions.
        - Full font specification (ascii/hAnsi/eastAsia/cs).
        - Raw XML injection for properties python-docx doesn't expose.
        - Word compatibility flags for consistent rendering.
        - Proper PAGE field code structure (begin → instrText → separate → fallback → end).
        """
        import docx
        from docx.shared import Pt, Inches, Twips
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.enum.section import WD_ORIENT, WD_SECTION_START
        from docx.enum.style import WD_STYLE_TYPE
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        from io import BytesIO
        import fitz
        import re

        document = docx.Document()

        # ── Helper: inject proper PAGE field code ──────────────────────────
        def add_page_number(run):
            """Insert PAGE field with begin → instrText → separate → fallback → end."""
            fldChar_begin = OxmlElement('w:fldChar')
            fldChar_begin.set(qn('w:fldCharType'), 'begin')

            instrText = OxmlElement('w:instrText')
            instrText.set(qn('xml:space'), 'preserve')
            instrText.text = " PAGE "

            fldChar_separate = OxmlElement('w:fldChar')
            fldChar_separate.set(qn('w:fldCharType'), 'separate')

            # Fallback display text (shown before field is updated)
            fallback_t = OxmlElement('w:t')
            fallback_t.text = "1"

            fldChar_end = OxmlElement('w:fldChar')
            fldChar_end.set(qn('w:fldCharType'), 'end')

            run._r.append(fldChar_begin)
            run._r.append(instrText)
            run._r.append(fldChar_separate)
            run._r.append(fallback_t)
            run._r.append(fldChar_end)

        # ── Helper: inject a boolean XML flag element ──────────────────────
        def _make_flag(tag: str, val: str = None) -> OxmlElement:
            """Create a simple OxmlElement, optionally with w:val attribute."""
            el = OxmlElement(tag)
            if val is not None:
                el.set(qn('w:val'), val)
            return el

        # ── Helper: classify a line as Q, A, or continuation ──────────────
        def _get_qa_prefix(line: str) -> str | None:
            """Return 'Q' or 'A' if the line starts with a Q/A indicator, else None."""
            stripped = line.strip().upper()
            if stripped.startswith('Q:') or stripped.startswith('Q.') or stripped.startswith('Q '):
                return 'Q'
            if stripped.startswith('A:') or stripped.startswith('A.') or stripped.startswith('A '):
                return 'A'
            return None

        # ── Helper: normalize Q/A prefix to standard form ─────────────────
        def _normalize_line(line: str) -> str:
            """Normalize Q:/A: and Q /A  prefixes to 'Q. '/'A. ' format."""
            stripped = line.strip()
            upper = stripped.upper()
            if upper.startswith('Q:') or upper.startswith('Q.') or upper.startswith('Q '):
                return 'Q. ' + stripped[2:].lstrip()
            if upper.startswith('A:') or upper.startswith('A.') or upper.startswith('A '):
                return 'A. ' + stripped[2:].lstrip()
            return line

        # ══════════════════════════════════════════════════════════════════
        # 1. COVER PAGE SECTION
        # ══════════════════════════════════════════════════════════════════
        cover_page_count = 0
        if cover_path:
            try:
                cover_doc = fitz.open(cover_path)
                cover_page_count = len(cover_doc)
                cover_section = document.sections[0]
                cover_section.page_width = Inches(8.5)
                cover_section.page_height = Inches(11.0)
                cover_section.left_margin = Inches(0)
                cover_section.right_margin = Inches(0)
                cover_section.top_margin = Inches(0)
                cover_section.bottom_margin = Inches(0)
                cover_section.header_distance = Inches(0)
                cover_section.footer_distance = Inches(0)
                cover_section.orientation = WD_ORIENT.PORTRAIT

                for i, page in enumerate(cover_doc):
                    pix = page.get_pixmap(dpi=150)
                    img_data = pix.tobytes("png")
                    p = document.add_paragraph()
                    p.paragraph_format.space_before = Pt(0)
                    p.paragraph_format.space_after = Pt(0)
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run()
                    run.add_picture(BytesIO(img_data), width=Inches(8.5), height=Inches(11.0))
                    if i < len(cover_doc) - 1:
                        document.add_page_break()

                cover_doc.close()
                body_section = document.add_section(WD_SECTION_START.NEW_PAGE)
            except Exception as e:
                logger.warning(f"Failed to merge cover PDF into Word document: {e}")
                cover_page_count = 0
                body_section = document.sections[0]
        else:
            body_section = document.sections[0]

        # ══════════════════════════════════════════════════════════════════
        # 2. BODY SECTION CONFIGURATION
        # ══════════════════════════════════════════════════════════════════
        body_section.page_width = Inches(8.5)
        body_section.page_height = Inches(11.0)
        body_section.left_margin = Inches(1.1)
        body_section.right_margin = Inches(1.1)
        body_section.top_margin = Inches(1.4)
        body_section.bottom_margin = Inches(1.0)
        body_section.orientation = WD_ORIENT.PORTRAIT
        body_section.header_distance = Inches(0.65)
        body_section.footer_distance = Inches(0.5)

        # Page numbering: continue from where the cover left off
        # e.g. 4-page cover → body starts at page 5
        pgNumType = OxmlElement('w:pgNumType')
        pgNumType.set(qn('w:start'), str(cover_page_count + 1))
        body_section._sectPr.append(pgNumType)

        # Line Numbers: restart each page, 0.25" from text
        sectPr = body_section._sectPr
        lnNumType = OxmlElement('w:lnNumType')
        lnNumType.set(qn('w:start'), '1')
        lnNumType.set(qn('w:countBy'), '1')
        lnNumType.set(qn('w:restart'), 'newPage')
        lnNumType.set(qn('w:distance'), '360')  # 0.25 inches = 360 DXA
        sectPr.append(lnNumType)

        # Document grid: linePitch for 25 lines per page
        # Available height = 11" - 1.4" - 1.0" = 8.6" = 619.2pt = 12384 twips
        # linePitch = 12384 / 25 ≈ 495 twips
        docGrid = OxmlElement('w:docGrid')
        docGrid.set(qn('w:type'), 'lines')
        docGrid.set(qn('w:linePitch'), '495')
        sectPr.append(docGrid)

        # Page Number in Header (Top-Right)
        header = body_section.header
        if cover_path:
            header.is_linked_to_previous = False
        header_p = header.paragraphs[0]
        header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        header_run = header_p.add_run()
        # Set font on header run via XML for full coverage
        header_rPr = header_run._r.get_or_add_rPr()
        h_rFonts = OxmlElement('w:rFonts')
        h_rFonts.set(qn('w:ascii'), 'Courier New')
        h_rFonts.set(qn('w:hAnsi'), 'Courier New')
        h_rFonts.set(qn('w:eastAsia'), 'Courier New')
        h_rFonts.set(qn('w:cs'), 'Courier New')
        header_rPr.append(h_rFonts)
        h_sz = OxmlElement('w:sz')
        h_sz.set(qn('w:val'), '20')  # 10pt = 20 half-points
        header_rPr.append(h_sz)
        h_szCs = OxmlElement('w:szCs')
        h_szCs.set(qn('w:val'), '20')
        header_rPr.append(h_szCs)
        add_page_number(header_run)

        # ══════════════════════════════════════════════════════════════════
        # 3. CREATE CUSTOM 'Transcript' STYLE (do NOT overwrite Normal)
        # ══════════════════════════════════════════════════════════════════
        transcript_style = document.styles.add_style('Transcript', WD_STYLE_TYPE.PARAGRAPH)
        transcript_style.base_style = document.styles['Normal']

        # ── 3a. Full font specification via raw XML ───────────────────────
        style_rPr = transcript_style.element.get_or_add_rPr()

        # Font family: all four slots
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:ascii'), 'Courier New')
        rFonts.set(qn('w:hAnsi'), 'Courier New')
        rFonts.set(qn('w:eastAsia'), 'Courier New')
        rFonts.set(qn('w:cs'), 'Courier New')
        style_rPr.append(rFonts)

        # Font size: 10pt (20 half-points) for both ascii and cs
        sz = OxmlElement('w:sz')
        sz.set(qn('w:val'), '20')
        style_rPr.append(sz)
        szCs = OxmlElement('w:szCs')
        szCs.set(qn('w:val'), '20')
        style_rPr.append(szCs)

        # Character scaling: 100%
        w_elem = OxmlElement('w:w')
        w_elem.set(qn('w:val'), '100')
        style_rPr.append(w_elem)

        # Character spacing: Normal (0)
        spacing_r = OxmlElement('w:spacing')
        spacing_r.set(qn('w:val'), '0')
        style_rPr.append(spacing_r)

        # Kerning: Off
        kern = OxmlElement('w:kern')
        kern.set(qn('w:val'), '0')
        style_rPr.append(kern)

        # Position: Normal baseline
        position = OxmlElement('w:position')
        position.set(qn('w:val'), '0')
        style_rPr.append(position)

        # Language
        lang = OxmlElement('w:lang')
        lang.set(qn('w:val'), 'en-US')
        lang.set(qn('w:eastAsia'), 'en-US')
        lang.set(qn('w:bidi'), 'ar-SA')
        style_rPr.append(lang)

        # ── 3b. Paragraph format via python-docx API ──────────────────────
        pf = transcript_style.paragraph_format
        pf.line_spacing = 1.0           # Single
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf.left_indent = Inches(0)
        pf.right_indent = Inches(0)
        pf.first_line_indent = Inches(0)
        pf.widow_control = False
        pf.keep_with_next = False
        pf.keep_together = False
        pf.page_break_before = False

        # ── 3c. Paragraph properties only accessible via raw XML ──────────
        style_pPr = transcript_style.element.get_or_add_pPr()

        # Don't auto-remove spacing between same-style paragraphs
        style_pPr.append(_make_flag('w:contextualSpacing', '0'))
        # Don't snap to document grid (critical for fixed-pitch transcripts)
        style_pPr.append(_make_flag('w:snapToGrid', '0'))
        # Don't auto-space between East Asian and Latin characters
        style_pPr.append(_make_flag('w:autoSpaceDE', '0'))
        # Don't auto-space between numbers and Latin characters
        style_pPr.append(_make_flag('w:autoSpaceDN', '0'))
        # Don't auto-adjust right indent
        style_pPr.append(_make_flag('w:adjustRightInd', '0'))
        # Never hyphenate transcript text
        style_pPr.append(_make_flag('w:suppressAutoHyphens'))
        # Baseline text alignment (standard for monospace)
        style_pPr.append(_make_flag('w:textAlignment', 'baseline'))
        # Show line numbers (do not suppress)
        style_pPr.append(_make_flag('w:suppressLineNumbers', '0'))

        # ══════════════════════════════════════════════════════════════════
        # 4. WORD COMPATIBILITY FLAGS
        # ══════════════════════════════════════════════════════════════════
        settings_element = document.settings.element
        compat = OxmlElement('w:compat')
        compat_flags = [
            'usePrinterMetrics',
            'doNotExpandShiftReturn',
            'ulTrailSpace',
            'doNotUseHTMLParagraphAutoSpacing',
            'layoutRawTableWidth',
            'doNotBreakWrappedTables',
            'doNotSnapToGridInCell',
            'dontWrapTextWithPunct',
            'dontUseEastAsianBreakRules',
        ]
        for flag in compat_flags:
            compat.append(OxmlElement(f'w:{flag}'))
        settings_element.append(compat)

        # ══════════════════════════════════════════════════════════════════
        # 5. BUILD TRANSCRIPT BODY — GROUPED PARAGRAPH MODEL
        # ══════════════════════════════════════════════════════════════════
        # Strategy:
        #   - Each Q block → 1 <w:p>, each A block → 1 <w:p>
        #   - Continuation lines within a block use <w:br/> (line break), not new <w:p>
        #   - Blank lines → flush current buffer as a paragraph, emit empty <w:p>
        #   - Q/A prefix transition → flush current buffer, start new buffer

        def _flush_buffer(buf: list[str], doc_obj):
            """Emit a single <w:p> from accumulated lines, joined by <w:br/>."""
            if not buf:
                return
            p = doc_obj.add_paragraph(style='Transcript')

            for idx, text in enumerate(buf):
                if idx > 0:
                    # Insert line break <w:br/> before continuation lines
                    br_run = p.add_run()
                    br_elem = OxmlElement('w:br')
                    br_run._r.append(br_elem)

                # Determine if this line's Q./A. prefix should be bold
                is_qa = bool(re.match(r'^[QA]\.\s', text))
                if is_qa:
                    # Bold the "Q. " or "A. " prefix, normal weight for the rest
                    prefix = text[:3]  # "Q. " or "A. "
                    rest = text[3:]
                    prefix_run = p.add_run(prefix)
                    prefix_run.bold = True
                    if rest:
                        p.add_run(rest)
                else:
                    p.add_run(text)

        # Pre-process: normalize all Q/A prefixes
        normalized_lines = [_normalize_line(l) for l in lines]

        # Start the document body with "EXAMINATION" heading
        exam_p = document.add_paragraph(style='Transcript')
        exam_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        exam_run = exam_p.add_run('EXAMINATION')
        exam_run.bold = True

        buffer: list[str] = []
        current_prefix: str | None = None  # Track current Q/A block

        for line in normalized_lines:
            # Blank line → flush + emit empty paragraph
            if not line.strip():
                _flush_buffer(buffer, document)
                buffer = []
                current_prefix = None
                # Emit blank paragraph (spacer)
                document.add_paragraph(style='Transcript')
                continue

            # Skip metadata headers (they should have been removed upstream,
            # but guard here as well)
            is_header = any(line.startswith(prefix) for prefix in (
                'Task Name:', 'Document Title:', 'Version:',
                'Status:', 'Generated At:', '--- '
            ))
            if is_header:
                continue

            # Detect Q/A prefix
            line_prefix = _get_qa_prefix(line)

            if line_prefix is not None:
                # This line starts a new Q or A block
                if line_prefix != current_prefix:
                    # Prefix changed (Q→A, A→Q, or None→Q/A) → flush old buffer
                    _flush_buffer(buffer, document)
                    buffer = []
                    current_prefix = line_prefix
                # Add to current block
                buffer.append(line)
            else:
                # Continuation line (no Q/A prefix) — append to current buffer
                buffer.append(line)

        # Flush any remaining lines
        _flush_buffer(buffer, document)

        # ══════════════════════════════════════════════════════════════════
        # 6. SAVE & RETURN
        # ══════════════════════════════════════════════════════════════════
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

