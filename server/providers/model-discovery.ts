/**
 * Dynamic model discovery — chat-provider-system task005.
 *
 * Different providers expose their model inventory in different shapes:
 *
 *   - `claude-cli` has no discovery endpoint. We ship a known hardcoded set
 *     (Opus / Sonnet / Haiku) because the CLI doesn't enumerate models and
 *     the user strictly wants real names rendered in the dropdown (see
 *     `feedback_no_model_abstraction`).
 *
 *   - `openai-compatible` providers vary. OpenAI itself + vLLM + LM Studio
 *     use `GET /v1/models`. Ollama uses its own `GET /api/tags` — it DOES
 *     speak OpenAI on chat completions, but not on model listing. We branch
 *     on `baseUrl` (does it look like Ollama?) so each flavor gets the right
 *     endpoint.
 *
 * All failures degrade to an empty array — the caller (the composer's model
 * dropdown) renders "No models available" in that case. We never throw, so a
 * misconfigured provider can't crash the route or freeze the UI.
 *
 * A 60-second in-memory cache sits in front of every network path. Model
 * lists don't change frequently, and without the cache every render of the
 * dropdown (and every React Query refetch) would re-hit the provider.
 * Errors aren't cached — a transient network blip shouldn't lock out the
 * provider for a full minute.
 */
import type { ProviderConfig } from "../../shared/types";

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

const CACHE_TTL_MS = 60_000;

/** Cached discovery result. Keyed by provider id. */
interface CacheEntry {
  expiresAt: number;
  models: ProviderModel[];
}

const cache = new Map<string, CacheEntry>();

/**
 * Known Claude CLI models. Duplicated from the client-side `MODEL_CATALOGS`
 * deliberately — this is the server's authoritative source, and keeping it
 * inline avoids dragging the client module tree into the server build. When
 * Anthropic ships new model ids, update both places (the test pins these).
 */
const CLAUDE_MODELS: ReadonlyArray<Omit<ProviderModel, "provider">> = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

/**
 * Best-effort Ollama sniff based on `baseUrl`. Ollama's default port is 11434;
 * a URL containing that port or the literal substring "ollama" almost always
 * means an Ollama instance. Everything else is assumed to be OpenAI-style.
 *
 * Not a perfect detector — a user pointing at Ollama on a proxied path
 * without port 11434 would fall through to `/v1/models`. That's acceptable:
 * recent Ollama versions DO expose `/v1/models` (OpenAI-compat route), so
 * the fallback still works. The `/api/tags` branch is the faster path.
 */
function looksLikeOllama(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  return baseUrl.includes("11434") || baseUrl.toLowerCase().includes("ollama");
}

/** Strip a trailing slash off a baseUrl so we can append paths cleanly. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Discover models offered by a provider. Returns an empty array on any
 * failure (network, bad status, unexpected response shape). Caches results
 * per provider id for `CACHE_TTL_MS`.
 */
export async function discoverModels(
  provider: ProviderConfig,
): Promise<ProviderModel[]> {
  const now = Date.now();
  const cached = cache.get(provider.id);
  if (cached && cached.expiresAt > now) {
    return cached.models;
  }

  let models: ProviderModel[] = [];
  try {
    if (provider.type === "claude-cli") {
      models = CLAUDE_MODELS.map((m) => ({ ...m, provider: provider.id }));
    } else if (provider.type === "openai-compatible") {
      if (looksLikeOllama(provider.baseUrl)) {
        models = await discoverOllama(provider);
      } else {
        models = await discoverOpenAI(provider);
      }
    }
  } catch (err) {
    // Defensive — every helper below already catches its own errors, but a
    // future refactor could let one escape. Log and degrade to empty so the
    // caller still sees a consistent "no models available" state.
    console.warn(
      `[model-discovery] ${provider.id}: unexpected error ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    models = [];
  }

  // Only cache non-empty results. An empty list usually means "provider is
  // down" — we want the next call to retry rather than wait out the TTL.
  if (models.length > 0) {
    cache.set(provider.id, { expiresAt: now + CACHE_TTL_MS, models });
  }
  return models;
}

/**
 * Ollama discovery. `GET {baseUrl}/api/tags` returns
 * `{ models: [{ name: "...", size: ... }] }`. We map `name` into both `id`
 * and display `name` — Ollama tags are already human-readable (e.g.
 * "llama3.2:8b") so no prettification needed.
 */
async function discoverOllama(
  provider: ProviderConfig,
): Promise<ProviderModel[]> {
  const base = normalizeBase(provider.baseUrl ?? "");
  const url = `${base}/api/tags`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[model-discovery] ollama ${provider.id}: ${res.status} ${res.statusText}`,
      );
      return [];
    }
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const list = Array.isArray(body?.models) ? body.models : [];
    return list
      .filter((m) => typeof m?.name === "string" && m.name.length > 0)
      .map((m) => ({
        id: m.name as string,
        name: m.name as string,
        provider: provider.id,
      }));
  } catch (err) {
    console.warn(
      `[model-discovery] ollama ${provider.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}

/**
 * OpenAI-compatible discovery. `GET {baseUrl}/v1/models` returns
 * `{ data: [{ id, object, ... }] }`. We use `id` for both the wire id and
 * the display name — real OpenAI ids ("gpt-4", "gpt-3.5-turbo") are more
 * recognizable than any remapped label, matching the
 * `feedback_no_model_abstraction` preference.
 */
async function discoverOpenAI(
  provider: ProviderConfig,
): Promise<ProviderModel[]> {
  const base = normalizeBase(provider.baseUrl ?? "");
  const url = `${base}/v1/models`;
  const headers: Record<string, string> = {};
  if (provider.auth.type === "api-key" && provider.auth.apiKey) {
    headers["Authorization"] = `Bearer ${provider.auth.apiKey}`;
  }
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(
        `[model-discovery] openai ${provider.id}: ${res.status} ${res.statusText}`,
      );
      return [];
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const list = Array.isArray(body?.data) ? body.data : [];
    return list
      .filter((m) => typeof m?.id === "string" && m.id.length > 0)
      .map((m) => ({
        id: m.id as string,
        name: m.id as string,
        provider: provider.id,
      }));
  } catch (err) {
    console.warn(
      `[model-discovery] openai ${provider.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}

/**
 * Test hook — clear the cache. Exposed for tests that need to assert fresh
 * fetches without waiting out the real TTL; prod code should let the TTL
 * handle eviction.
 */
export function __clearDiscoveryCache(): void {
  cache.clear();
}
