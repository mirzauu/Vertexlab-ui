"""
Organization service: org CRUD, member management, invitations.
"""

import secrets
from uuid import UUID
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.organization_repo import OrganizationRepository
from app.repositories.user_repo import UserRepository
from app.models.organization import (
    Organization, OrganizationMember, Invitation,
    OrgRole, InvitationStatus,
)
from app.models.user import User
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError, BadRequestError
from app.schemas.organization import OrgCreate, OrgUpdate, MemberRoleUpdate, InvitationCreate
from app.utils.email import send_invitation_email


class OrganizationService:
    """Organization management."""

    def __init__(self, org_repo: OrganizationRepository, user_repo: UserRepository, db: AsyncSession):
        self.org_repo = org_repo
        self.user_repo = user_repo
        self.db = db

    async def create_organization(self, data: OrgCreate, creator: User) -> Organization:
        """Create a new organization and add the creator as admin."""
        org = Organization(
            name=data.name,
            website=data.website,
            timezone=data.timezone,
        )
        org = await self.org_repo.create(org)

        # Add creator as admin
        member = OrganizationMember(
            user_id=creator.id,
            organization_id=org.id,
            role=OrgRole.ADMIN,
        )
        await self.org_repo.add_member(member)

        return org

    async def list_user_organizations(self, user: User) -> list[Organization]:
        """List all organizations the user belongs to."""
        orgs = await self.org_repo.get_user_organizations(user.id)
        return list(orgs)

    async def get_organization(self, org_id: UUID) -> Organization:
        """Get organization details."""
        org = await self.org_repo.get_by_id(org_id)
        if not org:
            raise NotFoundError("Organization", str(org_id))
        return org

    async def update_organization(
        self, org_id: UUID, data: OrgUpdate, current_user: User
    ) -> Organization:
        """Update organization settings. Requires admin role."""
        await self._require_admin(org_id, current_user.id)

        org = await self.org_repo.get_by_id(org_id)
        if not org:
            raise NotFoundError("Organization", str(org_id))

        update_data = data.model_dump(exclude_unset=True)
        return await self.org_repo.update(org, update_data)

    # --- Members ---

    async def list_members(self, org_id: UUID) -> list[dict]:
        """List all members of an organization with user info."""
        members = await self.org_repo.get_members(org_id)
        result = []
        for member in members:
            # Eagerly load user data
            user = await self.user_repo.get_by_id(member.user_id)
            result.append({
                "id": member.id,
                "user_id": member.user_id,
                "organization_id": member.organization_id,
                "role": member.role,
                "status": member.status,
                "joined_at": member.joined_at,
                "user_email": user.email if user else None,
                "user_first_name": user.first_name if user else None,
                "user_last_name": user.last_name if user else None,
                "user_avatar_url": user.avatar_url if user else None,
            })
        return result

    async def update_member_role(
        self, org_id: UUID, target_user_id: UUID, data: MemberRoleUpdate, current_user: User
    ) -> OrganizationMember:
        """Update a member's role. Requires admin."""
        await self._require_admin(org_id, current_user.id)

        member = await self.org_repo.get_member(org_id, target_user_id)
        if not member:
            raise NotFoundError("Member")

        # Cannot demote the last admin
        if member.role == OrgRole.ADMIN and data.role != OrgRole.ADMIN:
            admins = [m for m in await self.org_repo.get_members(org_id) if m.role == OrgRole.ADMIN]
            if len(admins) <= 1:
                raise BadRequestError("Cannot remove the last admin from the organization")

        member.role = data.role
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def remove_member(
        self, org_id: UUID, target_user_id: UUID, current_user: User
    ) -> None:
        """Remove a member from the organization. Requires admin."""
        await self._require_admin(org_id, current_user.id)

        member = await self.org_repo.get_member(org_id, target_user_id)
        if not member:
            raise NotFoundError("Member")

        # Cannot remove the last admin
        if member.role == OrgRole.ADMIN:
            admins = [m for m in await self.org_repo.get_members(org_id) if m.role == OrgRole.ADMIN]
            if len(admins) <= 1:
                raise BadRequestError("Cannot remove the last admin from the organization")

        await self.org_repo.remove_member(member)

    # --- Invitations ---

    async def send_invitation(
        self, org_id: UUID, data: InvitationCreate, inviter: User
    ) -> Invitation:
        """Send an invitation email. Requires admin or editor."""
        member = await self.org_repo.get_member(org_id, inviter.id)
        if not member or member.role not in (OrgRole.ADMIN, OrgRole.EDITOR):
            raise ForbiddenError("Only admins and editors can send invitations")

        # Check if already a member
        existing_user = await self.user_repo.get_by_email(data.email)
        if existing_user:
            existing_member = await self.org_repo.get_member(org_id, existing_user.id)
            if existing_member:
                raise ConflictError(f"User '{data.email}' is already a member")

        # Create invitation
        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            organization_id=org_id,
            email=data.email,
            role=data.role,
            invited_by=inviter.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        invitation = await self.org_repo.create_invitation(invitation)

        # Send email (async, non-blocking)
        org = await self.org_repo.get_by_id(org_id)
        await send_invitation_email(
            email=data.email,
            org_name=org.name if org else "Organization",
            inviter_name=inviter.full_name,
            token=token,
        )

        return invitation

    async def list_pending_invitations(self, org_id: UUID) -> list[Invitation]:
        """List pending invitations for an organization."""
        invitations = await self.org_repo.get_pending_invitations(org_id)
        return list(invitations)

    async def accept_invitation(self, token: str, user: User) -> OrganizationMember:
        """Accept an invitation and join the organization."""
        invitation = await self.org_repo.get_invitation_by_token(token)
        if not invitation:
            raise NotFoundError("Invitation")

        if invitation.status != InvitationStatus.PENDING:
            raise BadRequestError("This invitation has already been used or expired")

        if invitation.expires_at < datetime.now(timezone.utc):
            invitation.status = InvitationStatus.EXPIRED
            await self.db.flush()
            raise BadRequestError("This invitation has expired")

        if invitation.email != user.email:
            raise ForbiddenError("This invitation was sent to a different email address")

        # Check if already a member
        existing = await self.org_repo.get_member(invitation.organization_id, user.id)
        if existing:
            raise ConflictError("You are already a member of this organization")

        # Add as member
        member = OrganizationMember(
            user_id=user.id,
            organization_id=invitation.organization_id,
            role=invitation.role,
        )
        member = await self.org_repo.add_member(member)

        # Mark invitation as accepted
        invitation.status = InvitationStatus.ACCEPTED
        await self.db.flush()

        return member

    # --- Helpers ---

    async def _require_admin(self, org_id: UUID, user_id: UUID) -> OrganizationMember:
        """Verify the user is an admin of the organization."""
        member = await self.org_repo.get_member(org_id, user_id)
        if not member:
            raise ForbiddenError("You are not a member of this organization")
        if member.role != OrgRole.ADMIN:
            raise ForbiddenError("This action requires admin privileges")
        return member
