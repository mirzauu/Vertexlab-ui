"""
Files router: file download.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.core.dependencies import get_current_user, get_task_service, get_file_service
from app.models.user import User
from app.services.task_service import TaskService
from app.services.file_service import FileService

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("/{file_id}/download")
async def download_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    file_service: FileService = Depends(get_file_service),
):
    """Download a file by its ID."""
    # Get file record
    task_file = await task_service.get_file(file_id)

    # Get absolute path
    absolute_path = file_service.get_absolute_path(task_file.file_path)

    return FileResponse(
        path=str(absolute_path),
        filename=task_file.file_name,
        media_type=task_file.mime_type,
    )
