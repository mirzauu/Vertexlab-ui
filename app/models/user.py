"""
User and UserSettings ORM models.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, Text, Enum, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin


class AuthProvider(str, enum.Enum):
    LOCAL = "local"
    GOOGLE = "google"


class ThemeChoice(str, enum.Enum):
    LIGHT = "light"
    DARK = "dark"


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(AuthProvider, name="auth_provider_enum"),
        nullable=False,
        default=AuthProvider.LOCAL,
    )
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    settings: Mapped["UserSettings | None"] = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    memberships: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class UserSettings(Base, UUIDMixin):
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    push_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    email_weekly_report: Mapped[bool] = mapped_column(Boolean, default=False)
    automatic_sync: Mapped[bool] = mapped_column(Boolean, default=True)
    theme: Mapped[ThemeChoice] = mapped_column(
        Enum(ThemeChoice, name="theme_enum"), default=ThemeChoice.LIGHT
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="settings")
