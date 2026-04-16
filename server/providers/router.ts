/**
 * Provider router — chat-provider-system task003.
 *
 * Single dispatch point for the chat route. Given a providerId + prompt +
 * settings, looks up the provider in the DB and yields StreamChunks from
 * the correct adapter:
 *
 *   - `claude-cli` providers delegate to `runClaudeStreaming`, passing the
 *     composer settings (model, effort, sessionId, cwd, systemPrompt,
 *     thinking, webSearch) through unchanged. History is NOT passed —
 *     the CLI manages conversation continuity via `--resume <sessionId>`.
 *
 *   - `openai-compatible` providers delegate to `runOpenAIStreaming`. Since
 *     HTTP providers are stateless, the router assembles the full message
 *     array: optional system prompt, capped history, then the current user
 *     prompt. The apiKey is resolved based on `auth.type`:
 *       * `api-key`  → `provider.auth.apiKey` (server-side secret)
 *       * `oauth`    → `getValidToken(provider)` (auto-refreshes if near
 *                       expiry; yields a descriptive error chunk if refresh
 *                       fails so the consumer can keep its `for await`
 *                       shape instead of handling a throw)
 *       * `none`     → undefined (local Ollama, self-hosted)
 *
 * Unknown providerId yields a single `{ type: 'system', raw: { error: ... } }`
 * chunk rather than throwing, matching the contract that the caller should
 * never need a try/catch around the generator.
 *
 * History assembly note: the caller (chat route) is responsible for sourcing
 * history from durable state. For Claude CLI, the JSONL session file IS the
 * history so the router ignores whatever is passed. For OpenAI-compatible
 * providers, the chat route currently has no server-side store of past
 * assistant turns — see the TODO in `server/routes/chat.ts` and the task003
 * report. This router accepts the assembled history as-is; wiring the actual
 * assembly is scoped to a later task.
 */
import type { StreamChunk } from "../scanner/claude-runner";
import { runClaudeStreaming } from "../scanner/claude-runner";
import { runOpenAIStreaming } from "./openai-adapter";
import { getValidToken } from "./oauth";
import { getDB } from "../db";
import type { ProviderMessage } from "./types";

/**
 * Maximum number of prior messages forwarded to OpenAI-compatible providers.
 * Keeping this as a single exported constant so the cap is easy to tune (and
 * trivial to assert against in tests). 50 was chosen as a reasonable bound
 * that keeps us well under the context window of every mainstream model
 * without requiring a token-aware estimator — a more precise cap (e.g.
 * token-count-based) is a future refinement.
 */
export const HISTORY_CAP = 50;

/**
 * Subset of `ChatSettings` the router forwards to the adapters. Defined
 * narrowly (rather than `ChatSettings`) so the caller passes only the fields
 * the runner/adapter actually consume, and to avoid depending on the client-
 * shaped `providerId`/`projectPath`/`attachments` fields that the route
 * already maps before calling us.
 */
export interface RouterSettings {
  /** Model ID passed to both adapters. */
  model?: string;
  /** Reasoning effort — Claude CLI only. */
  effort?: string;
  /** Extended thinking — Claude CLI only today. */
  thinking?: boolean;
  /** Web search — Claude CLI only today. */
  webSearch?: boolean;
  /** Custom system prompt — forwarded as system message (OpenAI) or
   *  `--append-system-prompt` (Claude CLI). */
  systemPrompt?: string;
  /** Sampling temperature — OpenAI-compatible providers only. */
  temperature?: number;
  /** CLI `--resume` session UUID for conversation continuity (Claude only). */
  sessionId?: string;
  /** Subprocess cwd (Claude only). */
  cwd?: string;
}

/** Input to `routeToProvider`. */
export interface RouteOpts {
  providerId: string;
  prompt: string;
  conversationId: string;
  settings: RouterSettings;
  /**
   * Prior turns in OpenAI role/content format, oldest first. Only used by
   * openai-compatible providers — ignored on the Claude CLI path because the
   * CLI rebuilds context from its JSONL session file.
   */
  history?: ProviderMessage[];
}

/**
 * Dispatch a chat turn to the right adapter. Yields StreamChunks from the
 * delegate; never throws — lookup / auth failures surface as a single
 * `{ type: 'system', raw: { error } }` chunk so the caller can stay in its
 * `for await` loop regardless of outcome.
 */
export async function* routeToProvider(
  opts: RouteOpts,
): AsyncGenerator<StreamChunk> {
  const { providerId, prompt, settings, history } = opts;

  const db = getDB();
  const provider = db.providers?.find((p) => p.id === providerId);
  if (!provider) {
    yield {
      type: "system",
      raw: { error: `Provider not found: ${providerId}` },
    };
    return;
  }

  if (provider.type === "claude-cli") {
    // Claude CLI ignores `history` — conversation continuity is managed by
    // the CLI's JSONL session file via `--resume <sessionId>`.
    yield* runClaudeStreaming({
      prompt,
      sessionId: settings.sessionId,
      model: settings.model,
      effort: settings.effort,
      thinking: settings.thinking,
      webSearch: settings.webSearch,
      systemPrompt: settings.systemPrompt,
      cwd: settings.cwd,
    });
    return;
  }

  if (provider.type === "openai-compatible") {
    // Resolve apiKey based on auth type. OAuth failures yield an error chunk
    // and return — never throw, so the caller's for-await loop completes.
    let apiKey: string | undefined;
    if (provider.auth.type === "api-key") {
      apiKey = provider.auth.apiKey;
    } else if (provider.auth.type === "oauth") {
      try {
        apiKey = await getValidToken(provider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield {
          type: "system",
          raw: {
            error: `OAuth token refresh failed — please re-authenticate ${provider.name}: ${msg}`,
          },
        };
        return;
      }
    }
    // auth.type === 'none' → apiKey stays undefined (Ollama, self-hosted).

    // Assemble messages: optional system prompt, capped history, current
    // user turn. Cap keeps the tail (most recent N) since OpenAI models
    // attend more strongly to recent context anyway.
    const messages: ProviderMessage[] = [];
    if (settings.systemPrompt && settings.systemPrompt.length > 0) {
      messages.push({ role: "system", content: settings.systemPrompt });
    }
    if (history && history.length > 0) {
      const capped =
        history.length > HISTORY_CAP ? history.slice(-HISTORY_CAP) : history;
      for (const m of capped) messages.push(m);
    }
    messages.push({ role: "user", content: prompt });

    yield* runOpenAIStreaming({
      provider,
      messages,
      model: settings.model ?? "",
      temperature: settings.temperature,
      stream: true,
      apiKey,
    });
    return;
  }

  // Unknown provider.type (shouldn't happen given the union, but defensive).
  yield {
    type: "system",
    raw: { error: `Unsupported provider type: ${(provider as { type: string }).type}` },
  };
}
