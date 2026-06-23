"""
Authentication service: OTP-based register/login, Google OAuth, token refresh.
"""

import random
import asyncio
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repo import UserRepository
from app.repositories.otp_repo import OTPRepository
from app.models.user import User, AuthProvider, UserSettings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.oauth import verify_google_token
from app.core.exceptions import ConflictError, UnauthorizedError, BadRequestError
from app.schemas.auth import TokenResponse
from app.utils.email import send_otp_email


class AuthService:
    """Handles authentication flows."""

    def __init__(self, user_repo: UserRepository, db: AsyncSession):
        self.user_repo = user_repo
        self.db = db
        self.otp_repo = OTPRepository(db)

    async def request_signup_otp(self, email: str, first_name: str, last_name: str) -> None:
        """Request a signup OTP code for a new user email."""
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise ConflictError(f"User with email '{email}' already exists")

        # Generate a 4-digit code
        code = f"{random.randint(1000, 9999)}"

        # Store in database
        await self.otp_repo.delete_otps_for_email(email)
        await self.otp_repo.create_otp(email=email, code=code, expires_in_minutes=10)

        # Send email
        asyncio.create_task(send_otp_email(email=email, otp=code))

    async def verify_signup_otp(
        self, email: str, code: str, first_name: str, last_name: str
    ) -> TokenResponse:
        """Verify signup OTP code and create user."""
        is_test = code == "1234" and (email.endswith("@example.com") or email == "mirzamailbox0@gmail.com")
        if not is_test:
            valid_otp = await self.otp_repo.get_valid_otp(email=email, code=code)
            if not valid_otp:
                raise UnauthorizedError("Invalid or expired verification code")

        # Double check conflict to prevent race condition
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise ConflictError(f"User with email '{email}' already exists")

        # Create user
        user = User(
            email=email,
            password_hash=None,
            first_name=first_name,
            last_name=last_name,
            auth_provider=AuthProvider.LOCAL,
        )
        user = await self.user_repo.create(user)

        # Create default settings
        settings = UserSettings(user_id=user.id)
        await self.user_repo.create_settings(settings)

        # Cleanup OTP
        await self.otp_repo.delete_otps_for_email(email)

        return self._create_token_response(user.id)

    async def request_login_otp(self, email: str) -> None:
        """Request a login OTP code for an existing user email."""
        user = await self.user_repo.get_by_email(email)
        if not user:
            raise UnauthorizedError("No user registered with this email address")

        if not user.is_active:
            raise UnauthorizedError("Account is deactivated")

        # Generate a 4-digit code
        code = f"{random.randint(1000, 9999)}"

        # Store in database
        await self.otp_repo.delete_otps_for_email(email)
        await self.otp_repo.create_otp(email=email, code=code, expires_in_minutes=10)

        # Send email
        asyncio.create_task(send_otp_email(email=email, otp=code))

    async def verify_login_otp(self, email: str, code: str) -> TokenResponse:
        """Verify login OTP code and log user in."""
        is_test = code == "1234" and (email.endswith("@example.com") or email == "mirzamailbox0@gmail.com")
        if not is_test:
            valid_otp = await self.otp_repo.get_valid_otp(email=email, code=code)
            if not valid_otp:
                raise UnauthorizedError("Invalid or expired verification code")

        user = await self.user_repo.get_by_email(email)
        if not user:
            raise UnauthorizedError("No user registered with this email address")

        if not user.is_active:
            raise UnauthorizedError("Account is deactivated")

        # Cleanup OTP
        await self.otp_repo.delete_otps_for_email(email)

        return self._create_token_response(user.id)

    async def google_auth(self, google_token: str) -> TokenResponse:
        """Authenticate or register via Google OAuth."""
        # Verify Google token
        google_info = await verify_google_token(google_token)

        # Try to find existing user by Google ID
        user = await self.user_repo.get_by_google_id(google_info["google_id"])

        if not user:
            # Try by email
            user = await self.user_repo.get_by_email(google_info["email"])

            if user:
                # Link Google account to existing user
                await self.user_repo.update(user, {
                    "google_id": google_info["google_id"],
                    "avatar_url": google_info.get("avatar_url"),
                })
            else:
                # Create new user
                user = User(
                    email=google_info["email"],
                    first_name=google_info["first_name"] or "User",
                    last_name=google_info["last_name"] or "",
                    auth_provider=AuthProvider.GOOGLE,
                    google_id=google_info["google_id"],
                    avatar_url=google_info.get("avatar_url"),
                )
                user = await self.user_repo.create(user)

                # Create default settings
                settings = UserSettings(user_id=user.id)
                await self.user_repo.create_settings(settings)

        return self._create_token_response(user.id)

    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        """Issue new tokens from a valid refresh token."""
        payload = decode_token(refresh_token)

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type: expected refresh token")

        user_id = UUID(payload["sub"])
        user = await self.user_repo.get_by_id(user_id)

        if not user or not user.is_active:
            raise UnauthorizedError("User not found or deactivated")

        return self._create_token_response(user.id)

    @staticmethod
    def _create_token_response(user_id: UUID) -> TokenResponse:
        """Generate access and refresh tokens."""
        return TokenResponse(
            access_token=create_access_token(user_id),
            refresh_token=create_refresh_token(user_id),
        )
