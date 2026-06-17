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
  const [mobilePane, setMobilePane] = useState<"mid" | "right">("mid");
  const [leftOpen, setLeftOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null); activeIdRef.current = activeId;
  const busyRef = useRef(false); busyRef.current = busy;

  async function loadSession(id: string) {
    setActiveId(id); localStorage.setItem("activeSessionId", id);
    setStreaming(""); setSearches([]); setError(null); setLeftOpen(false);
    const s = await getSession(id);
    if (s.error) return;
    setMessages(s.messages.map((m: any) => ({ role: m.role, content: m.content })));
    setPlan(s.plan);
  }
  async function refreshSessions(): Promise<SessionSummary[]> {
    const list = await listSessions(); setSessions(list); return list;
  }

  useEffect(() => {
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        const saved = localStorage.getItem("activeSessionId");
        await loadSession((list.find((s) => s.id === saved) ?? list[0]).id);
      } else await newCourse();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault(); if (!busyRef.current) newCourse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newCourse() {
    const created = await createSession();
    // optimistic: a new course has empty chat + empty plan, so skip the re-fetch
    setSessions((prev) => [{ id: created.id, title: created.title }, ...prev]);
    setActiveId(created.id); localStorage.setItem("activeSessionId", created.id);
    setMessages([]); setPlan(emptyPlan());
    setStreaming(""); setSearches([]); setError(null); setLeftOpen(false);
  }
  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? This removes its chat and plan permanently.")) return;
    await deleteSession(id); await afterRemoval(sessions.filter((s) => s.id !== id));
  }
  async function deleteManyCourses(ids: string[]) {
    await deleteSessions(ids);
    const removed = new Set(ids); await afterRemoval(sessions.filter((s) => !removed.has(s.id)));
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
      if (event === "token") { acc += data.text; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...data.searches]);
      else if (event === "plan_update") {
        setPlan(data.plan);
        const title = (data.plan?.title ?? "").trim();
        if (title) { const id = activeIdRef.current; setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s))); }
      } else if (event === "error") setError(data.message);
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

  return (
    <>
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
            <span className={`dot ${saving ? "saving" : ""}`} />{saving ? "Saving…" : "Saved"}
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
        {plan && (
          <PlanPreview show={mobilePane === "right"} plan={plan}
            onChange={onPlanChange} onExport={onExport} onImport={onImport} />
        )}
      </div>
    </>
  );
}
