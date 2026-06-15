from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import sessions, chat, plans, syllabus

app = FastAPI(title="Samasocial Course Planner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(plans.router)
app.include_router(syllabus.router)


@app.get("/api/health")
def health():
    return {"ok": True}
