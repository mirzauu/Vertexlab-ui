import asyncio
import sys
import os

# Add the workspace root to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import AsyncSessionLocal
from app.models.pipeline import PipelineRun, PipelineStep
from app.models.transcript import Transcript
from app.models.task import Task
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        # Check transcripts
        print("=== Transcripts Table ===")
        res_tr = await session.execute(select(Transcript))
        transcripts = res_tr.scalars().all()
        print(f"Total transcripts found: {len(transcripts)}")
        for tr in transcripts:
            print(f"\nTranscript ID: {tr.id}")
            print(f"Task ID: {tr.task_id}")
            print(f"Content (is present): {tr.content is not None}")
            if tr.content:
                print(f"  Content length: {len(str(tr.content))}")
            print(f"Cleaned Content (is present): {tr.cleaned_content is not None}")
            if tr.cleaned_content:
                print(f"  Cleaned Content preview: {tr.cleaned_content[:100]}...")
            print(f"Chunks (is present): {tr.chunks is not None}")
            if tr.chunks:
                print(f"  Chunks count: {len(tr.chunks)}")
            print(f"Matches (is present): {tr.matches is not None}")
            if tr.matches:
                print(f"  Matches count: {len(tr.matches)}")
            print(f"Language: {tr.language}")
            print(f"Confidence Score: {tr.confidence_score}")

        # Check pipeline runs
        print("\n=== Pipeline Runs Table ===")
        res_run = await session.execute(select(PipelineRun))
        runs = res_run.scalars().all()
        print(f"Total pipeline runs found: {len(runs)}")
        for run in runs:
            print(f"\nRun ID: {run.id}")
            print(f"Task ID: {run.task_id}")
            print(f"Status: {run.status}")
            print(f"Error Message: {run.error_message}")
            print(f"Started At: {run.started_at}")
            print(f"Completed At: {run.completed_at}")

        # Check pipeline steps
        print("\n=== Pipeline Steps Table ===")
        res_step = await session.execute(select(PipelineStep).order_by(PipelineStep.pipeline_run_id, PipelineStep.step_order))
        steps = res_step.scalars().all()
        print(f"Total pipeline steps found: {len(steps)}")
        for step in steps:
            print(f"Run ID: {step.pipeline_run_id} | Step: {step.step_name} | Status: {step.status}")
            if step.status == "failed" or (step.metadata_json and "error" in step.metadata_json):
                print(f"  Metadata/Error: {step.metadata_json}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
