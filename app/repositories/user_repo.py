"""
User repository with email and Google ID lookups.
"""

from typing import Optional
from sqlalchemy import select

from app.repositories.base import BaseRepository
from app.models.user import User, UserSettings


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> Optional[User]:
        """Find a user by email address."""
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_by_google_id(self, google_id: str) -> Optional[User]:
        """Find a user by Google ID."""
        result = await self.db.execute(
            select(User).where(User.google_id == google_id)
        )
        return result.scalar_one_or_none()

    async def get_settings(self, user_id) -> Optional[UserSettings]:
        """Get user settings."""
        result = await self.db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_settings(self, settings: UserSettings) -> UserSettings:
        """Create user settings."""
        self.db.add(settings)
        await self.db.flush()
        await self.db.refresh(settings)
        return settings

    async def update_settings(self, settings: UserSettings, update_data: dict) -> UserSettings:
        """Update user settings."""
        for key, value in update_data.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        await self.db.flush()
        await self.db.refresh(settings)
        return settings
