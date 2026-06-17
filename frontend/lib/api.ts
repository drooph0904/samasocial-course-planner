import { CoursePlan, SessionSummary } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function createSession(title = "New course") {
  const r = await fetch(`${BASE}/api/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return r.json() as Promise<{ id: string; title: string }>;
}

export async function listSessions() {
  const r = await fetch(`${BASE}/api/sessions`);
  const d = await r.json();
  return (d.sessions ?? []) as SessionSummary[];
}

export async function deleteSession(id: string) {
  await fetch(`${BASE}/api/sessions/${id}`, { method: "DELETE" });
}

export async function deleteSessions(ids: string[]) {
  await Promise.all(ids.map((id) => deleteSession(id)));
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
