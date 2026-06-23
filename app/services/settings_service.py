"""
Settings service: user settings CRUD.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repo import UserRepository
from app.models.user import User, UserSettings
from app.schemas.settings import UserSettingsUpdate


class SettingsService:
    """User settings management."""

    def __init__(self, user_repo: UserRepository, db: AsyncSession):
        self.user_repo = user_repo
        self.db = db

    async def get_settings(self, user: User) -> UserSettings:
        """Get the current user's settings, creating defaults if needed."""
        settings = await self.user_repo.get_settings(user.id)
        if not settings:
            settings = UserSettings(user_id=user.id)
            settings = await self.user_repo.create_settings(settings)
        return settings

    async def update_settings(self, user: User, data: UserSettingsUpdate) -> UserSettings:
        """Update the current user's settings."""
        settings = await self.get_settings(user)
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return settings
        return await self.user_repo.update_settings(settings, update_data)
