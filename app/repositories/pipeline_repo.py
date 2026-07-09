"""
Pipeline repository for pipeline runs and steps.
"""

from uuid import UUID
from typing import Optional, Sequence
from sqlalchemy import select
from sqlalchemy.orm import selectinload, undefer

from app.repositories.base import BaseRepository
from app.models.pipeline import PipelineRun, PipelineStep
from app.models.transcript import Transcript
from app.models.ai_document import AIDocument
from app.models.task import Task


class PipelineRepository(BaseRepository[PipelineRun]):
    model = PipelineRun

    async def get_by_task(self, task_id: UUID) -> Optional[PipelineRun]:
        """Get the pipeline run for a task, with steps eagerly loaded."""
        result = await self.db.execute(
            select(PipelineRun)
            .where(PipelineRun.task_id == task_id)
            .options(
                selectinload(PipelineRun.steps),
                selectinload(PipelineRun.task).selectinload(Task.files),
                selectinload(PipelineRun.task).selectinload(Task.ai_documents)
            )
        )
        return result.scalar_one_or_none()

    async def get_by_task_in_org(self, task_id: UUID, org_id: UUID) -> Optional[PipelineRun]:
        """Get pipeline run for a task ensuring task belongs to the given org in a single query."""
        result = await self.db.execute(
            select(PipelineRun)
            .join(PipelineRun.task)
            .where(PipelineRun.task_id == task_id, Task.organization_id == org_id)
            .options(
                selectinload(PipelineRun.steps),
                selectinload(PipelineRun.task).selectinload(Task.files),
                selectinload(PipelineRun.task).selectinload(Task.ai_documents)
            )
        )
        return result.scalar_one_or_none()

    async def get_status_lean(self, task_id: UUID, org_id: UUID) -> Optional[PipelineRun]:
        """
        Lean status query: loads PipelineRun + steps only (no task.files).
        Used for status polling to avoid re-fetching large file payloads on every tick.
        """
        result = await self.db.execute(
            select(PipelineRun)
            .join(PipelineRun.task)
            .where(PipelineRun.task_id == task_id, Task.organization_id == org_id)
            .options(selectinload(PipelineRun.steps))
        )
        return result.scalar_one_or_none()

    async def create_step(self, step: PipelineStep) -> PipelineStep:
        """Create a pipeline step record."""
        self.db.add(step)
        await self.db.flush()
        await self.db.refresh(step)
        return step

    async def get_transcript(self, task_id: UUID) -> Optional[Transcript]:
        """Get the transcript for a task."""
        result = await self.db.execute(
            select(Transcript).where(Transcript.task_id == task_id)
        )
        return result.scalar_one_or_none()

    async def save_transcript(self, transcript: Transcript) -> Transcript:
        """Save a transcript."""
        self.db.add(transcript)
        await self.db.flush()
        await self.db.refresh(transcript)
        return transcript

    async def get_document(self, task_id: UUID) -> Optional[AIDocument]:
        """Get the latest AI document for a task."""
        result = await self.db.execute(
            select(AIDocument)
            .where(AIDocument.task_id == task_id)
            .order_by(AIDocument.version.desc())
            .options(undefer(AIDocument.content), undefer(AIDocument.corrected_chunks))
        )
        return result.scalars().first()

    async def get_documents(self, task_id: UUID) -> Sequence[AIDocument]:
        """Get all AI documents for a task."""
        result = await self.db.execute(
            select(AIDocument)
            .where(AIDocument.task_id == task_id)
            .order_by(AIDocument.version.desc())
        )
        return result.scalars().all()

    async def save_document(self, document: AIDocument) -> AIDocument:
        """Save an AI document."""
        self.db.add(document)
        await self.db.flush()
        await self.db.refresh(document)
        return document

    async def get_all_document_versions(self, task_id: UUID) -> list[AIDocument]:
        """Get all document versions for a task, ordered by version ascending."""
        result = await self.db.execute(
            select(AIDocument)
            .where(AIDocument.task_id == task_id)
            .order_by(AIDocument.version.asc())
            .options(undefer(AIDocument.content), undefer(AIDocument.corrected_chunks))
        )
        return list(result.scalars().all())
