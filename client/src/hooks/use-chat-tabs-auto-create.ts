// client/src/hooks/use-chat-tabs-auto-create.ts
//
// task007 — first-mount auto-create for the integrated chat panel.
//
// On a fresh install (or after the user closes the last tab), the tabs
// store hydrates with an empty `openTabs` array. Without a tab, the active
// conversation id falls back to `'default'` (see
// `use-active-conversation-id.ts`), which works but leaves the tab bar
// visually empty and the user unsure whether anything is wired up. This
// hook spawns a "Main" tab once `loaded === true` and `openTabs.length === 0`
// so the panel always renders against a real tab.
//
// React 18 strict-mode safety:
//
//   - Strict mode double-invokes `useEffect` bodies in dev. The obvious
//     `openTabs.length === 0` check would race and create two tabs.
//   - We guard with a module-level `didAutoCreate` flag AND a `ref` that
//     tracks whether THIS mount has already fired. The ref check catches
//     the strict-mode second pass on the same component instance; the
//     module-level flag catches accidental remounts from other paths.
//   - The `loaded` gate from task001's `load()` path is the underlying
//     correctness guarantee: until `loaded === true`, `openTabs` defaults
//     to an empty array that's indistinguishable from "user has no tabs,"
//     so firing before load would create a tab the server will immediately
//     overwrite on hydrate.
//
// This hook is one of two places allowed to import `useChatTabsStore`
// directly — the other is `use-active-conversation-id.ts`. ChatPanel stays
// on the hook seam.

import { useEffect, useRef } from 'react';
import { useChatTabsStore } from '@/stores/chat-tabs-store';

/**
 * Generate a stable-ish id for the auto-created Main tab. We don't need
 * server-side uniqueness — the tabs store will persist whatever id we pick
 * and the user can rename / close it. Prefer `crypto.randomUUID` where
 * available (browsers, modern node), fall back to a timestamp+random
 * suffix otherwise.
 */
function freshMainTabId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `main-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Module-scoped latch: once we've auto-created a Main tab during this page
// session we never do it again, even if a remount would otherwise trigger
// the effect. Re-opening a closed tab is a deliberate user action, not an
// auto-create — closing and re-spawning should require a page reload.
let didAutoCreate = false;

export function useChatTabsStoreAutoCreate(): void {
  const loaded = useChatTabsStore((s) => s.loaded);
  const tabsCount = useChatTabsStore((s) => s.tabs.length);
  // Per-mount ref — catches the strict-mode double-invoke on the same
  // component instance before the module latch gets a chance to stale.
  const firedRef = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    if (tabsCount > 0) return;
    if (firedRef.current) return;
    if (didAutoCreate) return;
    firedRef.current = true;
    didAutoCreate = true;
    // Fire-and-forget — the tabs store handles PUT errors internally by
    // rolling back + logging. A failure here is non-fatal: the next render
    // will just leave the panel on the `'default'` fallback conversation.
    useChatTabsStore
      .getState()
      .openTab(freshMainTabId(), 'Main')
      .catch((err) => {
        // Reset the latch on failure so a future render / user action can
        // retry — otherwise a transient 500 on first load would wedge the
        // empty state forever.
        didAutoCreate = false;
        firedRef.current = false;
        console.error('[chat-panel] auto-create Main tab failed', err);
      });
  }, [loaded, tabsCount]);
}

/**
 * Test-only helper to reset the module latch between test cases. Not
 * exported from the hook's main surface — import via the file path if
 * you need it in a test.
 */
export function __resetAutoCreateLatch(): void {
  didAutoCreate = false;
}
