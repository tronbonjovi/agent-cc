// client/src/stores/builtin-providers.ts
//
// STATUS (post-M11): **test-fixture-only**. No runtime client code imports
// from this module anymore. The composer's provider list comes from
// `GET /api/providers` via `chat-settings-store.loadProviders()`, and the
// model list comes from `GET /api/providers/:id/models` via
// `useProviderModels(providerId)`.
//
// Kept alive because the M10 test suites
// (`tests/chat-capability-visibility.test.ts`, `tests/chat-model-dropdown.test.ts`,
// `tests/chat-settings-popover.test.ts`, `tests/chat-composer-e2e.test.ts`)
// reference this file as a structural fixture — they read the source text to
// pin model-id / display-name invariants ("claude-code is present", "Claude
// Sonnet 4.6 is listed"). Deleting this module would break those pins without
// a corresponding behavior change in the product; keeping it here is cheap.
//
// If you're looking at this file because you need to change a provider or
// model list in the UI:
//   - Provider list → the built-in auto-seeder in `server/db.ts` owns the
//     shipping list. Add your provider there, restart, and it surfaces
//     through `GET /api/providers`.
//   - Model list → `server/providers/model-discovery.ts`. Claude Code's
//     known set is hardcoded there; Ollama and OpenAI-compatible providers
//     auto-discover from their respective endpoints.
//
// The helpers below (`resolveProvider`, `defaultModelFor`, `isModelInCatalog`)
// are retained for the same reason as the arrays: test-suite fixtures. They
// are no longer called from runtime client code.

import type { ProviderConfig } from '../../../shared/types';

/** A single model offered by a provider. Display-facing `name`, wire-level `id`. */
export interface ModelEntry {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Provider registry (test fixture)
// ---------------------------------------------------------------------------
//
// Claude Code with all capabilities true. Matches the `claude-code` entry
// the server auto-seeds on first startup — so tests that read either the
// static fixture here or the seeded DB get the same answer.

export const BUILTIN_PROVIDERS: ReadonlyArray<ProviderConfig> = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    type: 'claude-cli',
    auth: { type: 'none' },
    capabilities: {
      thinking: true,
      effort: true,
      webSearch: true,
      systemPrompt: true,
      fileAttachments: true,
      projectContext: true,
      // Temperature is OpenAI-compatible territory — the Claude CLI doesn't
      // expose a --temperature flag, so the flag is intentionally omitted
      // (treated as "not supported").
    },
  },
];

// ---------------------------------------------------------------------------
// Model catalogs (test fixture)
// ---------------------------------------------------------------------------
//
// Mirrors what `server/providers/model-discovery.ts` returns for Claude Code.
// If the server's known set changes, update this fixture too so the pinning
// tests stay in sync.

export const MODEL_CATALOGS: Record<string, ReadonlyArray<ModelEntry>> = {
  'claude-code': [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ],
};

// ---------------------------------------------------------------------------
// Lookup helpers (test fixture)
// ---------------------------------------------------------------------------

/**
 * Resolve a provider id to its config. Falls back to the first builtin when
 * the id is unknown so downstream code never sees `undefined`.
 *
 * OBSOLETE in runtime client code — use
 * `useChatSettingsStore.getState().getActiveProvider(conversationId)` instead,
 * which resolves against the live `providers` slice.
 */
export function resolveProvider(providerId: string): ProviderConfig {
  const hit = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
  return hit ?? BUILTIN_PROVIDERS[0];
}

/**
 * Return the first model id in the provider's catalog, or undefined if the
 * provider has no catalog registered.
 *
 * OBSOLETE in runtime client code — model selection reset after a provider
 * change is owned by `model-dropdown.tsx`'s selection-reset effect, which
 * uses the live `useProviderModels(providerId)` list.
 */
export function defaultModelFor(providerId: string): string | undefined {
  const catalog = MODEL_CATALOGS[providerId];
  if (!catalog || catalog.length === 0) return undefined;
  return catalog[0].id;
}

/**
 * True when the given model id is present in the provider's catalog.
 *
 * OBSOLETE in runtime client code — compatibility checks use the live model
 * list from React Query's cache (see settings-popover.tsx).
 */
export function isModelInCatalog(
  providerId: string,
  modelId: string,
): boolean {
  const catalog = MODEL_CATALOGS[providerId];
  if (!catalog) return false;
  return catalog.some((m) => m.id === modelId);
}
