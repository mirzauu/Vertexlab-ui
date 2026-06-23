"""
Activity repository for activity logs and usage metrics.
"""

from uuid import UUID
from typing import Sequence
from sqlalchemy import select

from app.repositories.base import BaseRepository
from app.models.activity import ActivityLog, UsageMetric


class ActivityRepository(BaseRepository[ActivityLog]):
    model = ActivityLog

    async def get_by_org(
        self, org_id: UUID, offset: int = 0, limit: int = 20
    ) -> Sequence[ActivityLog]:
        """Get activity logs for an organization."""
        result = await self.db.execute(
            select(ActivityLog)
            .where(ActivityLog.organization_id == org_id)
            .order_by(ActivityLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return result.scalars().all()

    async def create_log(self, log: ActivityLog) -> ActivityLog:
        """Create an activity log entry."""
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log)
        return log

    async def get_usage_metrics(
        self, org_id: UUID, metric_type: str | None = None
    ) -> Sequence[UsageMetric]:
        """Get usage metrics for an organization."""
        stmt = select(UsageMetric).where(UsageMetric.organization_id == org_id)
        if metric_type:
            stmt = stmt.where(UsageMetric.metric_type == metric_type)
        stmt = stmt.order_by(UsageMetric.recorded_at.desc())
        result = await self.db.execute(stmt)
        return result.scalars().all()
