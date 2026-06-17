"use client";
import { useState } from "react";
import { SessionSummary, Theme } from "../lib/types";

function label(s: SessionSummary): string {
  const t = (s.title || "").trim();
  if (!t || t === "Untitled course") return "New course";
  return t;
}

const shortcutHint =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘⇧O" : "Ctrl+Shift+O";

export function Sidebar({
  sessions, activeId, onSelect, onNew, onDelete, onDeleteMany, theme, onToggleTheme,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const togglePick = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const allSelected = sessions.length > 0 && selected.size === sessions.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.id)));

  const confirmBulk = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} course${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    onDeleteMany([...selected]);
    exitSelect();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}>
      {/* header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Courses</span>
          <button className="ghost" onClick={onToggleTheme} title="Toggle theme"
            style={{ padding: "4px 8px", fontSize: 13 }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {!selectMode ? (
          <>
            <button onClick={onNew} style={{ width: "100%", display: "flex", justifyContent: "center", gap: 6 }}>
              + New course <kbd style={{ background: "rgba(0,0,0,0.25)", borderColor: "transparent", color: "inherit" }}>{shortcutHint}</kbd>
            </button>
            <button className="ghost" onClick={() => setSelectMode(true)}
              disabled={sessions.length === 0}
              style={{ width: "100%", marginTop: 8, fontSize: 13 }}>
              Select
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost" onClick={toggleAll} style={{ flex: 1, fontSize: 13 }}>
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <button className="ghost" onClick={exitSelect} style={{ flex: 1, fontSize: 13 }}>
                Cancel
              </button>
            </div>
            <button className="danger" onClick={confirmBulk} disabled={selected.size === 0}
              style={{ width: "100%", fontSize: 13 }}>
              🗑 Delete selected ({selected.size})
            </button>
          </div>
        )}
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {sessions.length === 0 && (
          <p style={{ color: "var(--text-faint)", fontSize: 13, padding: 8 }}>No courses yet.</p>
        )}
        {sessions.map((s) => {
          const active = !selectMode && s.id === activeId;
          const picked = selected.has(s.id);
          return (
            <div
              key={s.id}
              onClick={() => (selectMode ? togglePick(s.id) : onSelect(s.id))}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 10px", marginBottom: 2, borderRadius: 8, cursor: "pointer",
                background: active || picked ? "var(--bg-hover)" : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                border: picked ? "1px solid var(--accent)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => { if (!active && !picked) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (!active && !picked) e.currentTarget.style.background = "transparent"; }}
            >
              {selectMode && (
                <input type="checkbox" checked={picked} readOnly
                  style={{ width: 15, height: 15, accentColor: "var(--accent)", padding: 0 }} />
              )}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
                {label(s)}
              </span>
              {!selectMode && (
                <button
                  title="Delete course"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  style={{ background: "transparent", color: "var(--text-faint)", padding: "2px 6px", fontSize: 13 }}
                >🗑</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-faint)" }}>
        Samasocial · Course Planner
      </div>
    </div>
  );
}
