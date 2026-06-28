"""
HelpMessage request/response schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class HelpMessageCreate(BaseModel):
    """Schema for sending a help message."""
    content: str = Field(..., min_length=1, description="Message content")


class HelpMessageRead(BaseModel):
    """Schema for reading help messages."""
    id: UUID
    organization_id: UUID
    user_id: UUID
    content: str
    sender_type: str
    created_at: datetime
    user_name: Optional[str] = None

    model_config = {"from_attributes": True}
