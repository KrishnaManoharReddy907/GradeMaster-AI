import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings  # loads .env first; fails fast on weak secrets
from app.core.errors import register_exception_handlers
from app.core.observability import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    configure_logging,
)
from app.database import close_db, connect_db, run_migrations
from app.routes import (
    admin_routes,
    analytics_routes,
    assessment_routes,
    auth_routes,
    health,
    ocr_routes,
    question_bank_routes,
    submission_routes,
    teacher_routes,
)

configure_logging()
log = logging.getLogger("grademaster")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production and any("localhost" in o or "127.0.0.1" in o for o in settings.cors_origin_list):
        log.warning("CORS_ORIGINS still lists localhost in production; set it to the deployed frontend URL.")
    database = await connect_db()
    await run_migrations(database)
    from app.jobs.worker import start_worker, stop_worker
    await start_worker()
    try:
        yield
    finally:
        await stop_worker()
        await close_db()


app = FastAPI(
    title="GradeMaster AI",
    description="AI-assisted assessment and evaluation platform (MCQ, coding, handwritten).",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.api_docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.api_docs_enabled else None,
)

register_exception_handlers(app)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # bearer tokens, not cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin_routes.router, prefix="/api/admin", tags=["Admin"])
app.include_router(assessment_routes.router, prefix="/api", tags=["Assessments"])
app.include_router(submission_routes.router, prefix="/api", tags=["Submissions"])
app.include_router(teacher_routes.router, prefix="/api/teacher", tags=["Teacher review"])
app.include_router(question_bank_routes.router, prefix="/api/teacher", tags=["Question bank & AI authoring"])
app.include_router(analytics_routes.router, prefix="/api", tags=["Analytics & Reports"])
app.include_router(ocr_routes.router, prefix="/api", tags=["Handwritten"])
