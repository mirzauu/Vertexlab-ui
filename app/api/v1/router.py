"""
Aggregated v1 API router — includes all sub-routers.
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.pipeline import router as pipeline_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.files import router as files_router
from app.api.v1.settings import router as settings_router
from app.api.v1.test_stt import router as test_stt_router
from app.api.v1.test_data_processing import router as test_data_processing_router
from app.api.v1.billing import router as billing_router

api_v1_router = APIRouter()

api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(tasks_router)
api_v1_router.include_router(pipeline_router)
api_v1_router.include_router(dashboard_router)
api_v1_router.include_router(files_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(test_stt_router)
api_v1_router.include_router(test_data_processing_router)
api_v1_router.include_router(billing_router)
