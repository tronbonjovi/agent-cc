// client/src/stores/chat-tabs-store.ts
//
// Persisted chat-tab state — first task of the chat-workflows-tabs milestone.
//
// Unlike `chat-store.ts` (which holds the ephemeral live-events buffer), this
// store is persisted: every mutation PUTs the full new state to
// `/api/chat/tabs`, which writes it atomically to the JSON DB on the server.
// The UI consumes the store normally; persistence is transparent.
//
// Pattern: optimistic update + rollback on PUT failure.
//
//   1. Snapshot the current state.
//   2. Apply the mutation to local state immediately (the UI never waits).
//   3. Fire the PUT with the new state. If it fails, restore the snapshot
//      and throw so the caller can surface a toast / retry UI.
//
// Callers should `await` every mutation — the promise resolves on successful
// PUT, rejects on failure (with the snapshot already restored).
//
// `load()` is called once on app mount from the top-level layout (see
// `client/src/components/layout.tsx`). After `load()` resolves, `loaded` is
// true and the UI can trust the store is backed by the server.

import { create } from 'zustand';
import type { ChatTabEntry, ChatTabState } from '../../../shared/types';

/** Persistence endpoint — shared by load() and every mutation. */
const TABS_ENDPOINT = '/api/chat/tabs';

interface ChatTabsStoreState {
  /** Open tabs, keyed by conversationId. */
  tabs: ChatTabEntry[];
  /** Currently focused tab, or null when no tabs are open. */
  activeTabId: string | null;
  /** Ordering of tabs by conversationId — drives the tab bar layout. */
  order: string[];
  /** True once `load()` has completed at least once. */
  loaded: boolean;

  /**
   * Open a tab for the given conversation. If already open, activates the
   * existing tab without touching its title or order. Optimistic; reverts
   * on PUT failure.
   */
  openTab: (conversationId: string, title: string) => Promise<void>;

  /**
   * Close a tab. If the closed tab was active, the next tab in order
   * becomes active (or null if no tabs remain). Optimistic.
   */
  closeTab: (conversationId: string) => Promise<void>;

  /** Set the active tab. Optimistic. */
  setActiveTab: (conversationId: string) => Promise<void>;

  /** Replace the ordering of tabs. Optimistic. */
  reorder: (newOrder: string[]) => Promise<void>;

  /**
   * Hydrate from the server. Called once on app mount. Silently tolerates
   * missing / partial payloads (defaults to empty state) so a fresh DB or a
   * transient server hiccup doesn't leave the UI wedged.
   */
  load: () => Promise<void>;
}

/** Build the payload to send in the PUT body. */
function toPayload(state: {
  tabs: ChatTabEntry[];
  activeTabId: string | null;
  order: string[];
}): ChatTabState {
  return {
    openTabs: state.tabs,
    activeTabId: state.activeTabId,
    tabOrder: state.order,
  };
}

/**
 * Persist the given state via PUT. Throws on non-2xx so callers know to
 * revert. Kept as a free function so every mutation uses the same request
 * shape.
 */
async function persist(state: ChatTabState): Promise<void> {
  const res = await fetch(TABS_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    throw new Error(`PUT ${TABS_ENDPOINT} failed with ${res.status}`);
  }
}

export const useChatTabsStore = create<ChatTabsStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  order: [],
  loaded: false,

  openTab: async (conversationId, title) => {
    const snapshot = {
      tabs: get().tabs,
      activeTabId: get().activeTabId,
      order: get().order,
    };

    // Already open? Just activate and persist the activation.
    const existing = snapshot.tabs.find((t) => t.conversationId === conversationId);
    const nextState = existing
      ? {
          tabs: snapshot.tabs,
          activeTabId: conversationId,
          order: snapshot.order,
        }
      : {
          tabs: [...snapshot.tabs, { conversationId, title }],
          activeTabId: conversationId,
          order: [...snapshot.order, conversationId],
        };

    set(nextState);
    try {
      await persist(toPayload(nextState));
    } catch (err) {
      set(snapshot);
      console.error('[chat-tabs] openTab persist failed, reverted:', err);
      throw err;
    }
  },

  closeTab: async (conversationId) => {
    const snapshot = {
      tabs: get().tabs,
      activeTabId: get().activeTabId,
      order: get().order,
    };

    const nextTabs = snapshot.tabs.filter((t) => t.conversationId !== conversationId);
    const nextOrder = snapshot.order.filter((id) => id !== conversationId);
    // Pick the next active tab: first surviving tab in order, or null.
    let nextActive: string | null = snapshot.activeTabId;
    if (snapshot.activeTabId === conversationId) {
      nextActive = nextOrder[0] ?? null;
    }

    const nextState = {
      tabs: nextTabs,
      activeTabId: nextActive,
      order: nextOrder,
    };

    set(nextState);
    try {
      await persist(toPayload(nextState));
    } catch (err) {
      set(snapshot);
      console.error('[chat-tabs] closeTab persist failed, reverted:', err);
      throw err;
    }
  },

  setActiveTab: async (conversationId) => {
    const snapshot = {
      tabs: get().tabs,
      activeTabId: get().activeTabId,
      order: get().order,
    };
    const nextState = {
      tabs: snapshot.tabs,
      activeTabId: conversationId,
      order: snapshot.order,
    };
    set(nextState);
    try {
      await persist(toPayload(nextState));
    } catch (err) {
      set(snapshot);
      console.error('[chat-tabs] setActiveTab persist failed, reverted:', err);
      throw err;
    }
  },

  reorder: async (newOrder) => {
    const snapshot = {
      tabs: get().tabs,
      activeTabId: get().activeTabId,
      order: get().order,
    };
    const nextState = {
      tabs: snapshot.tabs,
      activeTabId: snapshot.activeTabId,
      order: newOrder,
    };
    set(nextState);
    try {
      await persist(toPayload(nextState));
    } catch (err) {
      set(snapshot);
      console.error('[chat-tabs] reorder persist failed, reverted:', err);
      throw err;
    }
  },

  load: async () => {
    try {
      const res = await fetch(TABS_ENDPOINT);
      if (!res.ok) {
        // Treat non-2xx as "no persisted state yet" — the UI still mounts
        // with an empty tab bar, and the user can start opening tabs.
        set({ loaded: true });
        return;
      }
      const body = (await res.json()) as Partial<ChatTabState>;
      set({
        tabs: Array.isArray(body.openTabs) ? body.openTabs : [],
        activeTabId:
          typeof body.activeTabId === 'string' ? body.activeTabId : null,
        order: Array.isArray(body.tabOrder) ? body.tabOrder : [],
        loaded: true,
      });
    } catch (err) {
      // Network failure — keep empty state so the UI isn't wedged, but mark
      // loaded so callers stop waiting.
      console.error('[chat-tabs] load failed:', err);
      set({ loaded: true });
    }
  },
}));
