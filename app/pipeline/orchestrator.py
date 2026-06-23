"""
Pipeline orchestrator: sequential step executor with status tracking.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.pipeline.base import PipelineContext, BasePipelineStep
from app.pipeline.steps.stt import STTStep
from app.pipeline.steps.data_processing import DataProcessingStep
from app.pipeline.steps.analysis import AnalysisStep
from app.pipeline.steps.matching import MatchingStep
from app.pipeline.steps.document_generation import DocumentGenerationStep
from app.models.pipeline import PipelineRun, PipelineStep, PipelineStatus, StepStatus
from app.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)

# Ordered list of pipeline steps
PIPELINE_STEPS: list[type[BasePipelineStep]] = [
    STTStep,
    DataProcessingStep,
    AnalysisStep,
    MatchingStep,
    DocumentGenerationStep,
]

def slugify(text: str) -> str:
    """Convert text into a filesystem-safe lowercase slug."""
    import re
    # Lowercase & strip leading/trailing spaces
    s = text.strip().lower()
    # Replace non-alphanumeric chars (excluding hyphens/underscores) with underscores
    s = re.sub(r'[^a-z0-9\-_]', '_', s)
    # Collapse multiple consecutive underscores
    s = re.sub(r'_+', '_', s)
    # Remove leading/trailing underscores
    return s.strip('_')


class PipelineOrchestrator:
    """
    Executes pipeline steps sequentially, tracking status in the database.
    Designed to be run as a background task.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    def _save_step_output(self, task_name: str, step_name: str, context: PipelineContext) -> None:
        """Write step-specific output to storage/output/ directory."""
        import os
        import json
        from app.config import settings

        try:
            output_dir = os.path.abspath(os.path.join(settings.STORAGE_PATH, "output"))
            os.makedirs(output_dir, exist_ok=True)
            
            slug_task = slugify(task_name)
            base_name = f"{slug_task}_{step_name}"
            
            logger.info(f"💾 Saving outputs for step '{step_name}' of task '{task_name}' to '{output_dir}'")
            
            if step_name == "stt":
                stt_data = context.transcript or context.metadata.get("stt") or {}
                file_path = os.path.join(output_dir, f"{base_name}.json")
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(stt_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved STT output: {file_path}")
                
            elif step_name == "data_processing":
                dp_meta = context.metadata.get("data_processing") or {}
                cleaned_text = dp_meta.get("cleaned_text")
                
                # Write .txt file with raw cleaned text
                if cleaned_text:
                    txt_path = os.path.join(output_dir, f"{base_name}.txt")
                    with open(txt_path, "w", encoding="utf-8") as f:
                        f.write(cleaned_text)
                    logger.info(f"Saved cleaned transcript text: {txt_path}")
                
                # Write .json file with metadata / QA pairs
                json_path = os.path.join(output_dir, f"{base_name}.json")
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(dp_meta, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved data processing JSON: {json_path}")
                
            elif step_name == "analysis":
                analysis_data = context.metadata.get("analysis") or context.analysis_result or {}
                file_path = os.path.join(output_dir, f"{base_name}.json")
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(analysis_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved analysis output: {file_path}")
                
            elif step_name == "matching":
                matching_data = context.matching_result or context.metadata.get("matching") or {}
                file_path = os.path.join(output_dir, f"{base_name}.json")
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(matching_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved matching output: {file_path}")
                
            elif step_name == "document_generation":
                doc_meta = context.metadata.get("document_generation") or {}
                generated_doc = context.generated_document or {}
                
                # Write .json file with corrected chunks + metadata
                corrected_chunks = generated_doc.get("corrected_chunks") or doc_meta.get("corrected_chunks") or []
                json_data = {
                    "title": generated_doc.get("title", "AI-Corrected Proof Document"),
                    "version": generated_doc.get("version", 1),
                    "total_chunks": doc_meta.get("total_chunks", len(corrected_chunks)),
                    "corrected_count": doc_meta.get("corrected_count", 0),
                    "skipped_count": doc_meta.get("skipped_count", 0),
                    "model": doc_meta.get("model", "unknown"),
                    "corrected_chunks": corrected_chunks,
                }
                json_path = os.path.join(output_dir, f"{base_name}.json")
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(json_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved corrected chunks JSON: {json_path}")
                
                # Write .txt file with human-readable corrected content
                text_content = generated_doc.get("content")
                if text_content:
                    txt_path = os.path.join(output_dir, f"{base_name}.txt")
                    with open(txt_path, "w", encoding="utf-8") as f:
                        f.write(text_content)
                    logger.info(f"Saved corrected document text: {txt_path}")
                
        except Exception as e:
            logger.error(f"⚠️ Error saving output file for step '{step_name}': {e}", exc_info=True)

    async def run(self, pipeline_run: PipelineRun, context: PipelineContext) -> None:
        """Execute all pipeline steps sequentially."""
        logger.info(f"🚀 Starting pipeline run {pipeline_run.id} for task {context.task_id}")

        # Mark pipeline as processing
        pipeline_run.status = PipelineStatus.PROCESSING
        pipeline_run.started_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Update task status
        from sqlalchemy import select
        result = await self.db.execute(
            select(Task).where(Task.id == context.task_id)
        )
        task = result.scalar_one_or_none()
        if task:
            task.status = TaskStatus.IN_PROGRESS
            await self.db.commit()

        task_name = task.name if task else str(context.task_id)

        try:
            for step_cls in PIPELINE_STEPS:
                step = step_cls()

                # Find the step record in the DB
                step_record = None
                for s in pipeline_run.steps:
                    if s.step_name == step.name:
                        step_record = s
                        break

                if not step_record:
                    logger.warning(f"No DB record for step '{step.name}', skipping")
                    continue

                # Mark step as in progress
                step_record.status = StepStatus.IN_PROGRESS
                step_record.started_at = datetime.now(timezone.utc)
                await self.db.commit()

                logger.info(f"  ⚙️  Executing step: {step.name}")

                try:
                    # Inject db into context
                    context.db = self.db
                    # Execute the step
                    context = await step.execute(context)

                    # Save step output to file
                    self._save_step_output(task_name, step.name, context)

                    # Mark step as completed
                    step_record.status = StepStatus.COMPLETED
                    step_record.completed_at = datetime.now(timezone.utc)
                    step_record.metadata_json = context.metadata.get(step.name, {})
                    await self.db.commit()

                    logger.info(f"  ✅ Step completed: {step.name}")

                except Exception as e:
                    # Mark step as failed
                    step_record.status = StepStatus.FAILED
                    step_record.completed_at = datetime.now(timezone.utc)
                    step_record.metadata_json = {"error": str(e)}
                    await self.db.commit()

                    logger.error(f"  ❌ Step failed: {step.name} — {str(e)}")
                    raise

            # All steps completed successfully
            pipeline_run.status = PipelineStatus.COMPLETED
            pipeline_run.completed_at = datetime.now(timezone.utc)
            if task:
                task.status = TaskStatus.COMPLETED
            await self.db.commit()

            logger.info(f"🎉 Pipeline run {pipeline_run.id} completed successfully")

        except Exception as e:
            # Pipeline failed
            pipeline_run.status = PipelineStatus.FAILED
            pipeline_run.completed_at = datetime.now(timezone.utc)
            pipeline_run.error_message = str(e)
            if task:
                task.status = TaskStatus.FAILED
            await self.db.commit()

            logger.error(f"💥 Pipeline run {pipeline_run.id} failed: {str(e)}")
