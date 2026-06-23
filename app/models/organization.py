"""
Organization, OrganizationMember, and Invitation ORM models.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, Enum, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin


class OrgRole(str, enum.Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class MemberStatus(str, enum.Enum):
    ACTIVE = "active"
    AWAY = "away"
    OFFLINE = "offline"


class InvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class Organization(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Relationships
    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["Invitation"]] = relationship(
        "Invitation", back_populates="organization", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="organization", cascade="all, delete-orphan"
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription", back_populates="organization", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog", back_populates="organization", cascade="all, delete-orphan"
    )
    usage_metrics: Mapped[list["UsageMetric"]] = relationship(
        "UsageMetric", back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMember(Base, UUIDMixin):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_org"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, name="org_role_enum"), nullable=False
    )
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus, name="member_status_enum"), default=MemberStatus.ACTIVE
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="memberships")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="members")


class Invitation(Base, UUIDMixin):
    __tablename__ = "invitations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, name="org_role_enum", create_constraint=False), nullable=False
    )
    invited_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="invitation_status_enum"), default=InvitationStatus.PENDING
    )
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="invitations")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by])


# Forward references for type checking
from app.models.task import Task  # noqa: E402, F401
from app.models.subscription import Subscription  # noqa: E402, F401
from app.models.activity import ActivityLog, UsageMetric  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
