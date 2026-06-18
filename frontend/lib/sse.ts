export type SSEData = {
  text?: string;
  searches?: string[];
  plan?: unknown;
  message?: string;
};
/** Return true from a handler to stop reading (e.g. on a terminal event). */
export type SSEHandler = (event: string, data: SSEData) => boolean | void;

/** Reads an SSE stream from a fetch Response body and dispatches named events.
 *  Stops when the handler returns true OR the connection closes — so a proxy
 *  that holds the socket open after the final event can't hang the reader. */
export async function readSSE(resp: Response, onEvent: SSEHandler): Promise<void> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;
        let parsed: SSEData = {};
        try { parsed = JSON.parse(data); } catch { continue; } // skip malformed frame
        if (onEvent(event, parsed)) { await reader.cancel(); return; }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released/cancelled */ }
  }
}
