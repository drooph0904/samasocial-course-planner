# AI Course Planning Assistant for Mentors

A conversational AI assistant (Samasocial Technical Assignment — **Task 2**) that helps a mentor design a complete, well-structured course through guided back-and-forth. The assistant interviews the mentor, generates a structured course plan with **real, web-searched resources**, refines it on request, and exports it as JSON. The UI is a split panel: chat on the left, a live, click-to-edit course-plan preview on the right.

> Stack: **FastAPI** (Python) · **Next.js** (React/TypeScript) · **Supabase** (Postgres) · **OpenAI** (Responses API, `gpt-5.4`).

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

- **Agentic tool-call loop (one model turn per chat message), via OpenAI's Responses API.** Each turn the model streams chat text and uses two tools:
  - **`web_search`** — OpenAI's *hosted* web-search tool. It returns **real, current** URLs (YouTube, blogs, docs, LeetCode/Kaggle), so resources are grounded and links don't 404. Chosen over a third-party search API (Tavily/SerpAPI) to avoid an extra key and failure surface — everything stays under the single OpenAI API. This directly serves the "no hallucination" goal.
  - **`update_course_plan`** — a **custom, strict-schema** function tool whose input *is* the course-plan JSON. When the model calls it, the backend persists the plan and pushes a live update to the preview. The strict schema guarantees valid structured output, and the tool call doubles as the live-update hook — no separate "structured output" call needed.
  - The loop uses the Responses API because it's the one OpenAI surface that combines hosted web search, a strict function tool, and token streaming in a single call (continuations chain via `previous_response_id`). Per-lesson completion (`done`) is deliberately **not** in the tool schema, so the model never overwrites the mentor's progress.
- **One JSON contract everywhere.** The same course-plan shape is the strict tool schema, the `plans.plan` DB column, the UI render model, and the export file (`backend/app/schemas.py` ↔ `frontend/lib/types.ts`).
- **Streaming over SSE.** The backend streams `token`, `sources`, `plan_update`, `error`, and `done` events; the frontend renders chat tokens live and re-renders the plan on `plan_update`.
- **Refinement via context.** Each turn sends the full message history plus the current plan JSON, so edits (chat-driven or manual) refine the existing plan rather than regenerating it.
- **Separation of concerns.** Frontend = presentation/edit; FastAPI = orchestration; `llm_service` = LLM loop + tools; `store` = persistence (Supabase client injected, so it's unit-testable with a fake); `pdf_service` = syllabus extraction.
- **No auth.** Sessions are accessed by ID (kept in `localStorage`) — scoped to the assignment; the design stays deploy- and auth-ready.

See the full design and the step-by-step build in [`docs/superpowers/specs/`](docs/superpowers/specs/) and [`docs/superpowers/plans/`](docs/superpowers/plans/).

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- An **OpenAI API key** with credit (the hosted `web_search` tool is billed per search) and access to a GPT-5-class model.
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
| `OPENAI_API_KEY` | ✅ | OpenAI API key with credit (the hosted `web_search` tool is billed per search). |
| `OPENAI_MODEL` | — | Model ID. Default `gpt-5.4` (must support the Responses API web-search + function tools). |
| `SUPABASE_URL` | ✅ | Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key (server-side only). |
| `FRONTEND_ORIGIN` | — | Allowed CORS origin(s), comma-separated. Default `http://localhost:3000`. In prod set to your Vercel URL. (Vercel preview `*.vercel.app` domains are always allowed.) |

**`frontend/.env.local`**

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | — | Backend base URL. Default `http://localhost:8000`. In prod set to your Render URL. |

The backend fails fast at startup with a clear message if a required variable is missing.

---

## Running tests

The backend's core logic is unit-tested **offline** — the agentic loop is tested with a fake OpenAI client, and persistence with a fake Supabase client, so no API key or database is needed to run the suite:

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
│   │   └── services/                # llm_service, store, pdf_service, progress
│   └── tests/                       # offline unit tests (fake clients)
├── frontend/
│   ├── app/{layout,page}.tsx        # 3-pane app (courses · chat · curriculum)
│   ├── components/                  # Sidebar, ChatPanel, PlanPreview, EditableField, icons
│   └── lib/                         # api client, SSE reader, theme, progress, types
├── supabase/schema.sql              # sessions, messages, plans
├── render.yaml                      # Render blueprint for the backend
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

## Deployment (Vercel + Render)

The app deploys as two services that talk to your Supabase project: the **FastAPI backend on Render** and the **Next.js frontend on Vercel**.

### 1. Backend → Render

1. Render → **New + → Blueprint**, connect this GitHub repo. Render reads [`render.yaml`](render.yaml) and provisions the web service (root dir `backend/`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
2. In the service's **Environment**, set the secrets: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Leave `FRONTEND_ORIGIN` blank for now (set it after Vercel gives you a URL).
3. Deploy. Note the service URL, e.g. `https://samasocial-course-planner-api.onrender.com`. Verify `GET /api/health` returns `{"ok": true}`.

> Free Render instances sleep when idle, so the first request after a pause takes a few seconds to wake.

### 2. Frontend → Vercel

1. Vercel → **Add New → Project**, import this repo.
2. Set **Root Directory = `frontend`** (the Next.js app isn't at the repo root). Framework auto-detects as Next.js.
3. Add env var **`NEXT_PUBLIC_API_BASE`** = your Render URL from step 1.
4. Deploy. Vercel gives you `https://<project>.vercel.app`.

### 3. Wire CORS

Back in Render, set `FRONTEND_ORIGIN` to your Vercel URL (comma-separate multiple, e.g. `https://your-app.vercel.app`) and redeploy. (Vercel preview `*.vercel.app` URLs are already allowed via a regex.)

Make sure `supabase/schema.sql` has been run on your Supabase project (same as local setup).

---

## Known limitations / next steps

- **No authentication.** Sessions are keyed by an ID in `localStorage`. Adding Supabase Auth + row-level security per mentor is the natural next step.
- **`web_search` cost/latency.** Each generation may issue several billed searches; resource discovery adds latency on the first turn.
- **PDF extraction is text-only.** Scanned/image syllabi without a text layer won't extract well (no OCR).
- **Manual edits are last-write-wins.** No conflict resolution if the assistant and the mentor edit simultaneously.
