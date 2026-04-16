// client/src/stores/chat-settings-store.ts
//
// Composer settings store — chat-composer-controls milestone (task001).
//
// Two layers sit side-by-side:
//
//   1. `globalDefaults` — provider/model/effort/etc. the user has configured
//      as the starting point for every new conversation. Hydrated from
//      `GET /api/settings/chat-defaults` on app mount; edits round-trip via
//      `PUT`. This is the server-backed layer.
//
//   2. `overrides` — `Record<conversationId, Partial<ChatSettings>>` keyed by
//      the conversationId. In-memory only (matches the transient-draft model
//      from `chat-store.ts`) — survives tab switches, dies on reload. Each
//      override is a *partial* record; only the fields the user explicitly
//      set on that tab live here, and everything else falls back to
//      `globalDefaults`.
//
// `getSettings(conversationId)` merges the two — override fields win over
// defaults. Callers always ask through this selector rather than reading
// state directly, so the resolved shape is always consistent with the
// override-wins contract.
//
// Like `chat-tabs-store.ts`, mutations on the global defaults are
// optimistic: apply locally, PUT in the background, revert on failure. Per-
// conversation `updateSettings` / `clearSettings` are local-only (no fetch)
// — they're transient and don't need server round-trips.

import { create } from 'zustand';
import type { ChatGlobalDefaults, ChatSettings } from '../../../shared/types';

/** Persistence endpoint for the global-defaults layer. */
const DEFAULTS_ENDPOINT = '/api/settings/chat-defaults';

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

interface ChatSettingsState {
  /** Global defaults, fetched from the server on load. */
  globalDefaults: ChatGlobalDefaults;

  /**
   * Per-conversation overrides. Each entry is a *partial* settings record —
   * only the fields the user has explicitly changed on that tab. Missing
   * fields fall through to `globalDefaults` at read time.
   */
  overrides: Record<string, Partial<ChatSettings>>;

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
}

export const useChatSettingsStore = create<ChatSettingsState>((set, get) => ({
  globalDefaults: { ...INITIAL_DEFAULTS },
  overrides: {},
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
}));
