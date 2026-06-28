"""
HelpMessage repository.
"""

from typing import Sequence
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository
from app.models.help_message import HelpMessage


class HelpRepository(BaseRepository[HelpMessage]):
    model = HelpMessage

    async def get_by_organization(self, organization_id: UUID) -> Sequence[HelpMessage]:
        """Fetch all help messages for an organization, ordered by creation time."""
        result = await self.db.execute(
            select(HelpMessage)
            .where(HelpMessage.organization_id == organization_id)
            .order_by(HelpMessage.created_at.asc())
            .options(selectinload(HelpMessage.user))
        )
        return result.scalars().all()
