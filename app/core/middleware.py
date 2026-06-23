"""
Tenant context middleware.
Extracts X-Organization-Id header and validates user membership.
"""

from uuid import UUID
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware that extracts the X-Organization-Id header and stores it
    in request state for downstream access.

    Note: Actual membership validation happens in the get_current_org dependency,
    not here, because we need the authenticated user context.
    """

    # Paths that don't require tenant context
    EXCLUDED_PATHS = {
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/google",
        "/api/v1/auth/refresh",
        "/api/v1/users/me",
        "/api/v1/organizations",
        "/api/v1/settings",
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip tenant extraction for excluded paths
        if any(path.startswith(excluded) for excluded in self.EXCLUDED_PATHS):
            request.state.organization_id = None
            return await call_next(request)

        # Extract org_id from header
        org_id_header = request.headers.get("X-Organization-Id")
        if org_id_header:
            try:
                request.state.organization_id = UUID(org_id_header)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid X-Organization-Id header format"},
                )
        else:
            request.state.organization_id = None

        return await call_next(request)
