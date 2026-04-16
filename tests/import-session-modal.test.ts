// tests/import-session-modal.test.ts
//
// Unit tests for the import-session picker modal
// (chat-import-platforms-task003).
//
// Strategy (per `reference_vitest_client_excluded` in project memory):
// vitest excludes `client/` so we can't render the modal component here.
// Instead:
//   1. Pure-logic tests — the click handler was extracted into
//      `handleImportSession` (plus two small helpers, `buildSessionDisplayLabel`
//      and `buildImportedTabTitle`) so the API-call/store/close flow can be
//      unit-tested end-to-end with fetch + store doubles.
//   2. Source-text guardrails — read the TSX files and pin the structural
//      invariants the pure tests can't see (button wiring in the tab bar,
//      empty-state copy in the modal, the use of Dialog + ScrollArea, etc).
//
// Maps to the 6 contract test cases:
//   1. Modal renders scanner sessions        — source guardrail
//   2. Empty state shows no-sessions message — source guardrail
//   3. Clicking session triggers import      — pure-logic test
//   4. Import success opens new tab in store — pure-logic test
//   5. Import success sets new tab active    — pure-logic test (openTab
//      itself sets the new tab active — that's covered by chat-tabs-store
//      tests — so we assert openTab is called with the new id; calling
//      setActiveTab a second time would be a redundant PUT)
//   6. Import closes modal on success        — pure-logic test

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  buildImportedTabTitle,
  buildSessionDisplayLabel,
  handleImportSession,
  type ImportSessionDeps,
} from '../client/src/components/chat/import-session-modal';

const ROOT = path.resolve(__dirname, '..');
const MODAL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/import-session-modal.tsx',
);
const TAB_BAR_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-tab-bar.tsx',
);

// ---------------------------------------------------------------------------
// Pure-helper tests (no component, no store)
// ---------------------------------------------------------------------------

describe('buildSessionDisplayLabel', () => {
  it('prefers firstMessage when present', () => {
    expect(
      buildSessionDisplayLabel({
        id: 'abc',
        firstMessage: 'hello world',
        slug: 'slug-x',
      }),
    ).toBe('hello world');
  });

  it('falls back to slug when firstMessage is empty', () => {
    expect(
      buildSessionDisplayLabel({ id: 'abc', firstMessage: '  ', slug: 'slug-x' }),
    ).toBe('slug-x');
  });

  it('falls back to id when neither firstMessage nor slug is set', () => {
    expect(buildSessionDisplayLabel({ id: 'abc' })).toBe('abc');
  });
});

describe('buildImportedTabTitle', () => {
  it('prefixes "Imported: " and passes short labels through', () => {
    expect(buildImportedTabTitle('hello')).toBe('Imported: hello');
  });

  it('truncates very long labels with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const result = buildImportedTabTitle(long);
    expect(result.startsWith('Imported: ')).toBe(true);
    expect(result.length).toBeLessThan('Imported: '.length + 200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles empty input with a generic fallback', () => {
    expect(buildImportedTabTitle('   ')).toBe('Imported: session');
  });
});

// ---------------------------------------------------------------------------
// handleImportSession — pure-logic tests for cases 3-6
// ---------------------------------------------------------------------------

/**
 * Builds a set of deps with vi.fn() spies + a canned fetch response. The
 * factory centralises the happy-path so individual tests just override the
 * bits they care about.
 */
function makeDeps(overrides: Partial<ImportSessionDeps> = {}): {
  deps: ImportSessionDeps;
  fetchFn: ReturnType<typeof vi.fn>;
  openTab: ReturnType<typeof vi.fn>;
  closeModal: ReturnType<typeof vi.fn>;
} {
  const fetchFn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ newConversationId: 'new-conv-1', eventCount: 12 }),
  } as unknown as Response);
  const openTab = vi.fn().mockResolvedValue(undefined);
  const closeModal = vi.fn();
  const deps: ImportSessionDeps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    openTab,
    closeModal,
    ...overrides,
  };
  return { deps, fetchFn, openTab, closeModal };
}

describe('handleImportSession', () => {
  it('case 3: POSTs to /api/chat/import with sourceConversationId', async () => {
    const { deps, fetchFn } = makeDeps();
    await handleImportSession('src-id', 'hello world', deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/chat/import');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ sourceConversationId: 'src-id' });
  });

  it('case 4: on success, opens a new tab with the new conversation id', async () => {
    const { deps, openTab } = makeDeps();
    await handleImportSession('src-id', 'hello world', deps);
    expect(openTab).toHaveBeenCalledTimes(1);
    const [newId, title] = openTab.mock.calls[0];
    expect(newId).toBe('new-conv-1');
    expect(title).toBe('Imported: hello world');
  });

  it('case 5: openTab is the single store mutation (openTab sets active on its own)', async () => {
    // The chat-tabs-store openTab action already sets `activeTabId` to the
    // new conversation — calling a separate setActiveTab would fire a
    // redundant PUT. Pin that we only invoke openTab once here.
    const { deps, openTab } = makeDeps();
    await handleImportSession('src-id', 'label', deps);
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it('case 6: closes the modal on success', async () => {
    const { deps, closeModal } = makeDeps();
    await handleImportSession('src-id', 'label', deps);
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it('throws without closing the modal when /api/chat/import responds non-2xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not found' }),
    } as unknown as Response);
    const openTab = vi.fn().mockResolvedValue(undefined);
    const closeModal = vi.fn();
    const deps: ImportSessionDeps = {
      fetchFn: fetchFn as unknown as typeof fetch,
      openTab,
      closeModal,
    };
    await expect(handleImportSession('src-id', 'label', deps)).rejects.toThrow(
      /import failed/,
    );
    expect(openTab).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('uses a custom buildTitle when provided', async () => {
    const { deps, openTab } = makeDeps({
      buildTitle: (label) => `CUSTOM ${label}`,
    });
    await handleImportSession('src-id', 'hi', deps);
    const [, title] = openTab.mock.calls[0];
    expect(title).toBe('CUSTOM hi');
  });
});

// ---------------------------------------------------------------------------
// Source-text guardrails — cases 1 and 2 + structural pins
// ---------------------------------------------------------------------------

describe('import-session-modal.tsx — source guardrails', () => {
  const src = fs.readFileSync(MODAL_PATH, 'utf-8');

  it('imports Dialog + ScrollArea from the shadcn ui components', () => {
    expect(src).toMatch(/from ['"]@\/components\/ui\/dialog['"]/);
    expect(src).toMatch(/from ['"]@\/components\/ui\/scroll-area['"]/);
    expect(src).toContain('ScrollArea');
    expect(src).toContain('DialogContent');
  });

  it('imports the chat-tabs store', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).toContain('useChatTabsStore');
  });

  it('case 1: renders one row per session via .map over the sessions list', () => {
    // Strip comments so we don't match on prose.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).toMatch(/sessions\.map\(/);
  });

  it('case 2: has an empty-state fallback string', () => {
    expect(src).toContain('No sessions found');
    expect(src).toContain('import-session-modal-empty');
  });

  it('calls /api/chat/import exactly once via the extracted handler', () => {
    // The component should delegate to handleImportSession, not inline a
    // second fetch. Strip comments first so prose mentions of the endpoint
    // don't count — only executable code does.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const endpointMatches = codeOnly.match(/\/api\/chat\/import/g) ?? [];
    expect(endpointMatches.length).toBe(1);
    expect(src).toContain('handleImportSession');
  });

  it('lists scanner sessions via the existing /api/sessions endpoint', () => {
    // No new endpoint — the contract forbids inventing one. Must use
    // /api/sessions (the same endpoint the Sessions page uses).
    expect(src).toMatch(/\/api\/sessions\b/);
  });

  it('uses react-query to lazy-load sessions when the modal opens', () => {
    expect(src).toMatch(/from ['"]@tanstack\/react-query['"]/);
    expect(src).toContain('useQuery');
    expect(src).toMatch(/enabled:\s*open/);
  });
});

describe('chat-tab-bar.tsx — import button wiring (task003)', () => {
  const src = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

  it('imports the ImportSessionModal component', () => {
    expect(src).toMatch(/from ['"]@\/components\/chat\/import-session-modal['"]/);
    expect(src).toContain('ImportSessionModal');
  });

  it('renders an accessible Import button next to the + new-tab button', () => {
    expect(src).toMatch(/aria-label=["']Import session["']/);
    expect(src).toContain('chat-tab-import');
  });

  it('mounts <ImportSessionModal /> so the button can open it', () => {
    expect(src).toMatch(/<ImportSessionModal\b/);
  });
});
