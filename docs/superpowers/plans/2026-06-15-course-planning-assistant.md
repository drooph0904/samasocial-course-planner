# AI Course Planning Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational AI assistant (Samasocial Task 2) that interviews a mentor, generates a structured course plan via an agentic Claude loop with real web search, and shows a live, editable plan preview beside the chat — exportable as JSON.

**Architecture:** FastAPI backend runs a streaming Claude agentic loop with two tools — Anthropic's server-side `web_search` (real resource links) and a custom strict-schema `update_course_plan` tool (guaranteed-valid structured output + a hook to persist and live-push the plan). Next.js frontend is a split panel: chat (SSE stream) left, live click-to-edit plan preview right. Supabase Postgres stores sessions, messages, and the current plan.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, `anthropic` SDK, `supabase` (supabase-py), `pypdf`, `pytest`; Next.js (TypeScript, App Router), React; Supabase Postgres; Claude `claude-opus-4-8`.

---

## File structure

```
samasocial-course-planner/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app, CORS, router mounts
│   │   ├── config.py                # env loading + validation (Settings)
│   │   ├── schemas.py               # Pydantic models + COURSE_PLAN_JSON_SCHEMA
│   │   ├── prompts.py               # system prompt text
│   │   ├── sse.py                   # SSE event formatting helpers
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── sessions.py          # create/get session
│   │   │   ├── chat.py              # POST /chat -> SSE
│   │   │   ├── plans.py             # PATCH plan, GET export
│   │   │   └── syllabus.py          # POST syllabus PDF (bonus)
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── claude_service.py    # agentic loop, tool defs, event translation
│   │       ├── store.py             # Supabase persistence (sessions/messages/plans)
│   │       └── pdf_service.py       # PDF text extraction (bonus)
│   ├── tests/
│   │   ├── test_schemas.py
│   │   ├── test_sse.py
│   │   ├── test_claude_events.py
│   │   ├── test_store.py
│   │   └── test_pdf_service.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/{layout.tsx,page.tsx,globals.css}
│   ├── components/{ChatPanel,PlanPreview,SourceBadges,EditableField}.tsx
│   ├── lib/{api.ts,sse.ts,types.ts}
│   ├── package.json, tsconfig.json, next.config.js, .env.local.example
├── supabase/schema.sql
├── docs/superpowers/{specs,plans}/
└── README.md
```

---

## Phase 0 — Scaffold & config

### Task 1: Backend dependencies and env template

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py` (empty)

- [ ] **Step 1: Write `backend/requirements.txt`**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
anthropic>=0.69.0
supabase>=2.10.0
pydantic>=2.9.0
python-dotenv>=1.0.1
pypdf>=5.1.0
python-multipart>=0.0.18
pytest>=8.3.4
pytest-asyncio>=0.25.0
httpx>=0.28.1
```

- [ ] **Step 2: Write `backend/.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
FRONTEND_ORIGIN=http://localhost:3000
```

- [ ] **Step 3: Create empty `backend/app/__init__.py`**

- [ ] **Step 4: Create and activate venv, install**

Run:
```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
```
Expected: installs without error.

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/app/__init__.py
git commit -m "chore(backend): dependencies and env template"
```

---

### Task 2: Supabase schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
-- Run in the Supabase SQL editor (or psql) for your project.
create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled course',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on messages(session_id, created_at);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apply it**

Run it in the Supabase SQL editor for your project (Dashboard → SQL Editor → paste → Run). Document this step in the README.
Expected: three tables created.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): sessions, messages, plans schema"
```

---

## Phase 1 — Core domain: schema & prompts

### Task 3: Course-plan schema (Pydantic + strict JSON schema)

**Files:**
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_schemas.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_schemas.py`

```python
import json
from app.schemas import CoursePlan, COURSE_PLAN_JSON_SCHEMA, empty_plan

SAMPLE = {
    "title": "Intro to Python",
    "subject": "Python programming",
    "audience": {"age_group": "16-18", "skill_level": "beginner", "prior_knowledge": "none"},
    "schedule": {"duration": "6 weeks", "session_frequency": "2x/week", "session_length": "60 min"},
    "learning_goals": ["Write basic programs"],
    "modules": [{
        "title": "Basics",
        "objectives": ["Variables and types"],
        "prerequisites": ["Computer literacy"],
        "assessment": "Quiz on syntax",
        "lessons": [{
            "title": "Variables",
            "topics": ["int", "str"],
            "difficulty": "beginner",
            "resources": [{"title": "Python docs", "url": "https://docs.python.org",
                           "type": "docs", "source": "python.org"}],
        }],
    }],
}

def test_course_plan_roundtrips():
    plan = CoursePlan.model_validate(SAMPLE)
    assert plan.modules[0].lessons[0].difficulty == "beginner"
    assert plan.model_dump() == SAMPLE

def test_json_schema_is_strict():
    # Every object must forbid extra props (Anthropic strict-tool requirement)
    def assert_strict(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False
                # all properties must be required under strict
                assert set(node.get("required", [])) == set(node.get("properties", {}).keys())
            for v in node.values():
                assert_strict(v)
        elif isinstance(node, list):
            for v in node:
                assert_strict(v)
    assert_strict(COURSE_PLAN_JSON_SCHEMA)

def test_empty_plan_validates():
    CoursePlan.model_validate(empty_plan())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && . .venv/bin/activate && PYTHONPATH=. pytest tests/test_schemas.py -v`
Expected: FAIL — `No module named 'app.schemas'`.

- [ ] **Step 3: Write `backend/app/schemas.py`**

```python
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


class Module(BaseModel):
    title: str
    objectives: list[str]
    prerequisites: list[str]
    assessment: str
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
    "assessment": {"type": "string"},
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_schemas.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_schemas.py
git commit -m "feat(schema): course plan models and strict JSON schema"
```

---

### Task 4: System prompt

**Files:**
- Create: `backend/app/prompts.py`

- [ ] **Step 1: Write `backend/app/prompts.py`**

```python
"""System prompt for the course-planning assistant."""

SYSTEM_PROMPT = """You are a course-planning assistant for mentors and educators. \
You help a mentor design a complete, well-structured course through a guided, \
friendly back-and-forth conversation.

INTAKE FIRST. Before generating or substantially expanding a plan, make sure you \
know: the subject, the target audience (age group, skill level, prior knowledge), \
the duration and session frequency, and the learning goals/outcomes. If any of \
these are missing, ask for them — one or two concise questions at a time. Do not \
invent these details.

GENERATING THE PLAN. Once you have enough information, build the plan and save it \
by calling the `update_course_plan` tool with the full plan object. Always send the \
COMPLETE plan when you call the tool (it replaces the saved plan). The plan must \
include: modules with titles and learning objectives, lesson topics per module, \
suggested module-end assessments, prerequisite topics per module, and a difficulty \
level (beginner/intermediate/advanced) for each lesson.

RESOURCES MUST BE REAL. For recommended resources, use the `web_search` tool to find \
actual, currently-available public materials (YouTube videos, blog posts, official \
docs, and practice exercises from sites like LeetCode, HackerRank, Kaggle). Only \
attach a resource if you found it via search — never fabricate URLs. Set each \
resource's `type` to one of youtube/blog/docs/exercise and `source` to the site/host.

REFINEMENT. When the mentor asks for changes ("make module 2 simpler", "add a \
project"), modify the current plan and call `update_course_plan` again with the full \
updated plan. The mentor may also have edited fields directly; respect their edits.

AFTER SAVING. After calling `update_course_plan`, give a one or two sentence summary \
of what you changed. Keep chat replies concise.

STAY IN SCOPE. If asked something unrelated to planning a course, politely decline \
and steer back to the course.
"""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/prompts.py
git commit -m "feat(prompt): course-planning system prompt"
```

---

## Phase 2 — Config, SSE, persistence

### Task 5: Config loader

**Files:**
- Create: `backend/app/config.py`

- [ ] **Step 1: Write `backend/app/config.py`**

```python
"""Environment configuration. Fails fast with a clear message if required
variables are missing."""
import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

REQUIRED = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]


class Settings:
    def __init__(self) -> None:
        missing = [k for k in REQUIRED if not os.getenv(k)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Copy backend/.env.example to backend/.env and fill them in."
            )
        self.anthropic_api_key = os.environ["ANTHROPIC_API_KEY"]
        self.model = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
        self.supabase_url = os.environ["SUPABASE_URL"]
        self.supabase_service_key = os.environ["SUPABASE_SERVICE_KEY"]
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(config): env loader with fail-fast validation"
```

---

### Task 6: SSE event helpers

**Files:**
- Create: `backend/app/sse.py`
- Test: `backend/tests/test_sse.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_sse.py`

```python
from app.sse import sse_event

def test_sse_event_formats_named_json_event():
    out = sse_event("token", {"text": "hi"})
    assert out == 'event: token\ndata: {"text": "hi"}\n\n'

def test_sse_event_compact_json():
    out = sse_event("plan_update", {"plan": {"title": "x"}})
    assert out == 'event: plan_update\ndata: {"plan": {"title": "x"}}\n\n'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_sse.py -v`
Expected: FAIL — `No module named 'app.sse'`.

- [ ] **Step 3: Write `backend/app/sse.py`**

```python
"""Server-Sent Events formatting."""
import json
from typing import Any


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_sse.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/sse.py backend/tests/test_sse.py
git commit -m "feat(sse): event formatting helper"
```

---

### Task 7: Persistence store (Supabase)

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/store.py`
- Test: `backend/tests/test_store.py`

The store wraps supabase-py. To keep it testable, the Supabase client is injected;
the test passes a fake client.

- [ ] **Step 1: Write the failing test** in `backend/tests/test_store.py`

```python
from app.services.store import Store

class FakeTable:
    def __init__(self, db, name): self.db, self.name = db, name; self._filter=None; self._payload=None; self._op=None
    def insert(self, payload): self._op=("insert", payload); return self
    def upsert(self, payload, **kw): self._op=("upsert", payload); return self
    def update(self, payload): self._op=("update", payload); return self
    def select(self, *_a): self._op=("select", None); return self
    def eq(self, col, val): self._filter=(col, val); return self
    def order(self, *_a, **_k): return self
    def single(self): self._single=True; return self
    def execute(self):
        op, payload = self._op
        rows = self.db.setdefault(self.name, [])
        if op == "insert":
            rows.append(payload); return type("R", (), {"data": [payload]})
        if op == "upsert":
            rows[:] = [r for r in rows if r.get("session_id") != payload.get("session_id")]
            rows.append(payload); return type("R", (), {"data": [payload]})
        if op == "select":
            col, val = self._filter
            data = [r for r in rows if r.get(col) == val]
            return type("R", (), {"data": data})
        return type("R", (), {"data": []})

class FakeClient:
    def __init__(self): self.db = {}
    def table(self, name): return FakeTable(self.db, name)

def test_create_and_get_session():
    store = Store(FakeClient())
    sid = store.create_session("My course")
    assert isinstance(sid, str) and sid
    s = store.get_session(sid)
    assert s["title"] == "My course"

def test_messages_roundtrip():
    store = Store(FakeClient())
    sid = store.create_session("c")
    store.add_message(sid, "user", "hello")
    store.add_message(sid, "assistant", "hi there")
    msgs = store.get_messages(sid)
    assert [m["role"] for m in msgs] == ["user", "assistant"]

def test_plan_upsert_replaces():
    store = Store(FakeClient())
    sid = store.create_session("c")
    store.save_plan(sid, {"title": "v1"})
    store.save_plan(sid, {"title": "v2"})
    assert store.get_plan(sid)["title"] == "v2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_store.py -v`
Expected: FAIL — `No module named 'app.services.store'`.

- [ ] **Step 3: Create empty `backend/app/services/__init__.py`, then write `backend/app/services/store.py`**

```python
"""Supabase-backed persistence for sessions, messages, and plans.
The Supabase client is injected so the store is unit-testable with a fake."""
import uuid
from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, client: Any) -> None:
        self._c = client

    def create_session(self, title: str) -> str:
        sid = str(uuid.uuid4())
        self._c.table("sessions").insert(
            {"id": sid, "title": title, "created_at": _now()}
        ).execute()
        return sid

    def get_session(self, session_id: str) -> dict | None:
        res = self._c.table("sessions").select("*").eq("id", session_id).execute()
        return res.data[0] if res.data else None

    def add_message(self, session_id: str, role: str, content: Any) -> None:
        self._c.table("messages").insert({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": role,
            "content": content,
            "created_at": _now(),
        }).execute()

    def get_messages(self, session_id: str) -> list[dict]:
        res = (
            self._c.table("messages").select("*")
            .eq("session_id", session_id)
            .order("created_at").execute()
        )
        return res.data or []

    def save_plan(self, session_id: str, plan: dict) -> None:
        self._c.table("plans").upsert(
            {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "plan": plan,
                "updated_at": _now(),
            },
            on_conflict="session_id",
        ).execute()

    def get_plan(self, session_id: str) -> dict | None:
        res = self._c.table("plans").select("*").eq("session_id", session_id).execute()
        return res.data[0]["plan"] if res.data else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_store.py -v`
Expected: 3 passed.

- [ ] **Step 5: Add a real client factory** at the bottom of `store.py`

```python
def make_store() -> Store:
    from supabase import create_client
    from app.config import get_settings
    s = get_settings()
    return Store(create_client(s.supabase_url, s.supabase_service_key))
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/store.py backend/tests/test_store.py
git commit -m "feat(store): supabase persistence with injectable client"
```

---

## Phase 3 — Claude agentic loop

### Task 8: Tool definitions + message-history conversion

**Files:**
- Create: `backend/app/services/claude_service.py`
- Test: `backend/tests/test_claude_events.py` (part 1)

- [ ] **Step 1: Write the failing test** in `backend/tests/test_claude_events.py`

```python
from app.services.claude_service import build_tools, to_anthropic_messages

def test_build_tools_has_web_search_and_update_plan():
    tools = build_tools()
    names_types = {(t.get("name"), t.get("type")) for t in tools}
    assert ("web_search", "web_search_20260209") in names_types
    update = next(t for t in tools if t.get("name") == "update_course_plan")
    assert update["strict"] is True
    assert update["input_schema"]["type"] == "object"

def test_history_conversion_includes_current_plan():
    history = [
        {"role": "user", "content": "Plan a python course"},
        {"role": "assistant", "content": "Sure, what audience?"},
    ]
    msgs = to_anthropic_messages(history, current_plan={"title": "Py"})
    assert msgs[0]["role"] == "user"
    # current plan is appended as context on the latest user turn or a trailing note
    assert any("Py" in str(m["content"]) for m in msgs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_claude_events.py -v`
Expected: FAIL — module/functions not defined.

- [ ] **Step 3: Write the first half of `backend/app/services/claude_service.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_claude_events.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/claude_service.py backend/tests/test_claude_events.py
git commit -m "feat(claude): tool defs and history conversion"
```

---

### Task 9: The streaming agentic loop

**Files:**
- Modify: `backend/app/services/claude_service.py` (append `run_turn`)
- Test: `backend/tests/test_claude_events.py` (part 2, with a fake Anthropic client)

The loop is an async generator yielding `(event_name, data)` tuples. It must:
stream text deltas (`token`), surface web searches (`sources`), intercept
`update_course_plan` (persist via callback + emit `plan_update`), and end with `done`.
We test the orchestration with a fake client that mimics the SDK's streaming +
tool-use shape, so no real API calls are needed.

- [ ] **Step 1: Add the failing test** to `backend/tests/test_claude_events.py`

```python
import asyncio
from app.services.claude_service import run_turn

class FakeBlock:
    def __init__(self, **kw): self.__dict__.update(kw)

class FakeFinalMessage:
    def __init__(self, stop_reason, content): self.stop_reason=stop_reason; self.content=content

class FakeStream:
    """Mimics client.messages.stream(...) context manager + async text iterator."""
    def __init__(self, text_chunks, final): self._chunks=text_chunks; self._final=final
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    @property
    def text_stream(self):
        async def gen():
            for c in self._chunks:
                yield c
        return gen()
    async def get_final_message(self): return self._final

class FakeMessages:
    def __init__(self, scripted): self._scripted=scripted; self._i=0
    def stream(self, **kw):
        s = self._scripted[self._i]; self._i+=1; return s

class FakeClient:
    def __init__(self, scripted): self.messages=FakeMessages(scripted)

def test_run_turn_streams_text_and_saves_plan():
    plan = {"title": "Py", "subject": "Python", "audience": {"age_group":"x","skill_level":"x","prior_knowledge":"x"},
            "schedule": {"duration":"x","session_frequency":"x","session_length":"x"},
            "learning_goals": [], "modules": []}
    # Turn 1: assistant emits text then a tool_use for update_course_plan -> stop_reason tool_use
    tool_block = FakeBlock(type="tool_use", name="update_course_plan", id="toolu_1", input=plan)
    text_block = FakeBlock(type="text", text="Here is your plan.")
    stream1 = FakeStream(["Here ", "is your plan."],
                         FakeFinalMessage("tool_use", [text_block, tool_block]))
    # Turn 2: after tool result, assistant wraps up -> end_turn
    stream2 = FakeStream(["All set!"], FakeFinalMessage("end_turn", [FakeBlock(type="text", text="All set!")]))
    client = FakeClient([stream1, stream2])

    saved = {}
    async def save(p): saved["plan"] = p

    async def collect():
        out = []
        async for ev in run_turn(client, "claude-x", [{"role":"user","content":"plan"}], None, save):
            out.append(ev)
        return out

    events = asyncio.run(collect())
    names = [e[0] for e in events]
    assert "token" in names
    assert "plan_update" in names
    assert names[-1] == "done"
    assert saved["plan"]["title"] == "Py"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_claude_events.py::test_run_turn_streams_text_and_saves_plan -v`
Expected: FAIL — `run_turn` not defined.

- [ ] **Step 3: Append `run_turn` to `backend/app/services/claude_service.py`**

```python
from collections.abc import Awaitable, Callable

MAX_ITERS = 8


async def run_turn(
    client: Any,
    model: str,
    messages: list[dict],
    current_plan: dict | None,
    save_plan: Callable[[dict], Awaitable[None]],
) -> AsyncIterator[tuple[str, dict]]:
    """Run one chat turn as a streaming agentic loop. Yields (event, data) pairs:
    token, sources, plan_update, error, done."""
    convo = to_anthropic_messages(messages, current_plan)
    tools = build_tools()

    try:
        for _ in range(MAX_ITERS):
            async with client.messages.stream(
                model=model,
                max_tokens=64000,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                tools=tools,
                messages=convo,
            ) as stream:
                async for chunk in stream.text_stream:
                    yield ("token", {"text": chunk})
                final = await stream.get_final_message()

            # Surface any web searches performed (for source badges)
            searches = [
                b.input.get("query")
                for b in final.content
                if getattr(b, "type", None) == "server_tool_use"
                and getattr(b, "name", None) == "web_search"
                and isinstance(getattr(b, "input", None), dict)
            ]
            if searches:
                yield ("sources", {"searches": searches})

            if final.stop_reason == "pause_turn":
                # server tool loop limit — re-send to continue
                convo.append({"role": "assistant", "content": final.content})
                continue

            tool_uses = [
                b for b in final.content
                if getattr(b, "type", None) == "tool_use"
            ]
            if final.stop_reason == "tool_use" and tool_uses:
                convo.append({"role": "assistant", "content": final.content})
                results = []
                for tu in tool_uses:
                    if tu.name == "update_course_plan":
                        await save_plan(tu.input)
                        yield ("plan_update", {"plan": tu.input})
                        results.append({
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": "Plan saved.",
                        })
                convo.append({"role": "user", "content": results})
                continue

            # end_turn / refusal / anything else terminal
            if final.stop_reason == "refusal":
                yield ("token", {"text": "\n[I can't help with that request.]"})
            break
    except Exception as exc:  # surface a clean error to the client
        yield ("error", {"message": f"{type(exc).__name__}: {exc}"})

    yield ("done", {})


def make_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=get_settings().anthropic_api_key)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_claude_events.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/claude_service.py backend/tests/test_claude_events.py
git commit -m "feat(claude): streaming agentic loop with web_search + plan tool"
```

---

## Phase 4 — HTTP API

### Task 10: App entry, CORS, sessions router

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/routers/__init__.py` (empty)
- Create: `backend/app/routers/sessions.py`

- [ ] **Step 1: Write `backend/app/routers/sessions.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.store import make_store
from app.schemas import empty_plan

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSession(BaseModel):
    title: str = "Untitled course"


@router.post("")
def create_session(body: CreateSession):
    store = make_store()
    sid = store.create_session(body.title)
    store.save_plan(sid, empty_plan())
    return {"id": sid, "title": body.title}


@router.get("/{session_id}")
def get_session(session_id: str):
    store = make_store()
    session = store.get_session(session_id)
    if not session:
        return {"error": "not found"}
    return {
        "session": session,
        "messages": store.get_messages(session_id),
        "plan": store.get_plan(session_id) or empty_plan(),
    }
```

- [ ] **Step 2: Write `backend/app/main.py`** and empty `backend/app/routers/__init__.py`

```python
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
```

> Note: `chat`, `plans`, `syllabus` are created in the next tasks. To run the app
> before then, temporarily comment their imports/includes.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py backend/app/routers/__init__.py backend/app/routers/sessions.py
git commit -m "feat(api): app entry, CORS, sessions router"
```

---

### Task 11: Chat SSE router

**Files:**
- Create: `backend/app/routers/chat.py`

- [ ] **Step 1: Write `backend/app/routers/chat.py`**

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.services.store import make_store
from app.services.claude_service import run_turn, make_client
from app.sse import sse_event

router = APIRouter(prefix="/api/sessions", tags=["chat"])


class ChatBody(BaseModel):
    message: str


@router.post("/{session_id}/chat")
async def chat(session_id: str, body: ChatBody):
    store = make_store()
    client = make_client()
    model = get_settings().model

    store.add_message(session_id, "user", body.message)
    history = [{"role": m["role"], "content": m["content"]}
               for m in store.get_messages(session_id)]
    current_plan = store.get_plan(session_id)

    async def save_plan(plan: dict) -> None:
        store.save_plan(session_id, plan)

    async def event_stream():
        assistant_text: list[str] = []
        async for event, data in run_turn(
            client, model, history, current_plan, save_plan
        ):
            if event == "token":
                assistant_text.append(data["text"])
            yield sse_event(event, data)
        # persist the assistant's chat text for multi-turn continuity
        text = "".join(assistant_text).strip()
        if text:
            store.add_message(session_id, "assistant", text)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 2: Manual smoke test**

Run backend: `cd backend && . .venv/bin/activate && PYTHONPATH=. uvicorn app.main:app --reload`
In another shell, create a session and stream a chat:
```bash
SID=$(curl -s -X POST localhost:8000/api/sessions -H 'content-type: application/json' -d '{"title":"Py"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -N -X POST localhost:8000/api/sessions/$SID/chat -H 'content-type: application/json' -d '{"message":"Plan a 4-week intro Python course for teen beginners, twice a week."}'
```
Expected: a stream of `event: token` lines, then `event: plan_update`, then `event: done`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/chat.py
git commit -m "feat(api): chat SSE endpoint with agentic loop"
```

---

### Task 12: Plans router (PATCH edit + export)

**Files:**
- Create: `backend/app/routers/plans.py`

- [ ] **Step 1: Write `backend/app/routers/plans.py`**

```python
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/plans.py
git commit -m "feat(api): plan edit (PATCH) and JSON export"
```

---

### Task 13: Syllabus PDF router (bonus)

**Files:**
- Create: `backend/app/services/pdf_service.py`
- Create: `backend/app/routers/syllabus.py`
- Test: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_pdf_service.py`

```python
import io
from pypdf import PdfWriter
from app.services.pdf_service import extract_text

def _one_page_pdf_bytes() -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO(); w.write(buf); return buf.getvalue()

def test_extract_text_returns_string():
    text = extract_text(_one_page_pdf_bytes())
    assert isinstance(text, str)

def test_extract_text_rejects_garbage():
    try:
        extract_text(b"not a pdf")
        assert False, "should have raised"
    except ValueError:
        pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_pdf_service.py -v`
Expected: FAIL — module not defined.

- [ ] **Step 3: Write `backend/app/services/pdf_service.py`**

```python
"""Extract text from an uploaded syllabus PDF."""
import io
from pypdf import PdfReader
from pypdf.errors import PdfReadError


def extract_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except (PdfReadError, Exception) as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_pdf_service.py -v`
Expected: 2 passed.

- [ ] **Step 5: Write `backend/app/routers/syllabus.py`**

```python
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.services.store import make_store
from app.services.pdf_service import extract_text
from app.services.claude_service import run_turn, make_client
from app.sse import sse_event

router = APIRouter(prefix="/api/sessions", tags=["syllabus"])


@router.post("/{session_id}/syllabus")
async def import_syllabus(session_id: str, file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = extract_text(raw)
    except ValueError as exc:
        async def err():
            yield sse_event("error", {"message": str(exc)})
            yield sse_event("done", {})
        return StreamingResponse(err(), media_type="text/event-stream")

    store = make_store()
    client = make_client()
    model = get_settings().model
    instruction = (
        "Here is an existing syllabus a mentor wants to restructure into a better "
        "course plan. Improve and restructure it, then save with update_course_plan. "
        "Ask follow-up questions only if essential.\n\n--- SYLLABUS ---\n" + text[:20000]
    )
    store.add_message(session_id, "user", instruction)
    history = [{"role": m["role"], "content": m["content"]}
               for m in store.get_messages(session_id)]
    current_plan = store.get_plan(session_id)

    async def save_plan(plan: dict) -> None:
        store.save_plan(session_id, plan)

    async def event_stream():
        assistant_text = []
        async for event, data in run_turn(client, model, history, current_plan, save_plan):
            if event == "token":
                assistant_text.append(data["text"])
            yield sse_event(event, data)
        text_out = "".join(assistant_text).strip()
        if text_out:
            store.add_message(session_id, "assistant", text_out)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/pdf_service.py backend/app/routers/syllabus.py backend/tests/test_pdf_service.py
git commit -m "feat(api): syllabus PDF import (bonus)"
```

---

## Phase 5 — Frontend (Next.js)

### Task 14: Scaffold Next.js app + types

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.js`
- Create: `frontend/.env.local.example`
- Create: `frontend/lib/types.ts`

- [ ] **Step 1: Scaffold**

Run:
```bash
cd frontend 2>/dev/null || mkdir -p frontend && cd frontend
npx create-next-app@latest . --ts --app --no-tailwind --no-src-dir --eslint --use-npm --no-import-alias
```
(Accept defaults; this generates `package.json`, `tsconfig.json`, `next.config.js`, `app/`.)

- [ ] **Step 2: Write `frontend/.env.local.example`**

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

- [ ] **Step 3: Write `frontend/lib/types.ts`** (mirrors the backend schema)

```typescript
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ResourceType = "youtube" | "blog" | "docs" | "exercise";

export interface Resource { title: string; url: string; type: ResourceType; source: string; }
export interface Lesson { title: string; topics: string[]; difficulty: Difficulty; resources: Resource[]; }
export interface Module { title: string; objectives: string[]; prerequisites: string[]; assessment: string; lessons: Lesson[]; }
export interface CoursePlan {
  title: string; subject: string;
  audience: { age_group: string; skill_level: string; prior_knowledge: string };
  schedule: { duration: string; session_frequency: string; session_length: string };
  learning_goals: string[];
  modules: Module[];
}
export interface ChatMessage { role: "user" | "assistant"; content: string; }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/tsconfig.json frontend/next.config.js frontend/.env.local.example frontend/lib/types.ts frontend/app
git commit -m "chore(frontend): scaffold next.js app and shared types"
```

---

### Task 15: API client + SSE reader

**Files:**
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/sse.ts`

- [ ] **Step 1: Write `frontend/lib/api.ts`**

```typescript
import { CoursePlan } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function createSession(title = "Untitled course") {
  const r = await fetch(`${BASE}/api/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return r.json() as Promise<{ id: string; title: string }>;
}

export async function getSession(id: string) {
  const r = await fetch(`${BASE}/api/sessions/${id}`);
  return r.json();
}

export async function patchPlan(id: string, plan: CoursePlan) {
  const r = await fetch(`${BASE}/api/sessions/${id}/plan`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify(plan),
  });
  return r.json() as Promise<{ plan: CoursePlan }>;
}

export function exportUrl(id: string) {
  return `${BASE}/api/sessions/${id}/plan/export`;
}

export function chatUrl(id: string) {
  return `${BASE}/api/sessions/${id}/chat`;
}

export function syllabusUrl(id: string) {
  return `${BASE}/api/sessions/${id}/syllabus`;
}
```

- [ ] **Step 2: Write `frontend/lib/sse.ts`** — a fetch-based SSE reader (POST bodies need this; EventSource is GET-only)

```typescript
export type SSEHandler = (event: string, data: any) => void;

/** Reads an SSE stream from a fetch Response body and dispatches named events. */
export async function readSSE(resp: Response, onEvent: SSEHandler): Promise<void> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/sse.ts
git commit -m "feat(frontend): api client and SSE reader"
```

---

### Task 16: EditableField + SourceBadges components

**Files:**
- Create: `frontend/components/EditableField.tsx`
- Create: `frontend/components/SourceBadges.tsx`

- [ ] **Step 1: Write `frontend/components/EditableField.tsx`**

```tsx
"use client";
import { useState } from "react";

export function EditableField({
  value, onSave, multiline = false, placeholder = "—",
}: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span onClick={() => { setDraft(value); setEditing(true); }}
            style={{ cursor: "text", borderBottom: "1px dashed #cbd5e1" }}>
        {value || <em style={{ color: "#94a3b8" }}>{placeholder}</em>}
      </span>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  return multiline ? (
    <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} style={{ width: "100%" }} />
  ) : (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} style={{ width: "100%" }} />
  );
}
```

- [ ] **Step 2: Write `frontend/components/SourceBadges.tsx`**

```tsx
"use client";

export function SourceBadges({ searches }: { searches: string[] }) {
  if (!searches.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
      {searches.map((s, i) => (
        <span key={i} style={{
          fontSize: 12, background: "#eef2ff", color: "#3730a3",
          borderRadius: 12, padding: "2px 10px",
        }}>🔎 {s}</span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/EditableField.tsx frontend/components/SourceBadges.tsx
git commit -m "feat(frontend): editable field and source badge components"
```

---

### Task 17: PlanPreview (live, editable)

**Files:**
- Create: `frontend/components/PlanPreview.tsx`

- [ ] **Step 1: Write `frontend/components/PlanPreview.tsx`**

```tsx
"use client";
import { CoursePlan, Difficulty } from "../lib/types";
import { EditableField } from "./EditableField";

const DIFF_COLOR: Record<Difficulty, string> = {
  beginner: "#dcfce7", intermediate: "#fef9c3", advanced: "#fee2e2",
};

export function PlanPreview({
  plan, onChange, onExport, onImport,
}: {
  plan: CoursePlan;
  onChange: (p: CoursePlan) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  // helper: immutably set a deep value then bubble up
  const set = (mutate: (draft: CoursePlan) => void) => {
    const copy: CoursePlan = JSON.parse(JSON.stringify(plan));
    mutate(copy); onChange(copy);
  };

  const empty = !plan.title && plan.modules.length === 0;

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>
          <EditableField value={plan.title} placeholder="Course title"
            onSave={(v) => set((d) => { d.title = v; })} />
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ fontSize: 13, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 8px" }}>
            Import PDF
            <input type="file" accept="application/pdf" hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
          <button onClick={onExport}>Export JSON</button>
        </div>
      </div>

      {empty && <p style={{ color: "#94a3b8" }}>Your course plan will appear here as you chat. ➜</p>}

      {!empty && (
        <>
          <p><strong>Subject:</strong>{" "}
            <EditableField value={plan.subject} onSave={(v) => set((d) => { d.subject = v; })} /></p>
          <p style={{ fontSize: 13, color: "#475569" }}>
            👥 {plan.audience.age_group} · {plan.audience.skill_level} · prior: {plan.audience.prior_knowledge}<br />
            🗓 {plan.schedule.duration} · {plan.schedule.session_frequency} · {plan.schedule.session_length}
          </p>

          {plan.learning_goals.length > 0 && (
            <>
              <h4>Learning goals</h4>
              <ul>{plan.learning_goals.map((g, i) => (
                <li key={i}><EditableField value={g}
                  onSave={(v) => set((d) => { d.learning_goals[i] = v; })} /></li>
              ))}</ul>
            </>
          )}

          {plan.modules.map((m, mi) => (
            <div key={mi} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, margin: "12px 0" }}>
              <h3 style={{ marginTop: 0 }}>
                Module {mi + 1}:{" "}
                <EditableField value={m.title} onSave={(v) => set((d) => { d.modules[mi].title = v; })} />
              </h3>

              {m.prerequisites.length > 0 && (
                <p style={{ fontSize: 13 }}><strong>Prerequisites:</strong> {m.prerequisites.join(", ")}</p>
              )}

              <strong>Objectives</strong>
              <ul>{m.objectives.map((o, oi) => (
                <li key={oi}><EditableField value={o}
                  onSave={(v) => set((d) => { d.modules[mi].objectives[oi] = v; })} /></li>
              ))}</ul>

              {m.lessons.map((l, li) => (
                <div key={li} style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 10, margin: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <EditableField value={l.title} onSave={(v) => set((d) => { d.modules[mi].lessons[li].title = v; })} />
                    <span style={{ fontSize: 11, background: DIFF_COLOR[l.difficulty], borderRadius: 10, padding: "1px 8px" }}>
                      {l.difficulty}
                    </span>
                  </div>
                  {l.topics.length > 0 && <div style={{ fontSize: 13, color: "#475569" }}>{l.topics.join(" · ")}</div>}
                  {l.resources.length > 0 && (
                    <ul style={{ fontSize: 13 }}>
                      {l.resources.map((r, ri) => (
                        <li key={ri}>
                          <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{" "}
                          <span style={{ color: "#94a3b8" }}>({r.type} · {r.source})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {m.assessment && <p style={{ fontSize: 13 }}>📝 <strong>Assessment:</strong> {m.assessment}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/PlanPreview.tsx
git commit -m "feat(frontend): live editable plan preview with difficulty + prerequisites"
```

---

### Task 18: ChatPanel

**Files:**
- Create: `frontend/components/ChatPanel.tsx`

- [ ] **Step 1: Write `frontend/components/ChatPanel.tsx`**

```tsx
"use client";
import { useState } from "react";
import { ChatMessage } from "../lib/types";
import { SourceBadges } from "./SourceBadges";

export function ChatPanel({
  messages, streaming, searches, busy, error, onSend,
}: {
  messages: ChatMessage[];
  streaming: string;
  searches: string[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => { const t = text.trim(); if (t && !busy) { onSend(t); setText(""); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            👋 Tell me about the course you want to build — subject, who it's for,
            how long, and your goals.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "10px 0", textAlign: m.role === "user" ? "right" : "left" }}>
            <span style={{
              display: "inline-block", padding: "8px 12px", borderRadius: 10, maxWidth: "80%",
              background: m.role === "user" ? "#3730a3" : "#f1f5f9",
              color: m.role === "user" ? "white" : "#0f172a", whiteSpace: "pre-wrap",
            }}>{m.content}</span>
          </div>
        ))}
        <SourceBadges searches={searches} />
        {streaming && (
          <div style={{ margin: "10px 0" }}>
            <span style={{ display: "inline-block", padding: "8px 12px", borderRadius: 10,
              background: "#f1f5f9", whiteSpace: "pre-wrap" }}>{streaming}▌</span>
          </div>
        )}
        {error && <p style={{ color: "#dc2626" }}>⚠ {error}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e2e8f0" }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={busy ? "Thinking…" : "Message the assistant…"} disabled={busy}
          rows={2} style={{ flex: 1, resize: "none" }} />
        <button onClick={submit} disabled={busy}>Send</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ChatPanel.tsx
git commit -m "feat(frontend): chat panel with streaming + source badges"
```

---

### Task 19: Main page — wire it together

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css` (minimal reset)

- [ ] **Step 1: Replace `frontend/app/page.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { PlanPreview } from "../components/PlanPreview";
import { ChatMessage, CoursePlan } from "../lib/types";
import {
  createSession, getSession, patchPlan, chatUrl, syllabusUrl, exportUrl,
} from "../lib/api";
import { readSSE } from "../lib/sse";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [streaming, setStreaming] = useState("");
  const [searches, setSearches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planRef = useRef<CoursePlan | null>(null);
  planRef.current = plan;

  useEffect(() => {
    const existing = localStorage.getItem("sessionId");
    (async () => {
      if (existing) {
        const s = await getSession(existing);
        if (!s.error) {
          setSessionId(existing);
          setMessages(s.messages.map((m: any) => ({ role: m.role, content: m.content })));
          setPlan(s.plan);
          return;
        }
      }
      const created = await createSession();
      localStorage.setItem("sessionId", created.id);
      setSessionId(created.id);
      const s = await getSession(created.id);
      setPlan(s.plan);
    })();
  }, []);

  async function streamFrom(resp: Response) {
    setStreaming(""); setSearches([]); setError(null); setBusy(true);
    let acc = "";
    await readSSE(resp, (event, data) => {
      if (event === "token") { acc += data.text; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...data.searches]);
      else if (event === "plan_update") setPlan(data.plan);
      else if (event === "error") setError(data.message);
    });
    if (acc.trim()) setMessages((m) => [...m, { role: "assistant", content: acc.trim() }]);
    setStreaming(""); setBusy(false);
  }

  async function onSend(text: string) {
    if (!sessionId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    const resp = await fetch(chatUrl(sessionId), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    await streamFrom(resp);
  }

  async function onImport(file: File) {
    if (!sessionId) return;
    const fd = new FormData(); fd.append("file", file);
    const resp = await fetch(syllabusUrl(sessionId), { method: "POST", body: fd });
    await streamFrom(resp);
  }

  async function onPlanChange(next: CoursePlan) {
    if (!sessionId) return;
    setPlan(next);
    await patchPlan(sessionId, next);
  }

  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <section style={{ borderRight: "1px solid #e2e8f0", height: "100vh" }}>
        <ChatPanel messages={messages} streaming={streaming} searches={searches}
          busy={busy} error={error} onSend={onSend} />
      </section>
      <section style={{ height: "100vh" }}>
        {plan && (
          <PlanPreview plan={plan} onChange={onPlanChange}
            onExport={() => sessionId && window.open(exportUrl(sessionId), "_blank")}
            onImport={onImport} />
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Replace `frontend/app/globals.css`** with a minimal reset

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0f172a; }
button { cursor: pointer; border: 1px solid #cbd5e1; background: #3730a3; color: white; border-radius: 6px; padding: 6px 12px; }
button:disabled { background: #94a3b8; cursor: not-allowed; }
a { color: #4f46e5; }
```

- [ ] **Step 3: Run end-to-end manual test**

Backend running (Task 11). Then:
```bash
cd frontend && cp .env.local.example .env.local && npm run dev
```
Open http://localhost:3000. Type: "Plan a 4-week intro Python course for teen beginners, 2 sessions/week, goal: write small programs." Expect: streaming reply, source badges, plan filling in on the right with modules, difficulty badges, prerequisites, real resource links. Click a field to edit; refresh page → edit persists. Click Export JSON → downloads. Upload a syllabus PDF → plan restructures.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx frontend/app/globals.css
git commit -m "feat(frontend): wire split-panel app, streaming, edit, export, import"
```

---

## Phase 6 — Docs & polish

### Task 20: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** covering: project overview; architecture decisions (agentic loop, `web_search` over third-party search, single JSON contract, no-auth session model); prerequisites (Python 3.11+, Node 18+, a Supabase project, an Anthropic API key); setup — (1) create Supabase project + run `supabase/schema.sql`, (2) `backend/.env` from `.env.example`, (3) `pip install -r requirements.txt` + `uvicorn app.main:app`, (4) `frontend/.env.local` + `npm install` + `npm run dev`; environment variables table; how to run tests (`PYTHONPATH=. pytest`); known limitations / what you'd do next; link to the design spec and this plan.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup and architecture decisions"
```

---

### Task 21: Backend test sweep + final verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && . .venv/bin/activate && PYTHONPATH=. pytest -v`
Expected: all tests pass.

- [ ] **Step 2: Full manual integrity pass** (the user will do this)

Checklist: intake asks questions when info missing → generates plan → resources are real/clickable → refine ("make module 2 simpler") updates preview live → manual field edit persists → export downloads valid JSON → PDF import restructures → difficulty badges + prerequisites render → out-of-scope question declined gracefully → error states show on bad input.

- [ ] **Step 3: Commit any fixes found during verification**

```bash
git add -A && git commit -m "fix: address issues from manual verification"
```

---

## Self-review notes

- **Spec coverage:** intake (prompt + Task 9 loop), generation (Tasks 8–9, 11), refinement (history+plan context in Task 8), export (Task 12), editable output (Tasks 16–17, 19 PATCH), multi-turn (store + history), structured output (strict tool, Task 3/8), clean split UI (Task 19), all three bonuses (Task 13 PDF, Task 17 difficulty + prerequisites). All covered.
- **No placeholders:** every code step contains complete code.
- **Type consistency:** `CoursePlan`/`Module`/`Lesson`/`Resource` names and fields match across `schemas.py`, `COURSE_PLAN_JSON_SCHEMA`, `lib/types.ts`, and components. `run_turn` signature is consistent between definition (Task 9) and callers (Tasks 11, 13). SSE event names (`token`/`sources`/`plan_update`/`error`/`done`) match between `claude_service`, routers, and `page.tsx`.
