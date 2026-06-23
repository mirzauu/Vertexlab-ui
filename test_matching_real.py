import asyncio
import sys
import os
import uuid

# Add the workspace root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import AsyncSessionLocal
from app.pipeline.steps.matching import MatchingStep
from app.pipeline.base import PipelineContext
from app.models.task import Task
from sqlalchemy import select

async def main():
    task_id = uuid.UUID("15cccd42-c72e-4515-9113-7eceee466a60")
    print(f"[INFO] Running real MatchingStep test for Task ID: {task_id}")

    async with AsyncSessionLocal() as session:
        # Fetch the Task to get organization_id and name
        res_task = await session.execute(select(Task).where(Task.id == task_id))
        task = res_task.scalar_one_or_none()
        if not task:
            print(f"[ERROR] Task {task_id} not found in DB.")
            return

        org_id = task.organization_id
        task_name = task.name
        print(f"[TASK] Task Name: {task_name}")
        print(f"[ORG] Org ID: {org_id}")

        # Initialize the pipeline context
        context = PipelineContext(
            task_id=task_id,
            organization_id=org_id
        )
        context.db = session

        # Execute the MatchingStep
        step = MatchingStep()
        print("[PROCESS] Executing MatchingStep...")
        updated_context = await step.execute(context)

        # Print matching results summary
        summary = updated_context.matching_result
        if summary:
            print("\n=== MATCHING RESULTS SUMMARY ===")
            print(f"Total Raw Chunks: {summary.get('total_raw_chunks')}")
            print(f"Total Audio Segments: {summary.get('total_audio_segments')}")
            print(f"Average Confidence: {summary.get('average_confidence')}%")
            print(f"Quality Matches: {summary.get('quality_matches')}")
            print(f"Monotonic Violations: {summary.get('monotonic_violations')}")
            print(f"Processing Time: {summary.get('processing_time_sec')}s")
            print("Status Breakdown:")
            for status, count in summary.get('status_breakdown', {}).items():
                print(f"  - {status}: {count}")

            # Test the file output saving as well
            print("\n[FILE] Testing file-saving method for the matching step...")
            from app.pipeline.orchestrator import PipelineOrchestrator
            orchestrator = PipelineOrchestrator(session)
            orchestrator._save_step_output(task_name, "matching", updated_context)
            print("[SUCCESS] File saving complete.")
        else:
            print("[ERROR] MatchingStep execution did not return a summary in the context.")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
