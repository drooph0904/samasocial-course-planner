"use client";
import { useState } from "react";

export function EditableField({
  value, onSave, multiline = false, placeholder = "—",
}: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span onClick={() => { setDraft(value); setEditing(true); }}
            style={{ cursor: "text", borderBottom: "1px dashed #cbd5e1" }}>
        {value || <em style={{ color: "#94a3b8" }}>{placeholder}</em>}
      </span>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  return multiline ? (
    <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} style={{ width: "100%" }} />
  ) : (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} style={{ width: "100%" }} />
  );
}
