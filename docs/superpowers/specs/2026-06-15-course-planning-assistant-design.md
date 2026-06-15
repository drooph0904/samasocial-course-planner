# AI Course Planning Assistant for Mentors — Design Spec

**Date:** 2026-06-15
**Assignment:** Samasocial Technical Assignment — Task 2
**Status:** Approved, ready for implementation planning

---

## 1. Goal

Build a conversational AI assistant that helps a mentor design a complete,
well-structured course through guided back-and-forth. The assistant interviews
the mentor, generates a structured course plan, refines it on request, and
exports it as JSON. A split-panel web UI shows chat on the left and a live,
click-to-edit course-plan preview on the right.

This is Task 2 of the assignment, built standalone.

## 2. Scope

### Core (required)
- **Intake** — assistant asks for subject, target audience (age, skill level,
  prior knowledge), duration & session frequency, learning goals/outcomes.
- **Course generation** — structured plan: modules (titles + objectives),
  lesson topics per module, recommended **public** resources per lesson
  (YouTube/blog/docs/practice exercises), module-end assessments.
- **Refinement** — mentor adjusts any part via chat ("make module 2 simpler",
  "add a project-based assignment").
- **Export** — structured JSON download + live preview that updates in real time.
- **Editable output** — mentor clicks and edits individual fields in the UI.
- **Multi-turn** — full planning context maintained across turns.
- **Structured output** — final plan is JSON, not freeform text.
- **Clean UI** — split-panel: chat | live plan preview.

### Bonus (all three in scope)
- Paste/upload an existing syllabus PDF → assistant restructures it into a plan.
- Difficulty progression indicator per lesson (beginner / intermediate / advanced).
- Prerequisite topics suggested per module.

### Out of scope
- User authentication / per-mentor accounts (sessions accessed by ID).
- Deployment (local-first; design stays deploy-ready).
- Task 1 (separate assignment task).

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python) | Orchestration, SSE streaming, Anthropic SDK |
| Frontend | Next.js (React) | Split-panel UI, SSE client |
| Database | Supabase Postgres | Sessions, messages, plans |
| LLM | Anthropic Claude | `claude-opus-4-8` (env-swappable; `claude-sonnet-4-6` cheaper/faster option) |
| Search | Claude server-side `web_search` tool (`web_search_20260209`) | Real resource links, no extra API key |

Rationale for `web_search` over a third-party search API (Tavily/SerpAPI):
real, current URLs with citations, no broken/hallucinated links, no additional
key or failure surface — everything stays under the single Anthropic API. This
directly serves the "no hallucination" evaluation criterion (30%).

## 4. Core architecture — agentic tool-call loop

Each chat turn runs one streaming Claude agentic loop with two tools:

1. **`web_search`** (Anthropic server-side) — finds real public resources.
2. **`update_course_plan`** (custom, `strict: true`) — its `input_schema` *is*
   the course-plan JSON. When Claude calls it, the backend persists the plan to
   Supabase and emits a `plan_update` SSE event; the tool result returned to
   Claude is a short `"Plan saved."` so the loop can continue.

```
user message ──> Claude (streaming, adaptive thinking)
  ├─ streams chat text  (intake questions / explanations)        ──> SSE: token
  ├─ [web_search]       finds real YouTube/docs/LeetCode links   ──> SSE: sources
  └─ [update_course_plan(plan)]  (strict JSON schema)
        └─ backend saves plan to Supabase                        ──> SSE: plan_update
                                                                  ──> SSE: done
```

Why this approach: it unifies streaming chat, real web search, guaranteed-valid
structured JSON, and live preview updates in a single loop. The custom tool's
strict input schema gives schema-guaranteed structured output *and* a natural
hook to push live updates — no separate "structured output" call needed.

**Refinement** works because each turn sends the full message history plus the
current plan JSON into context, so Claude edits the existing plan rather than
regenerating from scratch. Manual UI edits are saved first, so the next turn
refines from the edited version.

**Grounding:** the system prompt instructs Claude to (a) ask intake questions
before generating when key inputs are missing, (b) attach only resources it
actually found via `web_search`, and (c) decline cleanly when asked for things
outside course planning.

### Streaming implementation note
Use the manual streaming agentic loop (not the auto tool-runner) because the
`update_course_plan` call must be intercepted to persist + push a live update,
and `web_search` is server-side. Loop until `stop_reason == "end_turn"`; on
`pause_turn` (server tool iteration limit) re-send to continue. Default
`max_tokens` 64000 (streaming). Parse tool inputs with a JSON parser, never
string-match.

## 5. Course-plan JSON schema (single contract)

This shape is used identically as: the strict tool input schema, the Supabase
`plans.plan` JSONB column, the live-preview render model, and the export file.

```jsonc
{
  "title": "string",
  "subject": "string",
  "audience": {
    "age_group": "string",
    "skill_level": "string",
    "prior_knowledge": "string"
  },
  "schedule": {
    "duration": "string",
    "session_frequency": "string",
    "session_length": "string"
  },
  "learning_goals": ["string"],
  "modules": [{
    "title": "string",
    "objectives": ["string"],
    "prerequisites": ["string"],            // bonus
    "assessment": "string",                 // module-end quiz/assessment
    "lessons": [{
      "title": "string",
      "topics": ["string"],
      "difficulty": "beginner|intermediate|advanced",   // bonus (enum)
      "resources": [{
        "title": "string",
        "url": "string",
        "type": "youtube|blog|docs|exercise",
        "source": "string"
      }]
    }]
  }]
}
```

**Strict-schema constraints** (per Anthropic structured-output rules): every
object sets `additionalProperties: false`; all properties listed in `required`;
no `minLength`/`maximum`/recursion; `difficulty` and resource `type` use `enum`.

## 6. Data model (Supabase Postgres)

- **`sessions`** — `id` (uuid pk), `title` (text), `created_at` (timestamptz).
- **`messages`** — `id` (uuid pk), `session_id` (fk), `role` (text),
  `content` (jsonb), `created_at` (timestamptz). Stores full multi-turn history.
- **`plans`** — `id` (uuid pk), `session_id` (fk, unique), `plan` (jsonb),
  `updated_at` (timestamptz). One current plan per session.

Defined in `supabase/schema.sql`. Accessed via `supabase_service`.

## 7. API endpoints (FastAPI)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sessions` | Create a planning session |
| GET | `/api/sessions/{id}` | Load session + messages + current plan |
| POST | `/api/sessions/{id}/chat` | Send message → **SSE stream** |
| PATCH | `/api/sessions/{id}/plan` | Apply manual field edits from UI |
| GET | `/api/sessions/{id}/plan/export` | Download plan JSON |
| POST | `/api/sessions/{id}/syllabus` | Upload syllabus PDF → restructure (bonus) |

**SSE event protocol** (`/chat`):
- `token` — `{ "text": "..." }` chat text delta
- `sources` — `{ "searches": [...] }` web searches performed (for badges)
- `plan_update` — `{ "plan": {...} }` new full plan JSON
- `error` — `{ "message": "..." }`
- `done` — end of turn

## 8. Frontend (split-panel UI)

- **Left — Chat panel:** streaming message bubbles, input box, **source badges**
  showing searches/loaded inputs, loading + error states.
- **Right — Live plan preview:** renders plan JSON; **click-to-edit** fields
  (title, objectives, topics, resources); color-coded **difficulty badges**;
  **prerequisites** section per module; **Export JSON** button; **Import
  syllabus PDF** button. Field edits PATCH the backend and re-enter context next turn.
- Empty / loading / error states throughout.

Components: `ChatPanel`, `PlanPreview`, `SourceBadges`; `lib/` holds the API
client and SSE handling.

## 9. Error handling

| Condition | Handling |
|---|---|
| Missing `ANTHROPIC_API_KEY` / Supabase env | Clear startup error |
| `web_search` failure | Degrade — plan still produced, resources flagged |
| Claude `overloaded` / `rate_limit` | SDK auto-retry (exponential backoff) |
| Claude `refusal` | Surface gracefully in chat |
| PDF parse failure | User-facing error message |
| SSE drop | Frontend reconnects + reloads session state |
| Invalid tool input | Strict schema prevents; defensive validation on persist |

## 10. Project structure

```
samasocial-course-planner/
├── backend/
│   ├── app/{main,config,schemas}.py
│   ├── app/routers/{chat,plans,syllabus}.py
│   ├── app/services/{claude_service,supabase_service,pdf_service}.py
│   ├── app/prompts/system.py
│   ├── requirements.txt
│   ├── .env.example
│   └── tests/
├── frontend/                # Next.js: app/, components/, lib/
├── supabase/schema.sql
├── docs/superpowers/specs/  # this spec
└── README.md                # setup, env vars, architecture decisions
```

## 11. Build order

1. Scaffold repo + env config + Supabase schema.
2. Backend: Claude agentic loop with the two tools (TDD plan schema + loop).
3. Backend: SSE chat endpoint + persistence (sessions/messages/plans).
4. Frontend: split panel, chat streaming, live preview.
5. Editable fields + PATCH + export.
6. Bonus: PDF syllabus import, difficulty badges, prerequisites.
7. README + demo polish.

## 12. Evaluation alignment

| Criterion | Weight | How this design scores |
|---|---|---|
| AI Quality | 30% | Real `web_search` resources, grounded prompt, strict structured output, intake-before-generate |
| Code Quality | 25% | Clear service boundaries, single JSON contract, TDD on core loop |
| UI / UX | 20% | Split panel, streaming, editable fields, loading/error states |
| Architecture | 15% | Separated concerns, env config, scalable session model |
| Bonus | 10% | All three bonus features in scope |
