from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import connect_db, close_db
from app.routes import health
from app.routes import auth_routes
from app.routes import admin_routes
from app.routes import assessment_routes
from app.routes import submission_routes
from app.routes import teacher_routes
from app.routes import analytics_routes
from app.routes import ocr_routes

load_dotenv()

app = FastAPI(
    title="GradeMaster AI",
    description="AI-powered grading system backend",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://192.168.0.106:5173",
        "http://192.168.0.106:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin_routes.router, prefix="/api/admin", tags=["Admin"])
app.include_router(assessment_routes.router, prefix="/api", tags=["Assessments"])
app.include_router(submission_routes.router, prefix="/api", tags=["Submissions"])
app.include_router(teacher_routes.router, tags=["Teacher"])
app.include_router(analytics_routes.router, prefix="/api", tags=["Analytics & Reports"])
app.include_router(ocr_routes.router, prefix="/api", tags=["OCR - Handwritten"])


@app.on_event("startup")
async def startup_event():
    await connect_db()


@app.on_event("shutdown")
async def shutdown_event():
    await close_db()
