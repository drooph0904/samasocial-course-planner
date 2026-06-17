import { ReactNode } from "react";

/** Minimal, safe markdown for chat: **bold**, *italic*, `code`, and "- " bullets.
 *  Returns React nodes (no dangerouslySetInnerHTML). */
function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g);
  return parts.filter(Boolean).map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={key}>{p.slice(1, -1)}</code>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={key}>{p.slice(1, -1)}</em>;
    return <span key={key}>{p}</span>;
  });
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];

  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={`ul-${out.length}`} className="md-list">{bullets}</ul>);
      bullets = [];
    }
  };

  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*]\s+(.*)/);
    if (m) {
      bullets.push(<li key={`li-${i}`}>{inline(m[1], `li-${i}`)}</li>);
    } else {
      flush();
      if (line.trim() === "") out.push(<br key={`br-${i}`} />);
      else out.push(<p key={`p-${i}`} className="md-p">{inline(line, `p-${i}`)}</p>);
    }
  });
  flush();
  return out;
}
