"""Course-plan domain models and the strict JSON schema used as the
`update_course_plan` tool input. This same shape is the DB column, the UI
render model, and the export file."""
from typing import Literal
from pydantic import BaseModel

Difficulty = Literal["beginner", "intermediate", "advanced"]
ResourceType = Literal["youtube", "blog", "docs", "exercise"]


class Resource(BaseModel):
    title: str
    url: str
    type: ResourceType
    source: str


class Lesson(BaseModel):
    title: str
    topics: list[str]
    difficulty: Difficulty
    resources: list[Resource]
    # user-driven completion; intentionally NOT in COURSE_PLAN_JSON_SCHEMA,
    # so the AI tool never sets or overwrites it. Defaults false for AI-authored plans.
    done: bool = False


class Module(BaseModel):
    title: str
    objectives: list[str]
    prerequisites: list[str]
    quiz: str = ""          # end-of-module quiz (empty = none)
    assignment: str = ""    # project-based assignment (empty = none)
    lessons: list[Lesson]


class Audience(BaseModel):
    age_group: str
    skill_level: str
    prior_knowledge: str


class Schedule(BaseModel):
    duration: str
    session_frequency: str
    session_length: str


class CoursePlan(BaseModel):
    title: str
    subject: str
    audience: Audience
    schedule: Schedule
    learning_goals: list[str]
    modules: list[Module]


def empty_plan() -> dict:
    return {
        "title": "",
        "subject": "",
        "audience": {"age_group": "", "skill_level": "", "prior_knowledge": ""},
        "schedule": {"duration": "", "session_frequency": "", "session_length": ""},
        "learning_goals": [],
        "modules": [],
    }


def _obj(props: dict) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": list(props.keys()),
        "additionalProperties": False,
    }


_RESOURCE = _obj({
    "title": {"type": "string"},
    "url": {"type": "string"},
    "type": {"type": "string", "enum": ["youtube", "blog", "docs", "exercise"]},
    "source": {"type": "string"},
})

_LESSON = _obj({
    "title": {"type": "string"},
    "topics": {"type": "array", "items": {"type": "string"}},
    "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
    "resources": {"type": "array", "items": _RESOURCE},
})

_MODULE = _obj({
    "title": {"type": "string"},
    "objectives": {"type": "array", "items": {"type": "string"}},
    "prerequisites": {"type": "array", "items": {"type": "string"}},
    "quiz": {"type": "string"},
    "assignment": {"type": "string"},
    "lessons": {"type": "array", "items": _LESSON},
})

COURSE_PLAN_JSON_SCHEMA = _obj({
    "title": {"type": "string"},
    "subject": {"type": "string"},
    "audience": _obj({
        "age_group": {"type": "string"},
        "skill_level": {"type": "string"},
        "prior_knowledge": {"type": "string"},
    }),
    "schedule": _obj({
        "duration": {"type": "string"},
        "session_frequency": {"type": "string"},
        "session_length": {"type": "string"},
    }),
    "learning_goals": {"type": "array", "items": {"type": "string"}},
    "modules": {"type": "array", "items": _MODULE},
})
