"""
OTP repository for querying and managing one-time password records.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import select, delete, and_

from app.repositories.base import BaseRepository
from app.models.otp import OTP


class OTPRepository(BaseRepository[OTP]):
    model = OTP

    async def create_otp(self, email: str, code: str, expires_in_minutes: int = 10) -> OTP:
        """Create and store a new OTP code."""
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)
        otp = OTP(
            email=email,
            code=code,
            expires_at=expires_at,
        )
        self.db.add(otp)
        await self.db.flush()
        await self.db.refresh(otp)
        return otp

    async def get_valid_otp(self, email: str, code: str) -> Optional[OTP]:
        """Find a valid, non-expired OTP by email and code."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(OTP).where(
                and_(
                    OTP.email == email,
                    OTP.code == code,
                    OTP.expires_at > now,
                )
            ).order_by(OTP.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def delete_otps_for_email(self, email: str) -> None:
        """Delete all OTP records associated with an email."""
        await self.db.execute(
            delete(OTP).where(OTP.email == email)
        )
        await self.db.flush()
