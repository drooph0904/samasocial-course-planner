import json
from fastapi import APIRouter
from fastapi.responses import Response

from app.services.store import make_store
from app.schemas import CoursePlan

router = APIRouter(prefix="/api/sessions", tags=["plans"])


@router.patch("/{session_id}/plan")
def update_plan(session_id: str, plan: dict):
    """Replace the saved plan with the edited plan from the UI (validated)."""
    validated = CoursePlan.model_validate(plan).model_dump()
    store = make_store()
    store.save_plan(session_id, validated)
    return {"plan": validated}


@router.get("/{session_id}/plan/export")
def export_plan(session_id: str):
    store = make_store()
    plan = store.get_plan(session_id) or {}
    body = json.dumps(plan, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="course-plan-{session_id}.json"'},
    )
