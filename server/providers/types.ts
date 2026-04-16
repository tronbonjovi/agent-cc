/**
 * Shared types for provider adapters.
 *
 * `ProviderRequest` is the single input shape every provider adapter accepts.
 * Keeping the shape uniform means the chat route can switch providers based
 * on `provider.type` without remapping message history, model selection, or
 * sampling parameters per adapter.
 *
 * Conversation history is assembled at the route layer (task003), not here —
 * adapters receive a fully-formed `messages` array and pass it through.
 */
import type { ProviderConfig } from "../../shared/types";

/** A single chat message in the OpenAI role/content format. */
export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Input to a streaming provider adapter. `stream: true` is a literal so the
 * type documents that non-streaming is out of scope for the chat surface —
 * non-streaming callers should use a different entry point if one is ever
 * needed.
 */
export interface ProviderRequest {
  provider: ProviderConfig;
  messages: ProviderMessage[];
  model: string;
  temperature?: number;
  stream: true;
  /**
   * API key for providers whose `auth.type` is `api-key`. The secret lives
   * server-side and is threaded in by the route handler — the adapter never
   * looks it up. When `auth.type` is `none`, this is ignored.
   */
  apiKey?: string;
  /**
   * Inactivity timeout in ms. When no bytes arrive from the provider for
   * this long, the adapter emits a system error chunk and aborts the
   * upstream fetch. Default: 60_000 (matches Claude runner).
   */
  timeoutMs?: number;
  /**
   * External abort signal — when triggered, the adapter cancels the upstream
   * fetch and emits a system error chunk. Used by the chat route to cancel
   * in-flight requests when a user closes a conversation mid-stream.
   */
  signal?: AbortSignal;
}
