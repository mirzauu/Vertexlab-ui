"""
HelpMessage database model for technical support chat.
"""

import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin


class HelpMessage(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "help_messages"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sender_type: Mapped[str] = mapped_column(String(50), nullable=False, default="user")  # 'user' or 'support'

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped["User"] = relationship("User")
