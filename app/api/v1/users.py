"""
Users router: profile management.
"""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user, get_user_service
from app.models.user import User
from app.services.user_service import UserService
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserRead)
async def get_current_profile(
    current_user: User = Depends(get_current_user),
):
    """Get the current user's profile."""
    return current_user


@router.put("/me", response_model=UserRead)
async def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
):
    """Update the current user's profile."""
    updated = await service.update_profile(current_user, data)
    return updated
