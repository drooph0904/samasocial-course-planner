"use client";
import { useState } from "react";

export function EditableField({
  value, onSave, multiline = false, placeholder = "—", className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        className={`editable ${value ? "" : "empty"} ${className}`}
        title="Click to edit"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value || placeholder}
      </span>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  return multiline ? (
    <textarea className="edit-input" autoFocus value={draft} rows={2}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
  ) : (
    <input className="edit-input" autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} />
  );
}
