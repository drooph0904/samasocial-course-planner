"use client";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { PlanPreview } from "../components/PlanPreview";
import { Sidebar } from "../components/Sidebar";
import { ChatMessage, CoursePlan, SessionSummary } from "../lib/types";
import { useTheme } from "../lib/theme";
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

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const busyRef = useRef(false);
  busyRef.current = busy;

  // ---- session loading -------------------------------------------------------

  async function loadSession(id: string) {
    setActiveId(id);
    localStorage.setItem("activeSessionId", id);
    setStreaming(""); setSearches([]); setError(null);
    const s = await getSession(id);
    if (s.error) return;
    setMessages(s.messages.map((m: any) => ({ role: m.role, content: m.content })));
    setPlan(s.plan);
  }

  async function refreshSessions(): Promise<SessionSummary[]> {
    const list = await listSessions();
    setSessions(list);
    return list;
  }

  useEffect(() => {
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        const saved = localStorage.getItem("activeSessionId");
        const pick = list.find((s) => s.id === saved) ?? list[0];
        await loadSession(pick.id);
      } else {
        await newCourse();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keyboard shortcut: Cmd/Ctrl+Shift+O -> new course ---------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (!busyRef.current) newCourse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- session actions -------------------------------------------------------

  async function newCourse() {
    const created = await createSession();
    setSessions((prev) => [{ id: created.id, title: created.title }, ...prev]);
    setMessages([]);
    await loadSession(created.id);
  }

  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? This removes its chat and plan permanently.")) return;
    await deleteSession(id);
    await afterRemoval(sessions.filter((s) => s.id !== id), id);
  }

  async function deleteManyCourses(ids: string[]) {
    await deleteSessions(ids);
    const removed = new Set(ids);
    await afterRemoval(sessions.filter((s) => !removed.has(s.id)), activeId ?? "");
  }

  /** Shared cleanup after deleting one or many sessions. */
  async function afterRemoval(remaining: SessionSummary[], removedActive: string) {
    setSessions(remaining);
    const activeGone = !remaining.some((s) => s.id === activeId);
    if (activeGone) {
      if (remaining.length > 0) await loadSession(remaining[0].id);
      else await newCourse();
    }
  }

  // ---- streaming -------------------------------------------------------------

  async function streamFrom(resp: Response) {
    setStreaming(""); setSearches([]); setError(null); setBusy(true);
    let acc = "";
    await readSSE(resp, (event, data) => {
      if (event === "token") { acc += data.text; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...data.searches]);
      else if (event === "plan_update") {
        setPlan(data.plan);
        const title = (data.plan?.title ?? "").trim();
        if (title) {
          const id = activeIdRef.current;
          setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
        }
      }
      else if (event === "error") setError(data.message);
    });
    if (acc.trim()) setMessages((m) => [...m, { role: "assistant", content: acc.trim() }]);
    setStreaming(""); setBusy(false);
  }

  async function onSend(text: string) {
    if (!activeId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    const resp = await fetch(chatUrl(activeId), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    await streamFrom(resp);
  }

  async function onImport(file: File) {
    if (!activeId) return;
    const fd = new FormData(); fd.append("file", file);
    const resp = await fetch(syllabusUrl(activeId), { method: "POST", body: fd });
    await streamFrom(resp);
  }

  async function onPlanChange(next: CoursePlan) {
    if (!activeId) return;
    setPlan(next);
    await patchPlan(activeId, next);
  }

  // ---- layout ----------------------------------------------------------------

  return (
    <main style={{ display: "grid", gridTemplateColumns: "260px 1fr 1fr", height: "100vh", background: "var(--bg)" }}>
      <aside style={{ height: "100vh", overflow: "hidden" }}>
        <Sidebar
          sessions={sessions} activeId={activeId}
          onSelect={(id) => id !== activeId && loadSession(id)}
          onNew={newCourse} onDelete={deleteCourse} onDeleteMany={deleteManyCourses}
          theme={theme} onToggleTheme={toggleTheme}
        />
      </aside>
      <section style={{ borderRight: "1px solid var(--border)", height: "100vh", background: "var(--bg)" }}>
        <ChatPanel messages={messages} streaming={streaming} searches={searches}
          busy={busy} error={error} onSend={onSend} />
      </section>
      <section style={{ height: "100vh", background: "var(--bg-panel)" }}>
        {plan && (
          <PlanPreview plan={plan} onChange={onPlanChange}
            onExport={() => activeId && window.open(exportUrl(activeId), "_blank")}
            onImport={onImport} />
        )}
      </section>
    </main>
  );
}
