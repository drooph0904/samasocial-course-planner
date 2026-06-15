"""The streaming agentic Claude loop: builds tools, converts history, runs the
loop, and yields SSE-ready events. Plan persistence + live push happen when
Claude calls the custom `update_course_plan` tool."""
import json
from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.prompts import SYSTEM_PROMPT
from app.schemas import COURSE_PLAN_JSON_SCHEMA


def build_tools() -> list[dict]:
    return [
        {"type": "web_search_20260209", "name": "web_search"},
        {
            "type": "custom",
            "name": "update_course_plan",
            "description": (
                "Save the complete, updated course plan. Always pass the FULL plan "
                "object; it replaces the previously saved plan."
            ),
            "strict": True,
            "input_schema": COURSE_PLAN_JSON_SCHEMA,
        },
    ]


def to_anthropic_messages(history: list[dict], current_plan: dict | None) -> list[dict]:
    """Convert stored history (role/content strings) to Anthropic message params.
    Appends the current plan JSON as context so refinement edits the existing plan."""
    msgs: list[dict] = [{"role": m["role"], "content": m["content"]} for m in history]
    if current_plan:
        note = (
            "[Current saved course plan — refine THIS when making changes]:\n"
            + json.dumps(current_plan)
        )
        if msgs and msgs[-1]["role"] == "user":
            msgs[-1] = {
                "role": "user",
                "content": f'{msgs[-1]["content"]}\n\n{note}',
            }
        else:
            msgs.append({"role": "user", "content": note})
    return msgs
