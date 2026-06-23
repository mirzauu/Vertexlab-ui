"""
Dashboard service: aggregate real data for dashboard widgets.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.repositories.subscription_repo import SubscriptionRepository
from app.repositories.activity_repo import ActivityRepository
from app.models.subscription import Subscription, SubscriptionStatus, PlanType
from app.models.activity import ActivityLog
from app.models.task import Task, TaskStatus, TaskFile, FileType
from app.models.user import User
from app.models.organization import OrganizationMember
from app.schemas.dashboard import (
    RevenueOverview, RevenueOverviewResponse,
    RevenueDistribution, RevenueDistributionResponse,
    SalesPerformer, SalesPerformanceResponse,
    ActivityItem, ActivityFeedResponse,
    FunnelStage, FunnelResponse,
    DashboardAllResponse,
)

logger = logging.getLogger(__name__)


class DashboardService:
    """Aggregates data for dashboard widgets."""

    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        activity_repo: ActivityRepository,
        db: AsyncSession,
    ):
        self.subscription_repo = subscription_repo
        self.activity_repo = activity_repo
        self.db = db

    async def get_revenue_overview(self, org_id: UUID) -> RevenueOverviewResponse:
        """Get revenue overview for the organization."""
        subscriptions = await self.subscription_repo.get_by_org(org_id)
        
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        # Current active subscriptions
        active = [s for s in subscriptions if s.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL) and s.started_at <= now and s.expires_at >= now]
        mrr = sum(float(s.amount) for s in active)
        active_count = len(active)
        total = len(subscriptions)

        # Active subscriptions 30 days ago
        prev_active = [s for s in subscriptions if s.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL) and s.started_at <= thirty_days_ago and s.expires_at >= thirty_days_ago]
        prev_mrr = sum(float(s.amount) for s in prev_active)
        prev_active_count = len(prev_active)

        # Churn rate: canceled subscriptions in last 30 days
        current_canceled = [s for s in subscriptions if s.status == SubscriptionStatus.CANCELED and s.canceled_at and s.canceled_at >= thirty_days_ago]
        current_total = len([s for s in subscriptions if s.started_at <= now])
        churn_rate = (len(current_canceled) / current_total * 100) if current_total > 0 else 0.0

        # Churn rate in previous period (30 to 60 days ago)
        prev_canceled = [s for s in subscriptions if s.status == SubscriptionStatus.CANCELED and s.canceled_at and s.canceled_at >= sixty_days_ago and s.canceled_at < thirty_days_ago]
        prev_total = len([s for s in subscriptions if s.started_at <= thirty_days_ago])
        prev_churn_rate = (len(prev_canceled) / prev_total * 100) if prev_total > 0 else 0.0

        # Calculate growth rates
        mrr_growth = round(((mrr - prev_mrr) / prev_mrr * 100), 1) if prev_mrr > 0 else (100.0 if mrr > 0 else 0.0)
        subscriptions_growth = round(((active_count - prev_active_count) / prev_active_count * 100), 1) if prev_active_count > 0 else (100.0 if active_count > 0 else 0.0)
        churn_growth = round((churn_rate - prev_churn_rate), 1)

        return RevenueOverviewResponse(
            overview=RevenueOverview(
                mrr=mrr,
                mrr_growth=mrr_growth,
                subscriptions_growth=subscriptions_growth,
                churn_growth=churn_growth,
                total_subscriptions=total,
                active_subscriptions=active_count,
                churn_rate=round(churn_rate, 2),
                period=now.strftime("%Y-%m"),
            )
        )

    async def get_revenue_distribution(self, org_id: UUID) -> RevenueDistributionResponse:
        """Get revenue breakdown by plan type."""
        subscriptions = await self.subscription_repo.get_by_org(org_id)
        active = [s for s in subscriptions if s.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL)]

        total_revenue = sum(float(s.amount) for s in active)

        plan_data = {}
        for sub in active:
            plan = sub.plan.value
            if plan not in plan_data:
                plan_data[plan] = {"revenue": 0, "count": 0}
            plan_data[plan]["revenue"] += float(sub.amount)
            plan_data[plan]["count"] += 1

        items = []
        for plan, data in plan_data.items():
            items.append(RevenueDistribution(
                plan=plan,
                revenue=data["revenue"],
                percentage=round((data["revenue"] / total_revenue * 100) if total_revenue > 0 else 0, 2),
                subscriber_count=data["count"],
            ))

        return RevenueDistributionResponse(items=items)

    async def get_sales_performance(self, org_id: UUID) -> SalesPerformanceResponse:
        """Get top performers by task completion — single aggregated query."""
        # Single query: join members -> users -> tasks (left) -> task_files (left),
        # group by user, aggregate completed count + page sum in one round trip.
        stmt = (
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.avatar_url,
                func.count(Task.id).label("tasks_completed"),
                func.coalesce(func.sum(TaskFile.page_count), 0).label("total_pages"),
            )
            .select_from(OrganizationMember)
            .join(User, User.id == OrganizationMember.user_id)
            .outerjoin(
                Task,
                (Task.organization_id == org_id)
                & (Task.created_by == User.id)
                & (Task.status == TaskStatus.COMPLETED),
            )
            .outerjoin(TaskFile, TaskFile.task_id == Task.id)
            .where(OrganizationMember.organization_id == org_id)
            .group_by(User.id, User.first_name, User.last_name, User.avatar_url)
            .order_by(func.count(Task.id).desc())
            .limit(10)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        performers = []
        for row in rows:
            user_id, first_name, last_name, avatar_url, completed, pages = row
            full_name = f"{first_name or ''} {last_name or ''}".strip() or "User"
            revenue = float(pages) * 1.00 if pages > 0 else float(completed) * 10.00

            performers.append(SalesPerformer(
                user_id=str(user_id),
                name=full_name,
                avatar_url=avatar_url,
                tasks_completed=completed,
                revenue_generated=revenue,
                performance_score=min(completed * 10, 100) if completed > 0 else 50,
            ))

        return SalesPerformanceResponse(performers=performers)

    async def get_activity_feed(self, org_id: UUID, limit: int = 20) -> ActivityFeedResponse:
        """Get recent activity for the organization — eager-load users."""
        # Single query with LEFT JOIN to users instead of N+1 per-log user lookups.
        stmt = (
            select(ActivityLog, User)
            .outerjoin(User, User.id == ActivityLog.user_id)
            .where(ActivityLog.organization_id == org_id)
            .order_by(ActivityLog.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        items = []
        for log, user in rows:
            user_name = user.full_name if user else None
            user_avatar = user.avatar_url if user else None

            items.append(ActivityItem(
                id=str(log.id),
                action_type=log.action_type,
                title=log.title,
                user_name=user_name,
                user_avatar=user_avatar,
                created_at=log.created_at,
                metadata=log.metadata_json or {},
            ))

        return ActivityFeedResponse(items=items, total=len(items))

    async def get_funnel(self, org_id: UUID) -> FunnelResponse:
        """Get task conversion funnel data — single GROUP BY query."""
        # One query with GROUP BY instead of 4 separate COUNT queries.
        result = await self.db.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.organization_id == org_id)
            .group_by(Task.status)
        )
        status_counts = {row[0]: row[1] for row in result.all()}

        total = sum(status_counts.values())

        stages = []
        # Support both QUEUED and NOT_STARTED for backward compatibility, mapping both to "queued" in the funnel response.
        for status in [TaskStatus.QUEUED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.FAILED]:
            count = status_counts.get(status, 0)
            if status == TaskStatus.QUEUED:
                count += status_counts.get(TaskStatus.NOT_STARTED, 0)
            stages.append(FunnelStage(
                stage=status.value,
                count=count,
                percentage=round((count / total * 100) if total > 0 else 0, 2),
            ))

        return FunnelResponse(stages=stages)

    async def get_all(self, org_id: UUID) -> DashboardAllResponse:
        """Fetch ALL dashboard data in a single request, sharing DB session.
        
        Runs sequentially because AsyncSession is not safe for concurrent
        coroutine access. The speed gains come from:
        1. Single HTTP request (1 auth check instead of 5)
        2. Optimised queries inside each method (no more N+1)
        """
        rev = await self.get_revenue_overview(org_id)
        dist = await self.get_revenue_distribution(org_id)
        sales = await self.get_sales_performance(org_id)
        activity = await self.get_activity_feed(org_id, limit=5)
        funnel = await self.get_funnel(org_id)

        return DashboardAllResponse(
            revenue=rev.overview,
            distribution=dist.items,
            performers=sales.performers,
            activity=activity.items,
            funnel=funnel.stages,
        )

    async def chat_with_assistant(self, org_id: UUID, message: str) -> str:
        """Interact with OpenAI GPT assistant using organization-specific data context."""
        from openai import AsyncOpenAI
        from app.config import settings

        # Fetch organization context
        subscriptions = await self.subscription_repo.get_by_org(org_id)
        active_subs = [s for s in subscriptions if s.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL)]
        mrr = sum(float(s.amount) for s in active_subs)
        
        # Tasks count by status — single GROUP BY query
        result = await self.db.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.organization_id == org_id)
            .group_by(Task.status)
        )
        task_stages = {row[0].value: row[1] for row in result.all()}
        
        total_tasks = sum(task_stages.values())

        # Top performers
        perf_res = await self.get_sales_performance(org_id)
        performers_str = ", ".join([f"{p.name} ({p.tasks_completed} completed tasks, ${p.revenue_generated:.2f} revenue generated)" for p in perf_res.performers])

        system_prompt = f"""
You are VerbaLex AI, a helpful virtual assistant integrated into the dashboard of the VerbaLex speech and document processing pipeline application.
Your goal is to answer the user's questions about their organization metrics, tasks, revenue, and activities.
Keep your answers professional, concise, and helpful. Use markdown formatting.

Here is the current real-time organization context for organization ID '{org_id}':
- Total Monthly Recurring Revenue (MRR): ${mrr:.2f}
- Subscriptions: {len(active_subs)} active subscription(s) out of {len(subscriptions)} total.
- Tasks: {total_tasks} total tasks. Breakdown by status:
  * In Queue: {task_stages.get('queued', 0) + task_stages.get('not_started', 0)}
  * In Progress: {task_stages.get('in_progress', 0)}
  * Completed: {task_stages.get('completed', 0)}
  * Failed: {task_stages.get('failed', 0)}
- Top Performers: {performers_str if performers_str else 'No team members have completed tasks yet.'}
"""

        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                max_tokens=250,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Error in VerbaLex AI assistant: {e}")
            return f"I'm sorry, I encountered an issue accessing my AI reasoning system. Details: {str(e)}"

