// client/src/stores/builtin-providers.ts
//
// Single source of truth for provider configs and per-provider model
// catalogs. Used by:
//
//   - `chat-settings-store.ts` — `getActiveProvider` / `getCapabilities`
//     selectors read from BUILTIN_PROVIDERS.
//   - `settings-popover.tsx` — provider selector enumerates BUILTIN_PROVIDERS
//     and uses `defaultModelFor` when resetting the model on provider change.
//   - `model-dropdown.tsx` — indexes into MODEL_CATALOGS by the current
//     provider id to render the right model list.
//
// Why this module (rather than keeping it in the store file, or in
// settings-popover.tsx):
//
//   - The store needs the registry for its selectors, but keeping the
//     registry inside the store file forces the popover + dropdown to
//     import it through the store — dragging zustand in as a hard dep for
//     consumers that only want the data.
//   - The popover held AVAILABLE_PROVIDERS inline (task004) but the model
//     dropdown held CLAUDE_CODE_MODELS inline (task003). Leaving them in
//     two places means the capability system can't tell which models a
//     provider offers. Consolidating into this module makes
//     `defaultModelFor(providerId)` trivial and keeps task007's cascade
//     (incompatible-model reset on provider switch) from having to
//     cross-reference two files.
//   - M11 will populate providers from the server. When that lands, this
//     module will migrate to a hook that hydrates from `/api/providers` —
//     callers already only reach for the exports here, so the swap is a
//     single-file change.

import type { ProviderConfig } from '../../../shared/types';

/** A single model offered by a provider. Display-facing `name`, wire-level `id`. */
export interface ModelEntry {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------
//
// Claude Code is the only builtin today. Capability flags are all true
// because the Claude CLI supports every composer control we've built. If a
// future provider lands here, set only the flags it genuinely supports —
// missing/false flags hide the corresponding control in the popover via
// `getCapabilities`.

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
      // (treated as "not supported"). When an OpenAI-compatible provider
      // ships in M11, flip this flag true in its entry.
    },
  },
];

// ---------------------------------------------------------------------------
// Model catalogs
// ---------------------------------------------------------------------------
//
// Keyed by provider id so the dropdown can index directly. A provider with
// no catalog entry (or an empty array) renders an empty-state in the
// dropdown — future-proof for providers that defer their model list to a
// server-side discovery endpoint.

export const MODEL_CATALOGS: Record<string, ReadonlyArray<ModelEntry>> = {
  'claude-code': [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a provider id to its config. Falls back to the first builtin when
 * the id is unknown so downstream code (the popover, the store selectors)
 * never sees `undefined`. Matches the "truthful fallback" pattern used by
 * displayNameFor in model-dropdown.tsx / settings-popover.tsx — but for the
 * capabilities layer, returning the first builtin is safer than returning a
 * synthetic empty config (a provider with no capabilities would hide every
 * control and leave the composer useless).
 */
export function resolveProvider(providerId: string): ProviderConfig {
  const hit = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
  return hit ?? BUILTIN_PROVIDERS[0];
}

/**
 * Return the first model id in the provider's catalog, or undefined if the
 * provider has no catalog registered. Used by the popover's provider-change
 * handler to reset ChatSettings.model to a sensible default when the user
 * picks a different provider.
 */
export function defaultModelFor(providerId: string): string | undefined {
  const catalog = MODEL_CATALOGS[providerId];
  if (!catalog || catalog.length === 0) return undefined;
  return catalog[0].id;
}

/**
 * True when the given model id is present in the provider's catalog. The
 * popover uses this to decide whether a provider change needs to reset the
 * model — if the current model is already valid for the new provider, we
 * leave it alone.
 */
export function isModelInCatalog(
  providerId: string,
  modelId: string,
): boolean {
  const catalog = MODEL_CATALOGS[providerId];
  if (!catalog) return false;
  return catalog.some((m) => m.id === modelId);
}
