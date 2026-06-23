"""
Auth request/response schemas.
"""

from pydantic import BaseModel, EmailStr, Field


class OTPRequest(BaseModel):
    """OTP request for existing user login."""
    email: EmailStr


class OTPVerify(BaseModel):
    """OTP verification for login."""
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=4)


class OTPSignupRequest(BaseModel):
    """Registration details before sending OTP."""
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)


class OTPSignupVerify(BaseModel):
    """OTP verification for signup."""
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=4)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)


class GoogleAuthRequest(BaseModel):
    """Google OAuth token exchange request."""
    google_token: str = Field(..., description="Google ID token from the client")


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
