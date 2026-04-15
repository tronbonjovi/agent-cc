// tests/use-active-conversation-id.test.ts
//
// task007 — the `useActiveConversationId` hook seam.
//
// ChatPanel consumes this hook instead of subscribing to `useChatTabsStore`
// directly. The seam narrows the task006 regression lock and keeps the
// panel ignorant of tab-store internals.
//
// Vitest excludes `client/` so the hook itself can't be rendered. Instead
// this file covers two things at the pure-logic level:
//
//   1. The exported `resolveActiveConversationId(activeTabId)` helper that
//      the hook wraps — tests cover the fallback contract.
//   2. Source-text guardrails pinning the hook file's existence, its import
//      of `useChatTabsStore`, and the fallback sentinel `'default'`.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const HOOK_PATH = path.resolve(
  ROOT,
  'client/src/hooks/use-active-conversation-id.ts',
);

describe('resolveActiveConversationId — pure fallback logic', () => {
  // The helper is a plain function so we can import it without pulling in
  // React or zustand selector semantics. This proves the exact contract the
  // hook exposes in production.
  it('falls back to "default" when activeTabId is null', async () => {
    const { resolveActiveConversationId } = await import(
      '../client/src/hooks/use-active-conversation-id'
    );
    expect(resolveActiveConversationId(null)).toBe('default');
  });

  it('falls back to "default" when activeTabId is an empty string', async () => {
    const { resolveActiveConversationId } = await import(
      '../client/src/hooks/use-active-conversation-id'
    );
    expect(resolveActiveConversationId('')).toBe('default');
  });

  it('returns the activeTabId when set', async () => {
    const { resolveActiveConversationId } = await import(
      '../client/src/hooks/use-active-conversation-id'
    );
    expect(resolveActiveConversationId('tab-42')).toBe('tab-42');
  });
});

describe('use-active-conversation-id.ts — source guardrails', () => {
  const src = fs.readFileSync(HOOK_PATH, 'utf-8');

  it('exports the useActiveConversationId hook', () => {
    expect(src).toMatch(/export\s+function\s+useActiveConversationId/);
  });

  it('exports the pure resolveActiveConversationId helper', () => {
    expect(src).toMatch(/export\s+function\s+resolveActiveConversationId/);
  });

  it('imports useChatTabsStore — the hook is the permitted wrapper seam', () => {
    // The regression lock in chat-panel.test.ts bans a direct import of
    // useChatTabsStore in chat-panel.tsx. This hook is the one place that
    // IS allowed to import the tabs store.
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).toContain('useChatTabsStore');
  });

  it('uses "default" as the fallback sentinel', () => {
    expect(src).toContain("'default'");
  });
});
