"""
Settings router: user settings endpoints.
"""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user, get_settings_service
from app.models.user import User
from app.services.settings_service import SettingsService
from app.schemas.settings import UserSettingsRead, UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/", response_model=UserSettingsRead)
async def get_settings(
    current_user: User = Depends(get_current_user),
    service: SettingsService = Depends(get_settings_service),
):
    """Get the current user's settings."""
    return await service.get_settings(current_user)


@router.put("/", response_model=UserSettingsRead)
async def update_settings(
    data: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    service: SettingsService = Depends(get_settings_service),
):
    """Update the current user's settings."""
    return await service.update_settings(current_user, data)
