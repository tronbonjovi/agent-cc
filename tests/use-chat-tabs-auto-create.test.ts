// tests/use-chat-tabs-auto-create.test.ts
//
// task007 — source guardrails for the first-mount auto-create hook
// (`client/src/hooks/use-chat-tabs-auto-create.ts`).
//
// Vitest excludes `client/`, so we can't mount a React component here.
// The auto-create effect is too deeply entangled with React's effect
// scheduling + Zustand subscriptions to exercise as a pure function —
// proving its full behaviour is the job of `tests/chat-workflows-tabs-e2e`
// in task008. This file's job is to pin the contract in the source text:
//
//   - The hook exists and exports the expected name.
//   - It wraps `useChatTabsStore` (the hook is one of two approved places
//     to touch the tabs store directly; the panel is not).
//   - It uses the module-level + per-mount latch pattern so React 18
//     strict mode can't double-create a Main tab.
//   - The `!loaded` gate is in place before any auto-create side effects.
//   - The auto-created tab is titled "Main".
//   - A test-only reset helper is exported for future interaction tests.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const HOOK_PATH = path.resolve(
  ROOT,
  'client/src/hooks/use-chat-tabs-auto-create.ts',
);

describe('use-chat-tabs-auto-create.ts — source guardrails', () => {
  const src = fs.readFileSync(HOOK_PATH, 'utf-8');

  it('exports useChatTabsStoreAutoCreate', () => {
    expect(src).toMatch(/export\s+function\s+useChatTabsStoreAutoCreate/);
  });

  it('imports useChatTabsStore (approved hook seam)', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
  });

  it('gates the effect on the tabs-store loaded flag', () => {
    // If we fire before load() resolves we race against the hydrate.
    expect(src).toMatch(/s\.loaded\b/);
    expect(src).toMatch(/if\s*\(\s*!loaded\s*\)/);
  });

  it('checks openTabs is empty before creating', () => {
    expect(src).toMatch(/tabs\.length/);
    expect(src).toMatch(/tabsCount\s*>\s*0/);
  });

  it('uses a module-level latch to survive remounts', () => {
    // Module-scoped boolean, toggled true on first fire, reset only on
    // catch (so a transient failure can retry on a future render).
    expect(src).toMatch(/let\s+didAutoCreate/);
  });

  it('uses a per-mount ref to catch the strict-mode double-invoke', () => {
    expect(src).toContain('useRef');
    expect(src).toMatch(/firedRef\.current/);
  });

  it('calls openTab with a "Main" title', () => {
    expect(src).toMatch(/openTab\(/);
    expect(src).toContain("'Main'");
  });

  it('handles openTab rejection by resetting the latch', () => {
    // Without the reset, a 500 on first load would wedge the empty state
    // forever. The catch handler must clear both the module latch and the
    // per-mount ref so a future render can retry.
    expect(src).toMatch(/\.catch\(/);
    expect(src).toMatch(/didAutoCreate\s*=\s*false/);
    expect(src).toMatch(/firedRef\.current\s*=\s*false/);
  });

  it('exports __resetAutoCreateLatch for test isolation', () => {
    expect(src).toMatch(/export\s+function\s+__resetAutoCreateLatch/);
  });

  it('reads from the tabs store via .getState() for the write path', () => {
    // The effect uses getState() instead of a subscription so the write
    // doesn't re-trigger the effect via a cascading re-render.
    expect(src).toMatch(/useChatTabsStore\s*\.\s*getState\(\)/);
  });
});
