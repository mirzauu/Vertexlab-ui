"""
Organization request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr

from app.models.organization import OrgRole, MemberStatus, InvitationStatus


class OrgCreate(BaseModel):
    """Create a new organization."""
    name: str = Field(..., min_length=1, max_length=255)
    website: Optional[str] = None
    timezone: str = Field(default="UTC", max_length=50)


class OrgRead(BaseModel):
    """Organization details."""
    id: UUID
    name: str
    website: Optional[str] = None
    timezone: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrgUpdate(BaseModel):
    """Update organization fields."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    website: Optional[str] = None
    timezone: Optional[str] = Field(None, max_length=50)


class MemberRead(BaseModel):
    """Organization member details."""
    id: UUID
    user_id: UUID
    organization_id: UUID
    role: OrgRole
    status: MemberStatus
    joined_at: datetime
    # Nested user info
    user_email: Optional[str] = None
    user_first_name: Optional[str] = None
    user_last_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    model_config = {"from_attributes": True}


class MemberRoleUpdate(BaseModel):
    """Update a member's role."""
    role: OrgRole


class InvitationCreate(BaseModel):
    """Send an invitation."""
    email: EmailStr
    role: OrgRole = OrgRole.VIEWER


class InvitationRead(BaseModel):
    """Invitation details."""
    id: UUID
    organization_id: UUID
    email: str
    role: OrgRole
    invited_by: UUID
    status: InvitationStatus
    token: str
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class OrgListResponse(BaseModel):
    """List of organizations."""
    items: List[OrgRead]
    total: int
