// client/src/stores/chat-settings-store.ts
//
// Composer settings store — chat-composer-controls milestone (task001) +
// chat-provider-system M11 task007 (live provider wiring).
//
// Three layers sit side-by-side:
//
//   1. `globalDefaults` — provider/model/effort/etc. the user has configured
//      as the starting point for every new conversation. Hydrated from
//      `GET /api/settings/chat-defaults` on app mount; edits round-trip via
//      `PUT`. This is the server-backed defaults layer.
//
//   2. `overrides` — `Record<conversationId, Partial<ChatSettings>>` keyed by
//      the conversationId. In-memory only (matches the transient-draft model
//      from `chat-store.ts`) — survives tab switches, dies on reload. Each
//      override is a *partial* record; only the fields the user explicitly
//      set on that tab live here, and everything else falls back to
//      `globalDefaults`.
//
//   3. `providers` — the full `ProviderConfig[]` list from
//      `GET /api/providers`. Populated via `loadProviders()` on first mount
//      of the settings popover; subsequent reads are synchronous lookups
//      against this slice. The list is the source of truth for provider
//      resolution — no more hardcoded client-side registry.
//
// `getSettings(conversationId)` merges layers 1 + 2 — override fields win
// over defaults. `getActiveProvider(conversationId)` looks up against layer 3
// using the resolved `providerId`.
//
// Fallback contract for `getActiveProvider` (task007):
//   a) Found in `providers` by id → return it.
//   b) Not found but `claude-code` IS in the loaded list → return that.
//      Covers "user deleted their custom provider mid-conversation".
//   c) Neither found (mid-load, providers: []) → return `undefined`. Callers
//      handle this gracefully: `getCapabilities` returns an empty object, so
//      all gated popover controls stay hidden until the API responds.
//
// Like `chat-tabs-store.ts`, mutations on the global defaults are
// optimistic: apply locally, PUT in the background, revert on failure. Per-
// conversation `updateSettings` / `clearSettings` are local-only (no fetch)
// — they're transient and don't need server round-trips.

import { create } from 'zustand';
import type {
  ChatGlobalDefaults,
  ChatSettings,
  ProviderCapabilities,
  ProviderConfig,
} from '../../../shared/types';

/** Persistence endpoint for the global-defaults layer. */
const DEFAULTS_ENDPOINT = '/api/settings/chat-defaults';
/** Provider list endpoint — same shape served to the Settings > Providers page. */
const PROVIDERS_ENDPOINT = '/api/providers';

/**
 * Fallback defaults if `loadGlobalDefaults` hasn't resolved yet. Mirrors the
 * server-side `defaultChatDefaults` in `server/db.ts` — keeping them in
 * lockstep so the UI doesn't flash unexpected values pre-hydration.
 */
const INITIAL_DEFAULTS: ChatGlobalDefaults = {
  providerId: 'claude-code',
  model: 'claude-sonnet-4-6',
  effort: 'medium',
};

/**
 * Empty capabilities object returned when no provider resolves. All flags
 * fall through to undefined/falsy so every gated control in the popover
 * stays hidden — which is the right degraded-mode behavior: better to show
 * a minimal popover for a second than to render controls that can't route
 * to any backend.
 */
const EMPTY_CAPABILITIES: ProviderCapabilities = {};

interface ChatSettingsState {
  /** Global defaults, fetched from the server on load. */
  globalDefaults: ChatGlobalDefaults;

  /**
   * Per-conversation overrides. Each entry is a *partial* settings record —
   * only the fields the user has explicitly changed on that tab. Missing
   * fields fall through to `globalDefaults` at read time.
   */
  overrides: Record<string, Partial<ChatSettings>>;

  /**
   * Live provider list from `GET /api/providers`. Populated by
   * `loadProviders()` on popover mount. Empty until the fetch resolves —
   * `getActiveProvider` returns undefined during this window rather than
   * synthesizing a placeholder.
   */
  providers: ProviderConfig[];

  /** True once `loadProviders()` has completed at least once (success OR failure). */
  providersLoaded: boolean;

  /** True once `loadGlobalDefaults()` has completed at least once. */
  loaded: boolean;

  /**
   * Resolve settings for a conversation — `globalDefaults ∪ overrides[id]`
   * with the override winning on conflict. Always returns a fully-populated
   * `ChatSettings` (required fields guaranteed by the defaults layer).
   */
  getSettings: (conversationId: string) => ChatSettings;

  /**
   * Merge a partial update into the conversation's override record. Fields
   * not included in `partial` keep whatever they had (override or default).
   * Local-only — does not PUT.
   */
  updateSettings: (conversationId: string, partial: Partial<ChatSettings>) => void;

  /**
   * Drop the conversation's override record entirely. `getSettings(id)` will
   * fall through to `globalDefaults` on the next read.
   */
  clearSettings: (conversationId: string) => void;

  /**
   * Resolve the active provider config for a conversation. Looks up
   * `getSettings(id).providerId` against the live `providers` list. Returns
   * `undefined` when no match and no `claude-code` seed is available —
   * callers must handle that case. See module-header fallback contract.
   */
  getActiveProvider: (conversationId: string) => ProviderConfig | undefined;

  /**
   * Shorthand for `getActiveProvider(id)?.capabilities ?? {}`. The settings
   * popover uses this selector to gate each control on the corresponding
   * flag — returning an empty object on missing provider means every
   * capability check evaluates falsy, so no controls render until providers
   * are loaded. Prevents crashes during the popover's first paint.
   */
  getCapabilities: (conversationId: string) => ProviderCapabilities;

  /**
   * Hydrate `globalDefaults` from the server. Called once on app mount.
   * Silently tolerates missing / partial payloads — the initial in-memory
   * defaults are retained so the UI isn't wedged.
   */
  loadGlobalDefaults: () => Promise<void>;

  /**
   * Persist a new `globalDefaults` shape. Optimistic with rollback on
   * failure so callers can `await` and surface a toast on reject.
   */
  saveGlobalDefaults: (settings: ChatGlobalDefaults) => Promise<void>;

  /**
   * Hydrate `providers` from `GET /api/providers`. Idempotent — the popover
   * calls this on every mount; repeated calls are cheap because React Query
   * doesn't back this slice (the settings store manages its own cache via
   * the `providersLoaded` flag). Callers can guard on `providersLoaded` to
   * avoid a refetch, but even unguarded repeat calls just hit the endpoint
   * again and replace the slice — no crash, no inconsistent state.
   */
  loadProviders: () => Promise<void>;
}

export const useChatSettingsStore = create<ChatSettingsState>((set, get) => ({
  globalDefaults: { ...INITIAL_DEFAULTS },
  overrides: {},
  providers: [],
  providersLoaded: false,
  loaded: false,

  getSettings: (conversationId) => {
    const { globalDefaults, overrides } = get();
    const override = overrides[conversationId];
    // Spread order matters: defaults first, override last — override wins.
    return { ...globalDefaults, ...(override ?? {}) };
  },

  updateSettings: (conversationId, partial) =>
    set((s) => {
      const existing = s.overrides[conversationId] ?? {};
      return {
        overrides: {
          ...s.overrides,
          [conversationId]: { ...existing, ...partial },
        },
      };
    }),

  clearSettings: (conversationId) =>
    set((s) => {
      if (!(conversationId in s.overrides)) return s;
      const next = { ...s.overrides };
      delete next[conversationId];
      return { overrides: next };
    }),

  getActiveProvider: (conversationId) => {
    // Resolve provider id via the shared defaults+override read path.
    const providerId = get().getSettings(conversationId).providerId;
    const { providers } = get();
    const hit = providers.find((p) => p.id === providerId);
    if (hit) return hit;
    // Fallback: the referenced provider was deleted (or never existed in the
    // fetched list). Fall through to claude-code if it's loaded — built-in
    // auto-seeding on the server guarantees claude-code is always present
    // after the first successful fetch, so this is the common deletion path.
    const claudeCode = providers.find((p) => p.id === 'claude-code');
    if (claudeCode) return claudeCode;
    // Nothing loaded yet. Return undefined — getCapabilities handles this
    // by returning an empty capabilities object, which hides every gated
    // control until the API responds. Callers that need a guaranteed
    // ProviderConfig must guard on `providersLoaded` separately.
    return undefined;
  },

  getCapabilities: (conversationId) => {
    const provider = get().getActiveProvider(conversationId);
    // Empty object = every flag reads as undefined/falsy in the popover,
    // which is the right "no provider known yet" degraded mode. See the
    // getActiveProvider fallback contract in the module header.
    return provider?.capabilities ?? EMPTY_CAPABILITIES;
  },

  loadGlobalDefaults: async () => {
    try {
      const res = await fetch(DEFAULTS_ENDPOINT);
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const body = (await res.json()) as Partial<ChatGlobalDefaults>;
      // Require the two non-optional fields to hydrate — otherwise keep the
      // in-memory fallback. Prevents a mangled response from leaving the
      // composer with no provider/model to talk to.
      if (
        typeof body.providerId === 'string' &&
        body.providerId.length > 0 &&
        typeof body.model === 'string' &&
        body.model.length > 0
      ) {
        set({
          globalDefaults: { ...INITIAL_DEFAULTS, ...body } as ChatGlobalDefaults,
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch (err) {
      console.error('[chat-settings] loadGlobalDefaults failed:', err);
      set({ loaded: true });
    }
  },

  saveGlobalDefaults: async (settings) => {
    const snapshot = get().globalDefaults;
    set({ globalDefaults: { ...settings } });
    try {
      const res = await fetch(DEFAULTS_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw new Error(`PUT ${DEFAULTS_ENDPOINT} failed with ${res.status}`);
      }
    } catch (err) {
      set({ globalDefaults: snapshot });
      console.error('[chat-settings] saveGlobalDefaults failed, reverted:', err);
      throw err;
    }
  },

  loadProviders: async () => {
    try {
      const res = await fetch(PROVIDERS_ENDPOINT);
      if (!res.ok) {
        // Non-2xx: leave the current slice (may be empty on first mount).
        // Setting `providersLoaded: true` so the popover can render its
        // empty-state help copy ("Configure providers in Settings") rather
        // than spin forever.
        console.error(
          `[chat-settings] loadProviders got ${res.status} from ${PROVIDERS_ENDPOINT}`,
        );
        set({ providersLoaded: true });
        return;
      }
      const body = (await res.json()) as ProviderConfig[];
      // Defensive: the server returns an array, but a misconfigured proxy
      // could inject an object shape. Only accept the array response.
      if (Array.isArray(body)) {
        set({ providers: body, providersLoaded: true });
      } else {
        set({ providersLoaded: true });
      }
    } catch (err) {
      console.error('[chat-settings] loadProviders failed:', err);
      set({ providersLoaded: true });
    }
  },
}));
