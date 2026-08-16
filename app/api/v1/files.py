from uuid import UUID
import httpx

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse

from app.core.dependencies import get_current_user, get_task_service, get_file_service
from app.models.user import User
from app.services.task_service import TaskService
from app.services.file_service import FileService

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("/{file_id}/download")
async def download_file(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    file_service: FileService = Depends(get_file_service),
):
    """Download or stream a file by its ID with CORS and byte-range support."""
    # Get file record
    task_file = await task_service.get_file(file_id)

    # If the file is hosted on Cloudinary or external CDN, redirect directly for optimal byte-range streaming
    target_url = task_file.cloudinary_url or task_file.file_path
    if target_url and (target_url.startswith("http://") or target_url.startswith("https://")):
        if "cloudinary.com" in target_url and target_url.endswith(".wav"):
            target_url = target_url[:-4] + ".mp3"
        return RedirectResponse(
            url=target_url,
            status_code=307,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )

    # Local file fallback
    absolute_path = file_service.get_absolute_path(task_file.file_path)

    return FileResponse(
        path=str(absolute_path),
        filename=task_file.file_name,
        media_type=task_file.mime_type or "audio/mpeg",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Accept-Ranges": "bytes",
        }
    )
