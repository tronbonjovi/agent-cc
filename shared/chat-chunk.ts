/**
 * Shared parser for Claude stream-json chunks as emitted over the server's
 * SSE fan-out.
 *
 * Both the server persistence path (`server/routes/chat.ts`) and the client
 * live-render path (`client/src/components/chat/chat-panel.tsx`) consume
 * chunks shaped like `{ type, raw }` where `raw` is the CLI's assistant /
 * user / result envelope. Centralising extraction here stops the two sides
 * from drifting — the drift is exactly how the unified-capture shipped a
 * live-render that read `chunk.raw.text` (always undefined) while the server
 * correctly walked `chunk.raw.message.content[*].text`.
 */

export interface ChatChunk {
  type: string;
  raw?: unknown;
}

/**
 * Reach into `raw.message.content` without crashing on junk. Returns null
 * when the envelope isn't shaped like an assistant/user message so callers
 * can treat "malformed" and "no blocks" identically.
 */
export function getContentBlocks(
  raw: unknown,
): Array<Record<string, any>> | null {
  if (!raw || typeof raw !== "object") return null;
  const message = (raw as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  return content as Array<Record<string, any>>;
}

/**
 * Concatenate every text block on a `{ type: "text", raw: <assistant
 * envelope> }` chunk. The canonical wire shape is:
 *
 *   { type: "text", raw: { type: "assistant", message: { content: [
 *     { type: "text", text: "..." }
 *   ] } } }
 *
 * Returns "" for non-text chunks or malformed payloads so callers can avoid
 * guarding both the chunk type and the content shape at every call site.
 */
export function extractChunkText(chunk: ChatChunk | null | undefined): string {
  if (!chunk || chunk.type !== "text") return "";
  const content = getContentBlocks(chunk.raw);
  if (!content) return "";
  let out = "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      out += block.text;
    }
  }
  return out;
}
