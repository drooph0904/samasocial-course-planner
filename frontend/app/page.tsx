"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { PlanPreview } from "../components/PlanPreview";
import { Sidebar } from "../components/Sidebar";
import { ChatMessage, CoursePlan, SessionSummary } from "../lib/types";
import { useTheme } from "../lib/theme";
import { courseStats, emptyPlan } from "../lib/progress";
import { ISun, IMoon, IShare } from "../components/icons";
import {
  createSession, getSession, listSessions, deleteSession, deleteSessions,
  patchPlan, chatUrl, syllabusUrl, exportUrl,
} from "../lib/api";
import { readSSE } from "../lib/sse";

export default function Home() {
  const [theme, toggleTheme] = useTheme();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [streaming, setStreaming] = useState("");
  const [searches, setSearches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [mobilePane, setMobilePane] = useState<"mid" | "right">("mid");
  const [leftOpen, setLeftOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null); activeIdRef.current = activeId;
  const busyRef = useRef(false); busyRef.current = busy;
  // in-memory cache of loaded courses so re-visiting is instant
  const cacheRef = useRef<Map<string, { messages: ChatMessage[]; plan: CoursePlan }>>(new Map());

  async function loadSession(id: string) {
    setActiveId(id); localStorage.setItem("activeSessionId", id);
    setStreaming(""); setSearches([]); setError(null); setLeftOpen(false);

    const cached = cacheRef.current.get(id);
    if (cached) {
      setMessages(cached.messages); setPlan(cached.plan); setLoading(false);
    } else {
      // blank immediately so the new selection never shows the previous course's progress
      setMessages([]); setPlan(null); setLoading(true);
    }

    const s = await getSession(id);
    if (id !== activeIdRef.current) return; // user switched again mid-fetch
    setLoading(false);
    if (s.error) return;
    const msgs: ChatMessage[] = s.messages.map((m: { role: ChatMessage["role"]; content: string }) => ({ role: m.role, content: m.content }));
    setMessages(msgs); setPlan(s.plan);
    cacheRef.current.set(id, { messages: msgs, plan: s.plan });
  }
  async function refreshSessions(): Promise<SessionSummary[]> {
    const list = await listSessions(); setSessions(list); return list;
  }

  function prefetchAll(list: SessionSummary[]) {
    for (const s of list) {
      if (cacheRef.current.has(s.id)) continue;
      getSession(s.id).then((data) => {
        if (!data?.error) cacheRef.current.set(s.id, {
          messages: (data.messages || []).map((m: { role: ChatMessage["role"]; content: string }) => ({ role: m.role, content: m.content })),
          plan: data.plan,
        });
      }).catch(() => {});
    }
  }

  useEffect(() => {
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        const saved = localStorage.getItem("activeSessionId");
        await loadSession((list.find((s) => s.id === saved) ?? list[0]).id);
        prefetchAll(list); // warm the cache so later switches are instant
      } else await newCourse();
    })();
  }, []);

  // keep the cache in sync with edits/streaming on the active course
  useEffect(() => {
    if (activeId && plan) cacheRef.current.set(activeId, { messages, plan });
  }, [activeId, plan, messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault(); if (!busyRef.current) newCourse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function newCourse() {
    setMutating(true);
    try {
      const created = await createSession();
      // optimistic: a new course has empty chat + empty plan, so skip the re-fetch
      setSessions((prev) => [{ id: created.id, title: created.title }, ...prev]);
      setActiveId(created.id); localStorage.setItem("activeSessionId", created.id);
      setMessages([]); setPlan(emptyPlan());
      setStreaming(""); setSearches([]); setError(null); setLeftOpen(false);
    } finally { setMutating(false); }
  }
  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? This removes its chat and plan permanently.")) return;
    setMutating(true);
    try { await deleteSession(id); await afterRemoval(sessions.filter((s) => s.id !== id)); }
    finally { setMutating(false); }
  }
  async function deleteManyCourses(ids: string[]) {
    setMutating(true);
    try {
      await deleteSessions(ids);
      const removed = new Set(ids); await afterRemoval(sessions.filter((s) => !removed.has(s.id)));
    } finally { setMutating(false); }
  }
  async function afterRemoval(remaining: SessionSummary[]) {
    setSessions(remaining);
    if (!remaining.some((s) => s.id === activeId)) {
      if (remaining.length > 0) await loadSession(remaining[0].id); else await newCourse();
    }
  }

  async function streamFrom(resp: Response) {
    setStreaming(""); setSearches([]); setError(null); setBusy(true);
    let acc = "";
    await readSSE(resp, (event, data) => {
      if (event === "token") { acc += data.text ?? ""; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...(data.searches ?? [])]);
      else if (event === "plan_update") {
        const p = data.plan as CoursePlan | undefined;
        if (!p) return;
        setPlan(p);
        const title = (p.title ?? "").trim();
        if (title) { const id = activeIdRef.current; setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s))); }
      } else if (event === "error") setError(data.message ?? "Something went wrong");
    });
    if (acc.trim()) setMessages((m) => [...m, { role: "assistant", content: acc.trim() }]);
    setStreaming(""); setBusy(false);
  }

  async function onSend(text: string) {
    if (!activeId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setMobilePane("right");
    await streamFrom(await fetch(chatUrl(activeId), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }),
    }));
  }
  const onImport = useCallback(async (file: File) => {
    if (!activeId) return;
    const fd = new FormData(); fd.append("file", file);
    await streamFrom(await fetch(syllabusUrl(activeId), { method: "POST", body: fd }));
  }, [activeId]);

  const onPlanChange = useCallback(async (next: CoursePlan) => {
    if (!activeId) return;
    setPlan(next); setSaving(true);
    try { await patchPlan(activeId, next); } finally { setSaving(false); }
  }, [activeId]);

  const onExport = useCallback(() => {
    if (activeId) window.open(exportUrl(activeId), "_blank");
  }, [activeId]);

  const stats = plan ? courseStats(plan) : null;
  const hasPlan = !!plan && plan.modules.length > 0;
  const working = busy || loading || saving || mutating;
  const statusLabel = busy ? "Generating…" : loading ? "Loading…"
    : mutating ? "Working…" : saving ? "Saving…" : "Saved";

  return (
    <>
      <div className={`toploader ${working ? "active" : ""}`} aria-hidden />
      <header className="topbar">
        <div className="brand">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setLeftOpen((v) => !v)}>☰</button>
          <div className="mark">S</div>
          <div><b>Samasocial</b> <span className="sub">Course Planner</span></div>
        </div>
        <div className="topbar-center">
          <div className="mobile-switch">
            <button className={mobilePane === "mid" ? "active" : ""} onClick={() => setMobilePane("mid")}>Chat</button>
            <button className={mobilePane === "right" ? "active" : ""} onClick={() => setMobilePane("right")}>Curriculum</button>
          </div>
        </div>
        <div className="topbar-right">
          <div className="savestate">
            {working ? <span className="spinner" /> : <span className="dot" />}{statusLabel}
          </div>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <ISun /> : <IMoon />}</button>
          <button className="btn-primary" onClick={() => activeId && window.open(exportUrl(activeId), "_blank")}><IShare /> Share</button>
        </div>
      </header>

      <div className="shell">
        <Sidebar
          open={leftOpen}
          sessions={sessions} activeId={activeId} activeStats={stats}
          onSelect={(id) => id !== activeId && loadSession(id)}
          onNew={newCourse} onDelete={deleteCourse} onDeleteMany={deleteManyCourses}
        />
        <ChatPanel show={mobilePane === "mid"} messages={messages} streaming={streaming}
          searches={searches} busy={busy} error={error} hasPlan={hasPlan} onSend={onSend} />
        {plan ? (
          <PlanPreview show={mobilePane === "right"} plan={plan}
            onChange={onPlanChange} onExport={onExport} onImport={onImport} />
        ) : (
          <section className={`pane right ${mobilePane === "right" ? "show" : ""}`}>
            <div className="empty-curr">{loading ? "Loading course…" : ""}</div>
          </section>
        )}
      </div>
    </>
  );
}
