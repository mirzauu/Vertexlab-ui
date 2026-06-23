"""
Auth router: signup/login OTP flows, Google OAuth, token refresh.
"""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_auth_service
from app.services.auth_service import AuthService
from app.schemas.auth import (
    OTPRequest,
    OTPVerify,
    OTPSignupRequest,
    OTPSignupVerify,
    GoogleAuthRequest,
    RefreshRequest,
    TokenResponse,
    MessageResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup/request", response_model=MessageResponse)
async def signup_request(
    data: OTPSignupRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Request a signup OTP."""
    await service.request_signup_otp(
        email=data.email,
        first_name=data.first_name,
        last_name=data.last_name,
    )
    return MessageResponse(message="OTP sent successfully")


@router.post("/signup/verify", response_model=TokenResponse)
async def signup_verify(
    data: OTPSignupVerify,
    service: AuthService = Depends(get_auth_service),
):
    """Verify signup OTP and complete registration."""
    return await service.verify_signup_otp(
        email=data.email,
        code=data.code,
        first_name=data.first_name,
        last_name=data.last_name,
    )


@router.post("/login/request", response_model=MessageResponse)
async def login_request(
    data: OTPRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Request a login OTP."""
    await service.request_login_otp(email=data.email)
    return MessageResponse(message="OTP sent successfully")


@router.post("/login/verify", response_model=TokenResponse)
async def login_verify(
    data: OTPVerify,
    service: AuthService = Depends(get_auth_service),
):
    """Verify login OTP and complete authentication."""
    return await service.verify_login_otp(email=data.email, code=data.code)


@router.post("/google", response_model=TokenResponse)
async def google_auth(
    data: GoogleAuthRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Authenticate or register via Google OAuth."""
    return await service.google_auth(google_token=data.google_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Refresh an access token."""
    return await service.refresh_token(refresh_token=data.refresh_token)
