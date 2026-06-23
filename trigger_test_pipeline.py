import asyncio
import sys
import os

# Add the workspace root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import AsyncSessionLocal
from app.repositories.pipeline_repo import PipelineRepository
from app.repositories.task_repo import TaskRepository
from app.services.pipeline_service import PipelineService
from app.models.pipeline import PipelineStatus

async def main():
    task_id = "66ddda50-093b-4fdb-80da-52f694dcf0e3"
    org_id = "2bcc3f1d-eb55-4b30-b373-ac5767ad9f56" # Active org in DB
    
    print(f"Triggering execution of pipeline for Task ID: {task_id}...")
    
    async with AsyncSessionLocal() as session:
        pipeline_repo = PipelineRepository(session)
        task_repo = TaskRepository(session)
        service = PipelineService(pipeline_repo, task_repo, session)
        
        # Trigger a fresh pipeline run (which recreates step records with new PIPELINE_STEPS list)
        print("Triggering a fresh pipeline run...")
        run = await service.trigger_pipeline(task_id, org_id)
        print(f"Created fresh Pipeline Run ID: {run.id} | Status: {run.status}")
        
        # Execute the pipeline
        try:
            await service.execute_pipeline(task_id, org_id)
            print("Pipeline executed successfully!")
        except Exception as e:
            print(f"Error during pipeline execution: {e}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
