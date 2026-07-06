"""
Task repository with organization-scoped queries and file management.
"""

from uuid import UUID
from typing import Optional, Sequence
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository
from app.models.task import Task, TaskFile, TaskStatus


class TaskRepository(BaseRepository[Task]):
    model = Task

    async def get_by_org(
        self,
        org_id: UUID,
        offset: int = 0,
        limit: int = 20,
        status: Optional[TaskStatus] = None,
        search: Optional[str] = None,
    ) -> Sequence[Task]:
        """Get tasks for an organization with optional filters."""
        stmt = select(Task).where(Task.organization_id == org_id).options(
            selectinload(Task.ai_documents)
        )

        if status:
            stmt = stmt.where(Task.status == status)
        if search:
            stmt = stmt.where(Task.name.ilike(f"%{search}%"))

        stmt = stmt.order_by(Task.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_by_org(
        self,
        org_id: UUID,
        status: Optional[TaskStatus] = None,
        search: Optional[str] = None,
    ) -> int:
        """Count tasks for an organization with optional filters."""
        stmt = select(func.count(Task.id)).where(Task.organization_id == org_id)

        if status:
            stmt = stmt.where(Task.status == status)
        if search:
            stmt = stmt.where(Task.name.ilike(f"%{search}%"))

        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_task_in_org(self, task_id: UUID, org_id: UUID) -> Optional[Task]:
        """Get a specific task ensuring it belongs to the given org."""
        result = await self.db.execute(
            select(Task).where(Task.id == task_id, Task.organization_id == org_id).options(
                selectinload(Task.ai_documents)
            )
        )
        return result.scalar_one_or_none()

    # --- Task Files ---

    async def add_file(self, task_file: TaskFile) -> TaskFile:
        """Add a file to a task."""
        self.db.add(task_file)
        await self.db.flush()
        await self.db.refresh(task_file)
        return task_file

    async def get_files(self, task_id: UUID) -> Sequence[TaskFile]:
        """Get all files for a task."""
        result = await self.db.execute(
            select(TaskFile).where(TaskFile.task_id == task_id).order_by(TaskFile.uploaded_at.desc())
        )
        return result.scalars().all()

    async def get_file_by_id(self, file_id: UUID) -> Optional[TaskFile]:
        """Get a specific file by ID."""
        result = await self.db.execute(
            select(TaskFile).where(TaskFile.id == file_id)
        )
        return result.scalar_one_or_none()
