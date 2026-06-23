"""
Task service: task CRUD, file association, org-scoped access.
"""

from uuid import UUID
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.task_repo import TaskRepository
from app.models.task import Task, TaskFile, TaskStatus, FileType
from app.models.user import User
from app.core.exceptions import NotFoundError
from app.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    """Task management."""

    def __init__(self, task_repo: TaskRepository, db: AsyncSession):
        self.task_repo = task_repo
        self.db = db

    async def create_task(self, org_id: UUID, data: TaskCreate, creator: User) -> Task:
        """Create a new task within an organization."""
        task = Task(
            organization_id=org_id,
            created_by=creator.id,
            name=data.name,
            description=data.description,
            tags=data.tags,
        )
        return await self.task_repo.create(task)

    async def list_tasks(
        self,
        org_id: UUID,
        page: int = 1,
        page_size: int = 20,
        status: Optional[TaskStatus] = None,
        search: Optional[str] = None,
    ) -> dict:
        """List tasks for an org with pagination and filters."""
        import asyncio
        offset = (page - 1) * page_size
        # Run both queries in parallel — cuts list load time roughly in half
        tasks, total = await asyncio.gather(
            self.task_repo.get_by_org(
                org_id=org_id,
                offset=offset,
                limit=page_size,
                status=status,
                search=search,
            ),
            self.task_repo.count_by_org(
                org_id=org_id,
                status=status,
                search=search,
            ),
        )
        return {
            "items": list(tasks),
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_task(self, task_id: UUID, org_id: UUID) -> Task:
        """Get a specific task, ensuring org membership."""
        task = await self.task_repo.get_task_in_org(task_id, org_id)
        if not task:
            raise NotFoundError("Task", str(task_id))
        return task

    async def update_task(self, task_id: UUID, org_id: UUID, data: TaskUpdate) -> Task:
        """Update a task."""
        task = await self.get_task(task_id, org_id)
        update_data = data.model_dump(exclude_unset=True)
        return await self.task_repo.update(task, update_data)

    async def delete_task(self, task_id: UUID, org_id: UUID) -> None:
        """Delete a task."""
        task = await self.get_task(task_id, org_id)
        await self.task_repo.delete(task)

    # --- Files ---

    async def add_file(
        self,
        task_id: UUID,
        org_id: UUID,
        file_name: str,
        file_path: str,
        file_type: FileType,
        file_size: int,
        mime_type: str,
        page_count: int | None = None,
    ) -> TaskFile:
        """Register a file with a task."""
        # Verify task exists in org
        await self.get_task(task_id, org_id)

        task_file = TaskFile(
            task_id=task_id,
            file_name=file_name,
            file_path=file_path,
            file_type=file_type,
            file_size=file_size,
            mime_type=mime_type,
            page_count=page_count,
        )
        return await self.task_repo.add_file(task_file)

    async def list_files(self, task_id: UUID, org_id: UUID) -> list[TaskFile]:
        """List all files for a task."""
        await self.get_task(task_id, org_id)  # Verify membership
        files = await self.task_repo.get_files(task_id)
        return list(files)

    async def get_file(self, file_id: UUID) -> TaskFile:
        """Get a specific file by ID."""
        file = await self.task_repo.get_file_by_id(file_id)
        if not file:
            raise NotFoundError("File", str(file_id))
        return file
