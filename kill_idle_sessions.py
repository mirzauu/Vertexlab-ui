import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def main():
    print("Connecting to database to check active sessions...")
    async with AsyncSessionLocal() as session:
        # Query active pg sessions
        result = await session.execute(
            text("""
                SELECT pid, query, state, age(clock_timestamp(), query_start) as duration
                FROM pg_stat_activity
                WHERE (state = 'idle in transaction' OR state = 'active')
                  AND pid <> pg_backend_pid()
            """)
        )
        sessions = result.fetchall()
        print(f"Total active/idle-in-transaction sessions found: {len(sessions)}")
        
        for pid, query, state, duration in sessions:
            print(f"\n[PID: {pid}] | State: {state} | Duration: {duration}")
            print(f"Query: {query[:200]}")
            
            # Safely terminate this locking/stale session
            print(f"Terminating stale session PID {pid}...")
            try:
                await session.execute(text(f"SELECT pg_terminate_backend({pid})"))
                print(f"Successfully terminated PID {pid}!")
            except Exception as e:
                print(f"Error terminating PID {pid}: {e}")
                
        await session.commit()

if __name__ == "__main__":
    asyncio.run(main())
