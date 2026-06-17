"use client";
import { SessionSummary } from "../lib/types";

function label(s: SessionSummary): string {
  const t = (s.title || "").trim();
  if (!t || t === "Untitled course") return "New course";
  return t;
}

export function Sidebar({
  sessions, activeId, onSelect, onNew, onDelete,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f172a", color: "#e2e8f0" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #1e293b" }}>
        <button onClick={onNew} style={{ width: "100%", background: "#4f46e5", border: "none" }}>
          + New course
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 && (
          <p style={{ color: "#64748b", fontSize: 13, padding: 12 }}>No courses yet.</p>
        )}
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "10px 12px", cursor: "pointer",
                background: active ? "#1e293b" : "transparent",
                borderLeft: active ? "3px solid #4f46e5" : "3px solid transparent",
              }}
            >
              <span style={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontSize: 14, color: active ? "#fff" : "#cbd5e1",
              }}>
                {label(s)}
              </span>
              <button
                title="Delete course"
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                style={{
                  background: "transparent", border: "none", color: "#64748b",
                  padding: "2px 6px", fontSize: 14, lineHeight: 1,
                }}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #1e293b", fontSize: 11, color: "#475569" }}>
        Samasocial · Course Planner
      </div>
    </div>
  );
}
