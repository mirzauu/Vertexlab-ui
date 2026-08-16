"""
Cloudinary service: upload signature generation, asset management, and URL helpers.
"""

import time
import uuid
import logging
from typing import Dict, Any, Optional

import cloudinary
import cloudinary.utils
import cloudinary.uploader
import httpx

from app.config import settings
from app.models.task import FileType

logger = logging.getLogger(__name__)


class CloudinaryService:
    """Service to handle Cloudinary authentication, signing, and asset management."""

    def __init__(self):
        self.cloud_name = settings.CLOUDINARY_CLOUD_NAME
        self.api_key = settings.CLOUDINARY_API_KEY
        self.api_secret = settings.CLOUDINARY_API_SECRET
        self.secure = settings.CLOUDINARY_SECURE

        if self.cloud_name and self.api_key and self.api_secret:
            cloudinary.config(
                cloud_name=self.cloud_name,
                api_key=self.api_key,
                api_secret=self.api_secret,
                secure=self.secure,
            )

    def is_configured(self) -> bool:
        """Check if Cloudinary credentials are fully configured."""
        return bool(self.cloud_name and self.api_key and self.api_secret)

    def get_resource_type(self, file_type: FileType, file_name: Optional[str] = None) -> str:
        """
        Determine the appropriate Cloudinary resource_type.
        Audio files -> 'video' (or 'auto')
        Documents / PDFs -> 'raw' (or 'auto' / 'image')
        """
        if file_type == FileType.AUDIO:
            return "video"
        return "raw"

    def generate_upload_signature(
        self,
        org_id: str,
        task_id: str,
        file_type: FileType,
        file_name: Optional[str] = None,
        custom_folder: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a signed parameter payload for direct frontend uploads.
        """
        if not self.is_configured():
            raise ValueError(
                "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, "
                "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment."
            )

        timestamp = int(time.time())
        type_subfolder = "audio" if file_type == FileType.AUDIO else "documents"
        folder = custom_folder or f"vertexlab/{org_id}/{task_id}/{type_subfolder}"
        resource_type = self.get_resource_type(file_type, file_name)

        params_to_sign = {
            "timestamp": timestamp,
            "folder": folder,
        }

        # Generate HMAC-SHA signature using Cloudinary SDK
        signature = cloudinary.utils.api_sign_request(params_to_sign, self.api_secret)

        return {
            "signature": signature,
            "timestamp": timestamp,
            "api_key": self.api_key,
            "cloud_name": self.cloud_name,
            "folder": folder,
            "resource_type": resource_type,
        }

    def _extract_public_id_from_url(self, url: str) -> Optional[tuple[str, str]]:
        """
        Extract public_id and resource_type from a Cloudinary URL.
        Example: https://res.cloudinary.com/demo/raw/upload/v12345/vertexlab/.../doc.pdf
        Returns: ('vertexlab/.../doc.pdf', 'raw')
        """
        import re
        match = re.search(r'/(image|raw|video)/upload/(?:s--[^/]+--/)?(?:v\d+/)?(.+)$', url)
        if match:
            return match.group(2), match.group(1)
        return None

    async def fetch_file_bytes(self, url: str) -> bytes:
        """
        Fetch remote file content as bytes.
        Handles direct CDN download and falls back to authenticated signed archive extraction
        if Cloudinary restricts direct PDF delivery (HTTP 401/403).
        """
        import io
        import zipfile

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.content
            except Exception as e:
                logger.warning(f"Direct CDN fetch failed for {url}: {e}")

            # Fallback for accounts with restricted PDF/raw media settings
            extracted = self._extract_public_id_from_url(url)
            if extracted and self.is_configured():
                public_id, resource_type = extracted
                try:
                    logger.info(f"Attempting authenticated download for {public_id} (type: {resource_type})")
                    archive_url = cloudinary.utils.download_archive_url(
                        public_ids=[public_id],
                        resource_type=resource_type,
                    )
                    archive_res = await client.get(archive_url)
                    if archive_res.status_code == 200:
                        with zipfile.ZipFile(io.BytesIO(archive_res.content)) as z:
                            names = z.namelist()
                            if names:
                                return z.read(names[0])
                except Exception as ex:
                    logger.error(f"Fallback archive download failed: {ex}")

            # Fallback failed, trigger normal error
            response = await client.get(url)
            response.raise_for_status()
            return response.content

    async def delete_asset(self, public_id: str, resource_type: str = "raw") -> None:
        """Delete an asset from Cloudinary."""
        if not self.is_configured() or not public_id:
            return
        try:
            cloudinary.uploader.destroy(public_id, resource_type=resource_type)
        except Exception as e:
            logger.warning(f"Failed to delete Cloudinary asset {public_id}: {e}")
