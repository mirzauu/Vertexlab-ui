"""
User service: profile CRUD.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repo import UserRepository
from app.models.user import User
from app.schemas.user import UserUpdate


class UserService:
    """User profile management."""

    def __init__(self, user_repo: UserRepository, db: AsyncSession):
        self.user_repo = user_repo
        self.db = db

    async def get_profile(self, user: User) -> User:
        """Get the current user's profile."""
        return user

    async def update_profile(self, user: User, data: UserUpdate) -> User:
        """Update the current user's profile."""
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return user

        return await self.user_repo.update(user, update_data)
