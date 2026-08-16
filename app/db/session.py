"""
Async SQLAlchemy session factory for Supabase PostgreSQL.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.config import settings

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

# Create async engine
engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependency that yields an async database session."""
    import asyncio
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except BaseException as e:
        if isinstance(e, asyncio.CancelledError):
            # If the task was cancelled, run the rollback and close inside a background task
            # to prevent CancelledError from interrupting the cleanup operations.
            async def _cleanup():
                try:
                    await session.rollback()
                except Exception:
                    pass
                finally:
                    try:
                        await session.close()
                    except Exception:
                        pass
            asyncio.create_task(_cleanup())
        else:
            try:
                await session.rollback()
            except Exception:
                pass
            raise
    finally:
        current_task = asyncio.current_task()
        if not (current_task and current_task.cancelled()):
            await session.close()

