"""
Dependency injection factory functions.
Provides get_current_user, get_current_org, and all service/repo factories.
"""

from uuid import UUID
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedError, ForbiddenError, NotFoundError
from app.models.user import User
from app.models.organization import Organization, OrganizationMember

# Security scheme
security = HTTPBearer()


# ---------- Auth Dependencies ----------


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate JWT, return the authenticated User."""
    payload = decode_token(credentials.credentials)

    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise UnauthorizedError("User account is deactivated")

    return user


async def get_current_org(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """
    Validate that the current user is a member of the specified organization.
    Uses a single JOIN query instead of two sequential queries for better performance.
    """
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(
            Organization.id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    org = result.scalar_one_or_none()
    if org is None:
        # Distinguish between org-not-found and not-a-member for a clear error
        org_check = await db.execute(select(Organization).where(Organization.id == org_id))
        if org_check.scalar_one_or_none() is None:
            raise NotFoundError("Organization", str(org_id))
        raise ForbiddenError("You are not a member of this organization")
    return org


async def get_current_member(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationMember:
    """Get the current user's membership record for the specified organization."""
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise ForbiddenError("You are not a member of this organization")
    return membership


def require_role(*roles):
    """Dependency factory: require the current user to have one of the specified roles."""
    async def _check_role(
        member: OrganizationMember = Depends(get_current_member),
    ) -> OrganizationMember:
        if member.role not in roles:
            raise ForbiddenError(f"This action requires one of these roles: {', '.join(r.value for r in roles)}")
        return member
    return _check_role


# ---------- Repository Factories ----------


async def get_user_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.user_repo import UserRepository
    return UserRepository(db)


async def get_organization_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.organization_repo import OrganizationRepository
    return OrganizationRepository(db)


async def get_task_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.task_repo import TaskRepository
    return TaskRepository(db)


async def get_pipeline_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.pipeline_repo import PipelineRepository
    return PipelineRepository(db)


async def get_subscription_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.subscription_repo import SubscriptionRepository
    return SubscriptionRepository(db)


async def get_activity_repository(db: AsyncSession = Depends(get_db)):
    from app.repositories.activity_repo import ActivityRepository
    return ActivityRepository(db)


# ---------- Service Factories ----------


async def get_auth_service(
    user_repo=Depends(get_user_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.auth_service import AuthService
    return AuthService(user_repo=user_repo, db=db)


async def get_user_service(
    user_repo=Depends(get_user_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.user_service import UserService
    return UserService(user_repo=user_repo, db=db)


async def get_organization_service(
    org_repo=Depends(get_organization_repository),
    user_repo=Depends(get_user_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.organization_service import OrganizationService
    return OrganizationService(org_repo=org_repo, user_repo=user_repo, db=db)


async def get_task_service(
    task_repo=Depends(get_task_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.task_service import TaskService
    return TaskService(task_repo=task_repo, db=db)


async def get_file_service():
    from app.services.file_service import FileService
    return FileService()


async def get_pipeline_service(
    pipeline_repo=Depends(get_pipeline_repository),
    task_repo=Depends(get_task_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.pipeline_service import PipelineService
    return PipelineService(pipeline_repo=pipeline_repo, task_repo=task_repo, db=db)


async def get_dashboard_service(
    subscription_repo=Depends(get_subscription_repository),
    activity_repo=Depends(get_activity_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.dashboard_service import DashboardService
    return DashboardService(
        subscription_repo=subscription_repo,
        activity_repo=activity_repo,
        db=db,
    )


async def get_settings_service(
    user_repo=Depends(get_user_repository),
    db: AsyncSession = Depends(get_db),
):
    from app.services.settings_service import SettingsService
    return SettingsService(user_repo=user_repo, db=db)


async def get_billing_service(
    db: AsyncSession = Depends(get_db),
):
    from app.services.billing_service import BillingService
    return BillingService(db=db)
