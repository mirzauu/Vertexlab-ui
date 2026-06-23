"""
Generic base repository with async CRUD operations.
"""

from typing import TypeVar, Generic, Type, Optional, Sequence
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """
    Base repository providing generic CRUD operations.
    Subclasses should set the `model` class attribute.
    """

    model: Type[T]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: UUID) -> Optional[T]:
        """Get a single record by its UUID primary key."""
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(
        self,
        offset: int = 0,
        limit: int = 50,
        order_by=None,
    ) -> Sequence[T]:
        """Get all records with pagination."""
        stmt = select(self.model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count(self) -> int:
        """Count all records."""
        result = await self.db.execute(select(func.count(self.model.id)))
        return result.scalar_one()

    async def create(self, obj: T) -> T:
        """Insert a new record."""
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: T, update_data: dict) -> T:
        """Update an existing record with a dict of changes."""
        for key, value in update_data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: T) -> None:
        """Delete a record."""
        await self.db.delete(obj)
        await self.db.flush()
