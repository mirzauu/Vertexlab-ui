"""
User request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

from app.models.user import AuthProvider


class UserCreate(BaseModel):
    """Internal schema for creating a user."""
    email: EmailStr
    password_hash: Optional[str] = None
    first_name: str
    last_name: str
    avatar_url: Optional[str] = None
    auth_provider: AuthProvider = AuthProvider.LOCAL
    google_id: Optional[str] = None


class UserRead(BaseModel):
    """Public user profile."""
    id: UUID
    email: str
    first_name: str
    last_name: str
    avatar_url: Optional[str] = None
    auth_provider: AuthProvider
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Update user profile fields."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    avatar_url: Optional[str] = None



