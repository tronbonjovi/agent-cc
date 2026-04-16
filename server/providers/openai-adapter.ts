/**
 * OpenAI-compatible streaming adapter — M11 task002.
 *
 * Wraps `fetch()` against any OpenAI-style `/v1/chat/completions` endpoint
 * (OpenAI, Ollama, vLLM, Groq, etc.) with `stream: true` and yields
 * `StreamChunk` objects in the same shape as `runClaudeStreaming`. This lets
 * the chat route broadcast chunks from either backend over the same SSE
 * channel without the consumer caring which provider produced them.
 *
 * Design notes:
 *
 *   - We use Node 18+'s native `fetch()` rather than a helper library so the
 *     adapter has zero runtime dependencies and matches what runs in the
 *     browser too (useful if we ever push this to the client).
 *
 *   - The response body is a `ReadableStream<Uint8Array>`. We read it via a
 *     reader loop, decode to text, and buffer until each `\n`-terminated
 *     line is complete — SSE frames may be split mid-line across network
 *     reads, so line-buffering is load-bearing, not defensive.
 *
 *   - Each SSE frame is `data: {json}` followed by `\n\n`. `data: [DONE]` is
 *     the terminal sentinel. `finish_reason === "stop"` is also accepted as
 *     a terminal signal since some providers (notably older Ollama builds)
 *     omit the `[DONE]` line.
 *
 *   - Error handling yields `system` chunks rather than throwing so the
 *     consumer can keep the same `for await` shape regardless of outcome.
 *     This mirrors how `runClaudeStreaming` reports lifecycle errors via
 *     its own error handling — the chat route broadcasts the raw chunk
 *     unchanged and the client renders a friendly error line.
 */
import type { StreamChunk } from "../scanner/claude-runner";
import type { ProviderRequest } from "./types";

/** Default inactivity timeout, matches the Claude runner. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Stream a chat completion from an OpenAI-compatible endpoint.
 *
 * Yields in the same `StreamChunk` shape as `runClaudeStreaming`:
 *   - `{ type: "text", raw: { content: string } }` per delta
 *   - `{ type: "done", raw: { usage? } | null }` at the end
 *   - `{ type: "system", raw: { error: string } }` on any failure
 *
 * Never throws — failures surface as system chunks so the caller's
 * `for await` loop completes naturally.
 */
export async function* runOpenAIStreaming(
  req: ProviderRequest,
): AsyncGenerator<StreamChunk> {
  const {
    provider,
    messages,
    model,
    temperature,
    apiKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  } = req;

  // Build headers. `Authorization` is only attached when the provider uses
  // api-key auth — for local Ollama / self-hosted vLLM (auth.type === "none")
  // we deliberately send no auth header.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.auth.type === "api-key" && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // Build the request body. `temperature` is only included when the caller
  // provided one — omitting lets the provider use its configured default.
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (typeof temperature === "number") body.temperature = temperature;

  const url = `${provider.baseUrl ?? ""}/v1/chat/completions`;

  // Internal abort controller so we can cancel the fetch from either an
  // external signal, an inactivity timeout, or a consumer that stops early.
  const ac = new AbortController();
  const onExternalAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", onExternalAbort);
  }

  // Inactivity timer — reset each time we read bytes off the stream.
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);
  };

  let response: Response;
  try {
    resetTimer();
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "system", raw: { error: msg } };
    return;
  }

  if (!response.ok) {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* ignore — some streams throw on .text() after partial read */
    }
    yield {
      type: "system",
      raw: {
        error: `Provider returned ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
      },
    };
    return;
  }

  if (!response.body) {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
    yield { type: "system", raw: { error: "Provider returned no response body" } };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Track the last parsed JSON chunk so we can surface usage on `done`.
  let lastParsed: Record<string, unknown> | null = null;
  let emittedDone = false;

  // Wire the internal abort controller to cancel the reader directly. The
  // fetch `signal` alone isn't enough — once fetch resolves, the returned
  // body stream isn't automatically torn down when the signal fires. Calling
  // `reader.cancel()` rejects any in-flight `reader.read()` with an error,
  // which is how both the inactivity timeout and external AbortSignal
  // paths unblock the read loop below.
  const onInternalAbort = () => {
    try {
      void reader.cancel();
    } catch {
      /* ignore */
    }
  };
  if (ac.signal.aborted) onInternalAbort();
  else ac.signal.addEventListener("abort", onInternalAbort);

  try {
    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err) {
        // AbortError comes through here when ac.abort() fires.
        if (timedOut) {
          yield {
            type: "system",
            raw: { error: `Provider streaming timed out after ${timeoutMs / 1000}s` },
          };
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          yield { type: "system", raw: { error: `aborted: ${msg}` } };
        }
        return;
      }

      // The reader returns `{ done: true }` rather than throwing when its
      // upstream stream is cancelled. Distinguish "natural end" from "we
      // aborted" by checking the internal controller state.
      if (readResult.done && ac.signal.aborted) {
        if (timedOut) {
          yield {
            type: "system",
            raw: { error: `Provider streaming timed out after ${timeoutMs / 1000}s` },
          };
        } else {
          yield { type: "system", raw: { error: "aborted" } };
        }
        return;
      }

      const { done, value } = readResult;
      if (done) break;
      resetTimer();

      buffer += decoder.decode(value, { stream: true });

      // Pull off complete `\n`-terminated lines. SSE frames end with `\n\n`
      // but we parse line-by-line and just skip the blank lines — simpler
      // than frame-level parsing and handles both `\n\n` and `\r\n\r\n`
      // variants that some servers emit.
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const line = rawLine.trim();
        if (!line) continue;
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          yield { type: "done", raw: lastParsed };
          emittedDone = true;
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // Non-JSON data line — skip rather than abort the whole stream.
          continue;
        }
        lastParsed = parsed;

        const choices = parsed.choices as
          | Array<{
              delta?: { content?: string; role?: string };
              finish_reason?: string | null;
            }>
          | undefined;
        const choice = choices?.[0];
        const delta = choice?.delta;

        if (delta && typeof delta.content === "string" && delta.content.length > 0) {
          yield {
            type: "text",
            raw: { content: delta.content },
          };
        }

        if (choice?.finish_reason === "stop") {
          yield { type: "done", raw: parsed };
          emittedDone = true;
          return;
        }
      }
    }

    // Stream closed without [DONE] / finish_reason — still surface a done
    // chunk so consumers get a consistent terminal event.
    if (!emittedDone) {
      yield { type: "done", raw: lastParsed };
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
    ac.signal.removeEventListener("abort", onInternalAbort);
    // Cancel the upstream body if the consumer stops early — otherwise the
    // underlying socket could leak until the provider times out.
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}
