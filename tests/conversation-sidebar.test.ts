// tests/conversation-sidebar.test.ts
//
// Source-text guardrails for the ConversationSidebar component shipped in
// chat-import-platforms task004. Vitest excludes the client/ directory, so
// we can't render this component — the strategy (per
// `reference_vitest_client_excluded`) is to pin the structural invariants
// with regex assertions on the TSX file itself.
//
// The interaction logic has a dedicated pure-function test in
// `tests/conversation-grouping.test.ts`; this file just locks in:
//
//   1. the sidebar iterates both `getWiredSources()` and `getPlannedSources()`
//   2. it imports from the SOURCE_METADATA registry (task001)
//   3. it calls `handleConversationClick` from the grouping helper
//   4. it uses `useChatTabsStore` for openTab / setActiveTab
//   5. it wires an `all-conversations` React Query against the task004 endpoint
//   6. ChatPanel mounts the sidebar as a left rail inside a PanelGroup

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SIDEBAR_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/conversation-sidebar.tsx',
);
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

describe('conversation-sidebar.tsx — source guardrails', () => {
  const src = fs.readFileSync(SIDEBAR_PATH, 'utf-8');

  it('imports SOURCE_METADATA + wired/planned accessors from shared/source-metadata', () => {
    expect(src).toMatch(/from ['"][^'"]*shared\/source-metadata['"]/);
    expect(src).toContain('SOURCE_METADATA');
    expect(src).toContain('getWiredSources');
    expect(src).toContain('getPlannedSources');
  });

  it('iterates both wired AND planned sources so every section renders', () => {
    // Planned sources must render even with zero conversations — the sidebar
    // is the registry surface for future integrations, not just current data.
    expect(src).toMatch(/getWiredSources\(\)/);
    expect(src).toMatch(/getPlannedSources\(\)/);
  });

  it('uses useChatTabsStore for openTab and setActiveTab', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).toContain('useChatTabsStore');
    expect(src).toContain('openTab');
    expect(src).toContain('setActiveTab');
  });

  it('calls handleConversationClick from the grouping helper', () => {
    // The real dispatch logic lives in @/lib/conversation-grouping so it can
    // be unit-tested. The sidebar must not re-implement the three-branch
    // source dispatch inline.
    expect(src).toMatch(/from ['"]@\/lib\/conversation-grouping['"]/);
    expect(src).toContain('handleConversationClick');
    expect(src).toContain('groupConversationsBySource');
  });

  it('queries the task004 /api/chat/conversations/all endpoint via React Query', () => {
    expect(src).toMatch(/useQuery/);
    expect(src).toMatch(/['"]all-conversations['"]/);
    expect(src).toContain('/api/chat/conversations/all');
  });

  it('renders a count even for empty sections (planned sources with zero convs)', () => {
    // The count badge pattern `({conversations.length})` must appear so every
    // source section exposes its (possibly zero) count regardless of data.
    expect(src).toMatch(/conversations\.length/);
    // And the section header must render unconditionally — the `{open && …}`
    // guard only hides the *body*, not the header with the count.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).toMatch(/SidebarSection/);
  });

  it('marks planned sources with disabled=true on the section button row', () => {
    // Prevents accidentally wiring planned sources to the same click path
    // as wired ones — the pure dispatch function already no-ops, but the
    // UI also needs to grey them out.
    expect(src).toMatch(/disabled=\{true\}/);
  });

  it('imports the ConversationSummary type from the grouping helper (no local any drift)', () => {
    // Guard against a regression where a future edit would inline `any`
    // for the conversation shape. Strict TS flags ban `any` but catching
    // it here gives a clearer failure message than the tsc output.
    expect(src).toContain('ConversationSummary');
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).not.toMatch(/\bany\b/);
  });
});

describe('chat-panel.tsx — ConversationSidebar mount', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('imports ConversationSidebar from the chat folder', () => {
    expect(src).toMatch(/from ['"]@\/components\/chat\/conversation-sidebar['"]/);
    expect(src).toContain('ConversationSidebar');
  });

  it('mounts <ConversationSidebar /> inside the chat panel', () => {
    expect(src).toMatch(/<ConversationSidebar\b/);
  });

  it('uses react-resizable-panels for the left-rail split', () => {
    // Nested PanelGroup so the rail is draggable and the ChatTabBar +
    // message area stay on their own Panel.
    expect(src).toMatch(/from ['"]react-resizable-panels['"]/);
    expect(src).toMatch(/\bPanelGroup\b/);
  });
});
