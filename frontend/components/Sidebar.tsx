"use client";
import { useMemo, useState } from "react";
import { SessionSummary } from "../lib/types";

function label(s: SessionSummary): string {
  const t = (s.title || "").trim();
  return !t || t === "Untitled course" ? "New course" : t;
}

const shortcut =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘⇧O" : "Ctrl+⇧O";

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0v14h10V6" /></svg>
);

export function Sidebar({
  sessions, activeId, activeStats, open = false, onSelect, onNew, onDelete, onDeleteMany,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  activeStats: { done: number; total: number; pct: number } | null;
  open?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => sessions.filter((s) => label(s).toLowerCase().includes(query.toLowerCase())),
    [sessions, query]
  );

  const togglePick = (id: string) =>
    setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setPicked(new Set()); };
  const allPicked = filtered.length > 0 && filtered.every((s) => picked.has(s.id));
  const bulk = () => {
    if (picked.size === 0) return;
    if (!window.confirm(`Delete ${picked.size} course${picked.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    onDeleteMany([...picked]); exitSelect();
  };

  return (
    <aside className={`pane left ${open ? "open" : ""}`}>
      <div className="pane-head"><h2>Courses</h2></div>

      <div className="search">
        <span className="ic">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
        </span>
        <input placeholder="Search courses…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {selectMode ? (
        <div className="select-bar">
          <button onClick={() => setPicked(allPicked ? new Set() : new Set(filtered.map((s) => s.id)))}>
            {allPicked ? "Clear" : "All"}
          </button>
          <button onClick={exitSelect}>Cancel</button>
          <button className="danger" onClick={bulk} disabled={picked.size === 0}>Delete ({picked.size})</button>
        </div>
      ) : (
        <div className="filters">
          <button className="chip" onClick={() => sessions.length && setSelectMode(true)}>Select</button>
        </div>
      )}

      <div className="body">
        {filtered.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13, padding: 8 }}>No courses.</p>}
        {filtered.map((s) => {
          const active = !selectMode && s.id === activeId;
          const isPicked = picked.has(s.id);
          const showBar = active && activeStats;
          return (
            <div
              key={s.id}
              className={`course-card ${active ? "active" : ""} ${isPicked ? "picked" : ""}`}
              onClick={() => (selectMode ? togglePick(s.id) : onSelect(s.id))}
            >
              {selectMode ? (
                <input className="pick" type="checkbox" checked={isPicked} readOnly />
              ) : (
                <button className="del" aria-label="Delete course"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}>
                  <TrashIcon />
                </button>
              )}
              <div className="ct">{label(s)}</div>
              {showBar && (
                <>
                  <div className="bar"><i style={{ width: `${activeStats!.pct}%` }} /></div>
                  <div className="pct">{activeStats!.pct}% · {activeStats!.done} of {activeStats!.total} lessons</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button className="new-course" onClick={onNew}>
        ＋ New course <span className="kbd">{shortcut}</span>
      </button>
    </aside>
  );
}
