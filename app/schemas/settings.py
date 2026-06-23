"""
Settings request/response schemas.
"""

from uuid import UUID
from typing import Optional
from pydantic import BaseModel

from app.models.user import ThemeChoice


class UserSettingsRead(BaseModel):
    """User settings."""
    id: UUID
    user_id: UUID
    push_notifications: bool
    email_weekly_report: bool
    automatic_sync: bool
    theme: ThemeChoice

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    """Update user settings."""
    push_notifications: Optional[bool] = None
    email_weekly_report: Optional[bool] = None
    automatic_sync: Optional[bool] = None
    theme: Optional[ThemeChoice] = None
