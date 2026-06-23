"""
Dashboard response schemas.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class RevenueOverview(BaseModel):
    """Monthly recurring revenue summary."""
    mrr: float
    mrr_growth: float  # percentage
    subscriptions_growth: float  # percentage
    churn_growth: float  # percentage
    total_subscriptions: int
    active_subscriptions: int
    churn_rate: float
    period: str  # e.g., "2026-05"


class RevenueDistribution(BaseModel):
    """Revenue breakdown by plan type."""
    plan: str
    revenue: float
    percentage: float
    subscriber_count: int


class SalesPerformer(BaseModel):
    """Top performer data."""
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    tasks_completed: int
    revenue_generated: float
    performance_score: float


class ActivityItem(BaseModel):
    """Activity feed item."""
    id: str
    action_type: str
    title: str
    user_name: Optional[str] = None
    user_avatar: Optional[str] = None
    created_at: datetime
    metadata: dict = {}


class FunnelStage(BaseModel):
    """Conversion funnel stage."""
    stage: str
    count: int
    percentage: float


class RevenueOverviewResponse(BaseModel):
    overview: RevenueOverview


class RevenueDistributionResponse(BaseModel):
    items: List[RevenueDistribution]


class SalesPerformanceResponse(BaseModel):
    performers: List[SalesPerformer]


class ActivityFeedResponse(BaseModel):
    items: List[ActivityItem]
    total: int


class FunnelResponse(BaseModel):
    stages: List[FunnelStage]


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


class DashboardAllResponse(BaseModel):
    """Combined response for all dashboard widgets in a single request."""
    revenue: RevenueOverview
    distribution: List[RevenueDistribution]
    performers: List[SalesPerformer]
    activity: List[ActivityItem]
    funnel: List[FunnelStage]

