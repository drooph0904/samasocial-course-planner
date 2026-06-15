"use client";

export function SourceBadges({ searches }: { searches: string[] }) {
  if (!searches.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
      {searches.map((s, i) => (
        <span key={i} style={{
          fontSize: 12, background: "#eef2ff", color: "#3730a3",
          borderRadius: 12, padding: "2px 10px",
        }}>🔎 {s}</span>
      ))}
    </div>
  );
}
