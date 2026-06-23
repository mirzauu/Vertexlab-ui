"""
Custom HTTP exceptions and global exception handlers.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class NotFoundError(AppException):
    """Resource not found."""

    def __init__(self, resource: str = "Resource", identifier: str = ""):
        detail = f"{resource} not found"
        if identifier:
            detail = f"{resource} with id '{identifier}' not found"
        super().__init__(detail=detail, status_code=404)


class ForbiddenError(AppException):
    """Access denied."""

    def __init__(self, detail: str = "You do not have permission to perform this action"):
        super().__init__(detail=detail, status_code=403)


class ConflictError(AppException):
    """Resource conflict (e.g., duplicate email)."""

    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(detail=detail, status_code=409)


class UnauthorizedError(AppException):
    """Authentication failed."""

    def __init__(self, detail: str = "Invalid credentials"):
        super().__init__(detail=detail, status_code=401)


class BadRequestError(AppException):
    """Bad request."""

    def __init__(self, detail: str = "Bad request"):
        super().__init__(detail=detail, status_code=400)


# ---------- Exception Handlers ----------


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle all custom application exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


def register_exception_handlers(app):
    """Register all custom exception handlers on the FastAPI app."""
    app.add_exception_handler(AppException, app_exception_handler)
