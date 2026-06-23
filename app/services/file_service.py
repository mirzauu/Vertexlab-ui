"""
File service: local filesystem upload, download, path management.
"""

import os
import uuid
import aiofiles
from pathlib import Path

from fastapi import UploadFile

from app.config import settings
from app.core.exceptions import NotFoundError
from app.models.task import FileType


# MIME type to file type mapping
MIME_TYPE_MAP = {
    "audio/": FileType.AUDIO,
    "audio/wav": FileType.AUDIO,
    "audio/mpeg": FileType.AUDIO,
    "audio/mp3": FileType.AUDIO,
    "audio/ogg": FileType.AUDIO,
    "audio/webm": FileType.AUDIO,
    "text/": FileType.RAW_DATA,
    "text/csv": FileType.RAW_DATA,
    "text/plain": FileType.RAW_DATA,
    "application/json": FileType.RAW_DATA,
    "application/pdf": FileType.RAW_DATA,
    "application/vnd.openxmlformats-officedocument": FileType.RAW_DATA,
    "application/vnd.ms-excel": FileType.RAW_DATA,
}


class FileService:
    """Local file storage management."""

    def __init__(self):
        self.storage_path = Path(settings.STORAGE_PATH)

    def _get_subdirectory(self, file_type: FileType) -> str:
        """Get the storage subdirectory for a file type."""
        return {
            FileType.AUDIO: "audio",
            FileType.RAW_DATA: "raw_data",
            FileType.OUTPUT: "output",
        }[file_type]

    def detect_file_type(self, mime_type: str) -> FileType:
        """Detect file type from MIME type."""
        for prefix, file_type in MIME_TYPE_MAP.items():
            if mime_type.startswith(prefix):
                return file_type
        return FileType.RAW_DATA  # Default

    async def save_upload(
        self, file: UploadFile, file_type: FileType
    ) -> tuple[str, int]:
        """
        Save an uploaded file to local storage.

        Returns:
            Tuple of (relative_file_path, file_size)
        """
        subdir = self._get_subdirectory(file_type)
        directory = self.storage_path / subdir
        directory.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        ext = Path(file.filename or "file").suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = directory / unique_name

        # Write file
        file_size = 0
        async with aiofiles.open(file_path, "wb") as f:
            while chunk := await file.read(8192):
                await f.write(chunk)
                file_size += len(chunk)

        relative_path = f"{subdir}/{unique_name}"
        return relative_path, file_size

    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert a relative storage path to absolute."""
        absolute = self.storage_path / relative_path
        if not absolute.exists():
            raise NotFoundError("File on disk")
        return absolute

    async def delete_file(self, relative_path: str) -> None:
        """Delete a file from local storage."""
        absolute = self.storage_path / relative_path
        if absolute.exists():
            os.remove(absolute)
