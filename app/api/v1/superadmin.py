"""
Super Admin API Router.
Provides administrative controls for the super admin (mirzamailbox0@gmail.com).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from uuid import UUID
from typing import Dict, List, Any

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrganizationMember
from app.models.task import Task, TaskStatus
from app.core.exceptions import ForbiddenError, NotFoundError

router = APIRouter(prefix="/superadmin", tags=["Super Admin"])


async def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    """Ensure that the authenticated user is the super admin."""
    if current_user.email != "mirzamailbox0@gmail.com":
        raise ForbiddenError("This action requires Super Admin privileges.")
    return current_user


@router.get("/stats")
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """Retrieve system-wide statistics for the superadmin dashboard."""
    # Count total users
    user_count_res = await db.execute(select(func.count(User.id)))
    total_users = user_count_res.scalar_one()

    # Count total organizations
    org_count_res = await db.execute(select(func.count(Organization.id)))
    total_organizations = org_count_res.scalar_one()

    # Count tasks by status
    task_count_res = await db.execute(select(func.count(Task.id)))
    total_tasks = task_count_res.scalar_one()

    completed_tasks_res = await db.execute(
        select(func.count(Task.id)).where(Task.status == TaskStatus.COMPLETED)
    )
    completed_tasks = completed_tasks_res.scalar_one()

    failed_tasks_res = await db.execute(
        select(func.count(Task.id)).where(Task.status == TaskStatus.FAILED)
    )
    failed_tasks = failed_tasks_res.scalar_one()

    in_progress_tasks_res = await db.execute(
        select(func.count(Task.id)).where(Task.status == TaskStatus.IN_PROGRESS)
    )
    in_progress_tasks = in_progress_tasks_res.scalar_one()

    queued_tasks_res = await db.execute(
        select(func.count(Task.id)).where(Task.status == TaskStatus.QUEUED)
    )
    queued_tasks = queued_tasks_res.scalar_one()

    return {
        "users": {
            "total": total_users,
        },
        "organizations": {
            "total": total_organizations,
        },
        "tasks": {
            "total": total_tasks,
            "completed": completed_tasks,
            "failed": failed_tasks,
            "in_progress": in_progress_tasks,
            "queued": queued_tasks,
        },
    }


@router.get("/users")
async def get_all_users(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """List all users in the system with their details and organization memberships."""
    offset = (page - 1) * page_size

    # Fetch users ordered by creation date
    users_stmt = select(User).order_by(desc(User.created_at)).offset(offset).limit(page_size)
    users_res = await db.execute(users_stmt)
    users = users_res.scalars().all()

    # Count total users for pagination
    total_res = await db.execute(select(func.count(User.id)))
    total_count = total_res.scalar_one()

    user_list = []
    for u in users:
        # Get organization memberships for this user
        memberships_stmt = (
            select(OrganizationMember.role, Organization.name, Organization.id)
            .join(Organization, Organization.id == OrganizationMember.organization_id)
            .where(OrganizationMember.user_id == u.id)
        )
        memberships_res = await db.execute(memberships_stmt)
        orgs = [
            {"role": row[0], "org_name": row[1], "org_id": str(row[2])}
            for row in memberships_res.all()
        ]

        user_list.append({
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "is_active": u.is_active,
            "auth_provider": u.auth_provider,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "organizations": orgs,
        })

    return {
        "items": user_list,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """Toggle a user's active status (activate/deactivate)."""
    # Prevent self-deactivation
    if user_id == _admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own superadmin account.",
        )

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()

    if not user:
        raise NotFoundError("User", str(user_id))

    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)

    return {
        "id": str(user.id),
        "email": user.email,
        "is_active": user.is_active,
        "message": f"User status updated to {'active' if user.is_active else 'inactive'}",
    }


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """Log in as the target user (generate authentication tokens) without validation/verification."""
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()

    if not user:
        raise NotFoundError("User", str(user_id))

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot impersonate a deactivated user.",
        )

    # Generate JWT tokens for the target user
    from app.core.security import create_access_token, create_refresh_token
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


@router.get("/organizations")
async def get_all_organizations(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """List all organizations in the system with members and tasks counters."""
    offset = (page - 1) * page_size

    orgs_stmt = select(Organization).order_by(desc(Organization.created_at)).offset(offset).limit(page_size)
    orgs_res = await db.execute(orgs_stmt)
    orgs = orgs_res.scalars().all()

    total_res = await db.execute(select(func.count(Organization.id)))
    total_count = total_res.scalar_one()

    org_list = []
    for o in orgs:
        # Count members
        member_count_res = await db.execute(
            select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == o.id)
        )
        member_count = member_count_res.scalar_one()

        # Count tasks
        task_count_res = await db.execute(
            select(func.count(Task.id)).where(Task.organization_id == o.id)
        )
        task_count = task_count_res.scalar_one()

        org_list.append({
            "id": str(o.id),
            "name": o.name,
            "website": o.website,
            "timezone": o.timezone,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "member_count": member_count,
            "task_count": task_count,
        })

    return {
        "items": org_list,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tasks")
async def get_all_tasks(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_superadmin),
):
    """List all pipeline tasks across the system."""
    offset = (page - 1) * page_size

    # Join with organization and user to get related names
    tasks_stmt = (
        select(Task, Organization.name, User.email)
        .join(Organization, Organization.id == Task.organization_id)
        .join(User, User.id == Task.created_by)
        .order_by(desc(Task.created_at))
        .offset(offset)
        .limit(page_size)
    )
    tasks_res = await db.execute(tasks_stmt)
    rows = tasks_res.all()

    total_res = await db.execute(select(func.count(Task.id)))
    total_count = total_res.scalar_one()

    task_list = []
    for row in rows:
        task_obj, org_name, creator_email = row
        task_list.append({
            "id": str(task_obj.id),
            "name": task_obj.name,
            "description": task_obj.description,
            "status": task_obj.status,
            "created_at": task_obj.created_at.isoformat() if task_obj.created_at else None,
            "organization_name": org_name,
            "creator_email": creator_email,
        })

    return {
        "items": task_list,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }
