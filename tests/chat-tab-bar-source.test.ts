// tests/chat-tab-bar-source.test.ts
//
// Source-text guardrails for the ChatTabBar component shipped in
// chat-workflows-tabs-task002. Vitest excludes the client/ directory, so
// we can't render this component — the strategy (per
// `reference_vitest_client_excluded`) is:
//
//   1. Pure-logic helpers (tested separately in chat-tab-order.test.ts)
//   2. Source-text regex guards on the TSX to pin the known regression
//      points — API drift (`reorder` vs `reorderTabs`), display iteration
//      (must go through `order` via buildOrderedTabs, not `tabs.map`), the
//      `loaded` guard, and the mount point in chat-panel.
//
// Full interaction testing lands in the task008 multi-tab E2E once the
// real app is running; this file's job is to catch the specific bugs
// we'd regress into if someone copy-pastes old code.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const TAB_BAR_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-tab-bar.tsx',
);
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

describe('chat-tab-bar.tsx — source guardrails', () => {
  const src = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

  it('imports useChatTabsStore from @/stores/chat-tabs-store', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).toContain('useChatTabsStore');
  });

  it('calls the reorder action (not reorderTabs — task001 API drift guard)', () => {
    // The store method shipped in task001 is `reorder`. If someone
    // retrofits `reorderTabs` the drag handler silently no-ops because
    // the selector returns undefined — test catches it at the source.
    expect(src).toMatch(/s\.reorder\b/);
    expect(src).not.toMatch(/\breorderTabs\b/);
  });

  it('references all four mutation actions (openTab, closeTab, setActiveTab, reorder)', () => {
    expect(src).toContain('openTab');
    expect(src).toContain('closeTab');
    expect(src).toContain('setActiveTab');
    expect(src).toContain('reorder');
  });

  it('iterates the store via order + buildOrderedTabs (never tabs.map directly)', () => {
    // Strip comments so we don't trip on prose that happens to mention
    // `tabs.map(` — we only care about executable code.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).not.toMatch(/\btabs\.map\(/);
    expect(src).toContain('buildOrderedTabs');
    expect(src).toMatch(/from ['"]@\/lib\/chat-tab-order['"]/);
  });

  it('has a !loaded guard before rendering tab chips', () => {
    // The chat tab store hydrates asynchronously — any render path that
    // iterates `order` before `load()` resolves will flash an empty bar
    // and immediately repaint, which looks like a bug.
    expect(src).toMatch(/s\.loaded\b/);
    expect(src).toMatch(/if\s*\(\s*!\s*loaded\s*\)/);
  });
});

describe('chat-panel.tsx — ChatTabBar mount', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('imports and mounts <ChatTabBar /> at the top of the panel', () => {
    expect(src).toMatch(/from ['"]@\/components\/chat\/chat-tab-bar['"]/);
    expect(src).toContain('ChatTabBar');
    expect(src).toMatch(/<ChatTabBar\b/);
  });
});
