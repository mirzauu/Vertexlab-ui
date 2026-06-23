"""
Organization repository with member and invitation queries.
"""

from uuid import UUID
from typing import Optional, Sequence
from sqlalchemy import select, func

from app.repositories.base import BaseRepository
from app.models.organization import Organization, OrganizationMember, Invitation, InvitationStatus


class OrganizationRepository(BaseRepository[Organization]):
    model = Organization

    async def get_user_organizations(self, user_id: UUID) -> Sequence[Organization]:
        """Get all organizations a user belongs to."""
        result = await self.db.execute(
            select(Organization)
            .join(OrganizationMember)
            .where(OrganizationMember.user_id == user_id)
            .order_by(Organization.created_at.desc())
        )
        return result.scalars().all()

    async def get_members(self, org_id: UUID) -> Sequence[OrganizationMember]:
        """Get all members of an organization."""
        result = await self.db.execute(
            select(OrganizationMember)
            .where(OrganizationMember.organization_id == org_id)
        )
        return result.scalars().all()

    async def get_member(self, org_id: UUID, user_id: UUID) -> Optional[OrganizationMember]:
        """Get a specific member."""
        result = await self.db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def add_member(self, member: OrganizationMember) -> OrganizationMember:
        """Add a member to an organization."""
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def remove_member(self, member: OrganizationMember) -> None:
        """Remove a member from an organization."""
        await self.db.delete(member)
        await self.db.flush()

    async def count_members(self, org_id: UUID) -> int:
        """Count members in an organization."""
        result = await self.db.execute(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == org_id
            )
        )
        return result.scalar_one()

    # --- Invitations ---

    async def create_invitation(self, invitation: Invitation) -> Invitation:
        """Create a new invitation."""
        self.db.add(invitation)
        await self.db.flush()
        await self.db.refresh(invitation)
        return invitation

    async def get_invitation_by_token(self, token: str) -> Optional[Invitation]:
        """Find an invitation by its unique token."""
        result = await self.db.execute(
            select(Invitation).where(Invitation.token == token)
        )
        return result.scalar_one_or_none()

    async def get_pending_invitations(self, org_id: UUID) -> Sequence[Invitation]:
        """Get all pending invitations for an organization."""
        result = await self.db.execute(
            select(Invitation).where(
                Invitation.organization_id == org_id,
                Invitation.status == InvitationStatus.PENDING,
            ).order_by(Invitation.created_at.desc())
        )
        return result.scalars().all()
