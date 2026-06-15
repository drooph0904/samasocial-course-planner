# AI Course Planning Assistant for Mentors

A conversational AI assistant (Samasocial Technical Assignment — **Task 2**) that helps a mentor design a complete, well-structured course through guided back-and-forth. The assistant interviews the mentor, generates a structured course plan with **real, web-searched resources**, refines it on request, and exports it as JSON. The UI is a split panel: chat on the left, a live, click-to-edit course-plan preview on the right.

> Stack: **FastAPI** (Python) · **Next.js** (React/TypeScript) · **Supabase** (Postgres) · **Anthropic Claude** (`claude-opus-4-8`).

---

## What it does

**Core**
- **Intake** — asks for subject, audience (age, skill level, prior knowledge), duration & session frequency, and learning goals before generating.
- **Course generation** — structured plan: modules (titles + objectives), lesson topics, recommended **public** resources per lesson, and module-end assessments.
- **Refinement** — adjust any part via chat ("make module 2 simpler", "add a project-based assignment").
- **Live, editable preview** — the plan renders beside the chat and updates in real time; click any field to edit it.
- **Export** — download the plan as structured JSON.
- **Multi-turn memory** — the full planning conversation persists per session.

**Bonus (all implemented)**
- **Syllabus PDF import** — upload an existing syllabus; the assistant restructures it into a plan.
- **Difficulty indicator per lesson** — beginner / intermediate / advanced badges.
- **Prerequisite topics per module.**

---

## Architecture decisions

- **Agentic tool-call loop (one Claude loop per turn).** Each turn, Claude streams chat text and uses two tools:
  - **`web_search`** — Anthropic's *server-side* search tool. It returns **real, current** URLs (YouTube, blogs, docs, LeetCode/Kaggle), so resources are grounded and links don't 404. Chosen over a third-party search API (Tavily/SerpAPI) to avoid an extra key and failure surface — everything stays under the single Anthropic API. This directly serves the "no hallucination" goal.
  - **`update_course_plan`** — a **custom, strict-schema** tool whose input *is* the course-plan JSON. When Claude calls it, the backend persists the plan and pushes a live update to the preview. The strict schema guarantees valid structured output, and the tool call doubles as the live-update hook — no separate "structured output" call needed.
- **One JSON contract everywhere.** The same course-plan shape is the strict tool schema, the `plans.plan` DB column, the UI render model, and the export file (`backend/app/schemas.py` ↔ `frontend/lib/types.ts`).
- **Streaming over SSE.** The backend streams `token`, `sources`, `plan_update`, `error`, and `done` events; the frontend renders chat tokens live and re-renders the plan on `plan_update`.
- **Refinement via context.** Each turn sends the full message history plus the current plan JSON, so edits (chat-driven or manual) refine the existing plan rather than regenerating it.
- **Separation of concerns.** Frontend = presentation/edit; FastAPI = orchestration; `claude_service` = LLM loop + tools; `store` = persistence (Supabase client injected, so it's unit-testable with a fake); `pdf_service` = syllabus extraction.
- **No auth.** Sessions are accessed by ID (kept in `localStorage`) — scoped to the assignment; the design stays deploy- and auth-ready.

See the full design and the step-by-step build in [`docs/superpowers/specs/`](docs/superpowers/specs/) and [`docs/superpowers/plans/`](docs/superpowers/plans/).

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- An **Anthropic API key** with billing enabled (the `web_search` server tool is billed per search).
- A **Supabase** project (free tier is fine).

---

## Setup

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `sessions`, `messages`, and `plans` tables.
3. From **Project Settings → API**, copy the **Project URL** and the **`service_role` key** (used server-side only).

### 2. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in the values (see table below)
PYTHONPATH=. uvicorn app.main:app --reload   # serves on http://localhost:8000
```

### 3. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local             # set NEXT_PUBLIC_API_BASE if backend isn't on :8000
npm run dev                                   # serves on http://localhost:3000
```

Open **http://localhost:3000** and start planning a course.

---

## Environment variables

**`backend/.env`**

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key (billing enabled for `web_search`). |
| `ANTHROPIC_MODEL` | — | Model ID. Default `claude-opus-4-8`. Set to `claude-sonnet-4-6` for a cheaper/faster demo. |
| `SUPABASE_URL` | ✅ | Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key (server-side only). |
| `FRONTEND_ORIGIN` | — | Allowed CORS origin. Default `http://localhost:3000`. |

**`frontend/.env.local`**

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | — | Backend base URL. Default `http://localhost:8000`. |

The backend fails fast at startup with a clear message if a required variable is missing.

---

## Running tests

The backend's core logic is unit-tested **offline** — the Claude agentic loop is tested with a fake Anthropic client, and persistence with a fake Supabase client, so no API key or database is needed to run the suite:

```bash
cd backend && PYTHONPATH=. ./.venv/bin/python -m pytest -v
```

Frontend type-check + production build:

```bash
cd frontend && npm run build
```

---

## Project structure

```
samasocial-course-planner/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, router mounts
│   │   ├── config.py                # env loading + fail-fast validation
│   │   ├── schemas.py               # Pydantic models + strict COURSE_PLAN_JSON_SCHEMA
│   │   ├── prompts.py               # system prompt
│   │   ├── sse.py                   # SSE event formatting
│   │   ├── routers/                 # sessions, chat (SSE), plans, syllabus
│   │   └── services/                # claude_service, store, pdf_service
│   └── tests/                       # offline unit tests (fake clients)
├── frontend/
│   ├── app/{layout,page}.tsx        # split-panel page
│   ├── components/                  # ChatPanel, PlanPreview, SourceBadges, EditableField
│   └── lib/                         # api client, SSE reader, shared types
├── supabase/schema.sql              # sessions, messages, plans
└── docs/superpowers/                # design spec + implementation plan
```

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/sessions` | Create a planning session |
| `GET` | `/api/sessions/{id}` | Load session + messages + current plan |
| `POST` | `/api/sessions/{id}/chat` | Send a message → **SSE** stream |
| `PATCH` | `/api/sessions/{id}/plan` | Save manual field edits |
| `GET` | `/api/sessions/{id}/plan/export` | Download plan JSON |
| `POST` | `/api/sessions/{id}/syllabus` | Upload syllabus PDF → restructure (bonus) |

SSE events on `/chat`: `token`, `sources`, `plan_update`, `error`, `done`.

---

## Known limitations / next steps

- **No authentication.** Sessions are keyed by an ID in `localStorage`. Adding Supabase Auth + row-level security per mentor is the natural next step.
- **Not deployed.** Runs locally; designed to deploy cleanly (Vercel for the frontend, Render/Railway/Fly for FastAPI, Supabase cloud for the DB).
- **`web_search` cost/latency.** Each generation may issue several billed searches; resource discovery adds latency on the first turn.
- **PDF extraction is text-only.** Scanned/image syllabi without a text layer won't extract well (no OCR).
- **Manual edits are last-write-wins.** No conflict resolution if the assistant and the mentor edit simultaneously.
