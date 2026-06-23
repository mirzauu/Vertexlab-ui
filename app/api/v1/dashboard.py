"""
Dashboard router: revenue, activity, sales, funnel endpoints.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_org, get_dashboard_service
from app.models.organization import Organization
from app.services.dashboard_service import DashboardService
from app.schemas.dashboard import (
    RevenueOverviewResponse,
    RevenueDistributionResponse,
    SalesPerformanceResponse,
    ActivityFeedResponse,
    FunnelResponse,
    ChatRequest,
    ChatResponse,
    DashboardAllResponse,
)

router = APIRouter(
    prefix="/organizations/{org_id}/dashboard",
    tags=["Dashboard"],
)


@router.get("/all", response_model=DashboardAllResponse)
async def get_all_dashboard(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get all dashboard data in a single request."""
    return await service.get_all(org_id)


@router.get("/revenue", response_model=RevenueOverviewResponse)
async def get_revenue(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get revenue overview (MRR, subscriptions, churn)."""
    return await service.get_revenue_overview(org_id)


@router.get("/revenue-distribution", response_model=RevenueDistributionResponse)
async def get_revenue_distribution(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get revenue breakdown by plan type."""
    return await service.get_revenue_distribution(org_id)


@router.get("/sales-performance", response_model=SalesPerformanceResponse)
async def get_sales_performance(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get top performers list."""
    return await service.get_sales_performance(org_id)


@router.get("/activity", response_model=ActivityFeedResponse)
async def get_activity(
    org_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get recent activity feed."""
    return await service.get_activity_feed(org_id, limit=limit)


@router.get("/funnel", response_model=FunnelResponse)
async def get_funnel(
    org_id: UUID,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Get task conversion funnel data."""
    return await service.get_funnel(org_id)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    org_id: UUID,
    payload: ChatRequest,
    org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dashboard_service),
):
    """Chat with the VerbaLex AI assistant using organization context."""
    reply = await service.chat_with_assistant(org_id, payload.message)
    return ChatResponse(reply=reply)
