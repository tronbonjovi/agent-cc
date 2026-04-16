// tests/conversation-sidebar.test.ts
//
// Source-text guardrails for the ConversationSidebar component — rewritten
// for chat-scanner-unification task003. The old multi-source grouping sidebar
// was replaced with a simple chat session list.
//
// Vitest excludes the client/ directory, so we pin structural invariants with
// regex assertions on the TSX source file.

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

  it('does NOT import conversation-grouping', () => {
    // The old source-grouping approach is gone.
    expect(src).not.toMatch(/from ['"]@\/lib\/conversation-grouping['"]/);
  });

  it('does NOT import InteractionSource as a type', () => {
    // InteractionSource may appear in comments but must not be imported.
    expect(src).not.toMatch(/import\s+type\s*\{[^}]*InteractionSource/);
  });

  it('does NOT import source-metadata or source-filter', () => {
    expect(src).not.toMatch(/from ['"][^'"]*source-metadata['"]/);
    expect(src).not.toMatch(/from ['"][^'"]*source-filter['"]/);
  });

  it('does NOT import ImportSessionModal', () => {
    expect(src).not.toMatch(/ImportSessionModal/);
  });

  it('uses useChatTabsStore for tab awareness', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).toContain('useChatTabsStore');
  });

  it('fetches chat sessions from GET /api/chat/sessions', () => {
    expect(src).toContain('/api/chat/sessions');
    expect(src).toMatch(/useQuery/);
    expect(src).toMatch(/['"]chat-sessions['"]/);
  });

  it('renders open tabs section and recent sessions section', () => {
    expect(src).toContain('Open tabs');
    expect(src).toContain('Recent sessions');
  });

  it('has the conversation-sidebar testid', () => {
    expect(src).toContain('conversation-sidebar');
  });

  it('does not introduce `any` (strict TS hygiene)', () => {
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
    expect(src).toMatch(/from ['"]react-resizable-panels['"]/);
    expect(src).toMatch(/\bPanelGroup\b/);
  });
});

describe('deleted files — no longer exist', () => {
  it('conversation-grouping.ts is deleted', () => {
    const filePath = path.resolve(ROOT, 'client/src/lib/conversation-grouping.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('import-session-modal.tsx is deleted', () => {
    const filePath = path.resolve(ROOT, 'client/src/components/chat/import-session-modal.tsx');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('source-filter.tsx is deleted', () => {
    const filePath = path.resolve(ROOT, 'client/src/components/chat/source-filter.tsx');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
