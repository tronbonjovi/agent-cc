/**
 * Tests for the OpenAI-compatible streaming adapter — M11 task002.
 *
 * The adapter wraps `fetch()` against any OpenAI-style `/v1/chat/completions`
 * endpoint with `stream: true`, parses the SSE line format, and yields
 * `StreamChunk` objects in the same shape as `runClaudeStreaming` so the
 * chat route can broadcast either source over the same SSE channel.
 *
 * These tests mock `globalThis.fetch` with a `Response` whose body is a
 * `ReadableStream<Uint8Array>`. That's the exact shape Node 18+'s native
 * fetch produces, so the adapter exercises its real parsing path without
 * a live provider.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { runOpenAIStreaming } from "../server/providers/openai-adapter";
import type { ProviderConfig } from "../shared/types";
import type { StreamChunk } from "../server/scanner/claude-runner";

/** Build a ReadableStream<Uint8Array> from an array of text chunks. */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

/** Build a `fetch`-compatible Response from SSE text chunks. */
function sseResponse(chunks: string[], status = 200): Response {
  return new Response(streamFrom(chunks), {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function providerWithAuth(authType: "none" | "api-key"): ProviderConfig {
  return {
    id: "test-openai",
    name: "Test Provider",
    type: "openai-compatible",
    baseUrl: "https://api.example.test",
    auth: { type: authType },
    capabilities: { temperature: true, systemPrompt: true },
  };
}

async function collect(
  gen: AsyncGenerator<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runOpenAIStreaming", () => {
  it("yields StreamChunk objects with text deltas parsed from SSE lines", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"hello"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":" world"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const fetchMock = vi.fn(async () => sseResponse(sse));
    vi.stubGlobal("fetch", fetchMock);

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    // Filter for text chunks — role-only deltas have no content and should not
    // produce a text chunk.
    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(2);
    expect(textChunks[0].raw).toMatchObject({ content: "hello" });
    expect(textChunks[1].raw).toMatchObject({ content: " world" });
  });

  it("produces a done chunk when the stream ends with [DONE]", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"content":"ok"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(sse)));

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    const last = chunks[chunks.length - 1];
    expect(last.type).toBe("done");
  });

  it("produces a done chunk when finish_reason is 'stop' (no [DONE] sentinel)", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"content":"ok"}}]}\n\n`,
      `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(sse)));

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    const last = chunks[chunks.length - 1];
    expect(last.type).toBe("done");
  });

  it("emits a system error chunk when the response status is not 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("model not found", {
          status: 404,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "missing-model",
        stream: true,
      }),
    );

    const err = chunks.find((c) => c.type === "system");
    expect(err).toBeDefined();
    const raw = err!.raw as { error?: string };
    expect(typeof raw.error).toBe("string");
    expect(raw.error).toMatch(/404/);
  });

  it("emits a system error chunk when fetch rejects (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    const err = chunks.find((c) => c.type === "system");
    expect(err).toBeDefined();
    const raw = err!.raw as { error?: string };
    expect(raw.error).toMatch(/network down/);
  });

  it("includes Authorization: Bearer header when provider auth is api-key", async () => {
    const fetchMock = vi.fn(async () => sseResponse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = providerWithAuth("api-key");

    await collect(
      runOpenAIStreaming({
        provider,
        apiKey: "sk-test-xyz",
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test-xyz");
  });

  it("omits Authorization header when provider auth is 'none'", async () => {
    const fetchMock = vi.fn(async () => sseResponse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "llama3",
        stream: true,
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("POSTs to ${baseUrl}/v1/chat/completions with the request body", async () => {
    const fetchMock = vi.fn(async () => sseResponse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hello" }],
        model: "gpt-4",
        temperature: 0.7,
        stream: true,
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "gpt-4",
      temperature: 0.7,
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("passes through system messages verbatim in the request body", async () => {
    const fetchMock = vi.fn(async () => sseResponse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [
          { role: "system", content: "You are a helpful coding assistant." },
          { role: "user", content: "hi" },
        ],
        model: "gpt-4",
        stream: true,
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful coding assistant.",
    });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("handles SSE lines split across chunk boundaries (partial line buffering)", async () => {
    // Simulate the network slicing one SSE frame across three reads — the
    // adapter must buffer until it sees a complete `\n`-terminated line
    // before parsing.
    const sse = [
      `data: {"choices":[{"delta":{"content":"hel`,
      `lo world"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(sse)));

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0].raw).toMatchObject({ content: "hello world" });
  });

  it("supports external AbortSignal cancellation", async () => {
    // Build a stream that never closes on its own — the only way out is the
    // AbortSignal. ReadableStream.cancel() is called by the adapter when
    // the signal fires, which causes our pull to stop.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"choices":[{"delta":{"content":"x"}}]}\n\n`),
        );
        // Never close — simulates a hung upstream.
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(stream, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );

    const ac = new AbortController();
    const gen = runOpenAIStreaming({
      provider: providerWithAuth("none"),
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4",
      stream: true,
      signal: ac.signal,
    });

    // Consume the first chunk, then abort.
    const iter = gen[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.value?.type).toBe("text");

    ac.abort();

    // Drain whatever remains — should terminate with a system error chunk
    // rather than hang.
    const rest: StreamChunk[] = [];
    while (true) {
      const step = await iter.next();
      if (step.done) break;
      rest.push(step.value);
    }
    const err = rest.find((c) => c.type === "system");
    expect(err).toBeDefined();
    const raw = err!.raw as { error?: string };
    expect(raw.error).toMatch(/abort/i);
  });

  it("fires the inactivity timeout when the stream stalls", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"choices":[{"delta":{"content":"x"}}]}\n\n`),
        );
        // Never close and never enqueue again — adapter should timeout.
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(stream, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );

    const gen = runOpenAIStreaming({
      provider: providerWithAuth("none"),
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4",
      stream: true,
      timeoutMs: 1000,
    });

    const collectPromise = collect(gen);
    // Advance past the inactivity timeout.
    await vi.advanceTimersByTimeAsync(1500);
    const chunks = await collectPromise;
    vi.useRealTimers();

    const err = chunks.find((c) => c.type === "system");
    expect(err).toBeDefined();
    const raw = err!.raw as { error?: string };
    expect(raw.error).toMatch(/timed out/i);
  });

  it("captures usage data from the final chunk when present", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n\n`,
      `data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
      `data: [DONE]\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(sse)));

    const chunks = await collect(
      runOpenAIStreaming({
        provider: providerWithAuth("none"),
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4",
        stream: true,
      }),
    );

    // The done chunk should carry the usage data in raw for downstream cost
    // tracking. Consumers that don't care can ignore it.
    const done = chunks.find((c) => c.type === "done");
    expect(done).toBeDefined();
    const raw = done!.raw as { usage?: { total_tokens?: number } } | null;
    expect(raw?.usage?.total_tokens).toBe(15);
  });
});
