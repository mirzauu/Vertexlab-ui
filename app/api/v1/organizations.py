"""
Organizations router: CRUD, member management, invitations.
"""

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user, get_current_org, get_organization_service
from app.models.user import User
from app.models.organization import Organization
from app.services.organization_service import OrganizationService
from app.schemas.organization import (
    OrgCreate, OrgRead, OrgUpdate, OrgListResponse,
    MemberRead, MemberRoleUpdate,
    InvitationCreate, InvitationRead,
)
from app.schemas.auth import MessageResponse

router = APIRouter(prefix="/organizations", tags=["Organizations"])


# --- Organization CRUD ---


@router.post("/", response_model=OrgRead, status_code=201)
async def create_organization(
    data: OrgCreate,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Create a new organization."""
    return await service.create_organization(data, current_user)


@router.get("/", response_model=List[OrgRead])
async def list_organizations(
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """List all organizations the current user belongs to."""
    return await service.list_user_organizations(current_user)


@router.get("/{org_id}", response_model=OrgRead)
async def get_organization(
    org: Organization = Depends(get_current_org),
):
    """Get organization details."""
    return org


@router.put("/{org_id}", response_model=OrgRead)
async def update_organization(
    org_id: UUID,
    data: OrgUpdate,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Update organization settings. Requires admin role."""
    return await service.update_organization(org_id, data, current_user)


# --- Members ---


@router.get("/{org_id}/members", response_model=List[MemberRead])
async def list_members(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: OrganizationService = Depends(get_organization_service),
):
    """List all members of an organization."""
    return await service.list_members(org_id)


@router.put("/{org_id}/members/{user_id}", response_model=MemberRead)
async def update_member_role(
    org_id: UUID,
    user_id: UUID,
    data: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Update a member's role. Requires admin."""
    return await service.update_member_role(org_id, user_id, data, current_user)


@router.delete("/{org_id}/members/{user_id}", response_model=MessageResponse)
async def remove_member(
    org_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Remove a member. Requires admin."""
    await service.remove_member(org_id, user_id, current_user)
    return MessageResponse(message="Member removed successfully")


# --- Invitations ---


@router.post("/{org_id}/invitations", response_model=InvitationRead, status_code=201)
async def send_invitation(
    org_id: UUID,
    data: InvitationCreate,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Send an invitation to join the organization."""
    return await service.send_invitation(org_id, data, current_user)


@router.get("/{org_id}/invitations", response_model=List[InvitationRead])
async def list_invitations(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: OrganizationService = Depends(get_organization_service),
):
    """List pending invitations for the organization."""
    return await service.list_pending_invitations(org_id)


@router.post("/invitations/{token}/accept", response_model=MemberRead)
async def accept_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_organization_service),
):
    """Accept an invitation and join the organization."""
    return await service.accept_invitation(token, current_user)
