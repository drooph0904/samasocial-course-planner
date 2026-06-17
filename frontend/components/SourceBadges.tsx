"use client";

export function SourceBadges({ searches }: { searches: string[] }) {
  if (!searches.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
      {searches.map((s, i) => (
        <span key={i} style={{
          fontSize: 12, background: "var(--chip-bg)", color: "var(--chip-text)",
          borderRadius: 12, padding: "3px 11px",
        }}>🔎 {s}</span>
      ))}
    </div>
  );
}
