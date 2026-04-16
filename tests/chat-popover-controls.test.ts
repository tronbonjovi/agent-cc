// tests/chat-popover-controls.test.ts
//
// chat-composer-controls task005 — Popover controls for effort, extended
// thinking, web search, system prompt, and file attachments.
//
// Three layers verified (same pattern as task004 / task003):
//
//   1. Source-text guardrails on `settings-popover.tsx` — each control has
//      a stable `data-testid` mount point so task007 (capability gating)
//      can toggle visibility without brittle DOM traversal.
//
//   2. Pure-logic through the settings store — updateSettings for effort /
//      thinking / webSearch / systemPrompt / attachments round-trips and
//      `getSettings(id)` reflects the override.
//
//   3. CLI-arg passthrough for effort + systemPrompt through
//      `runClaudeStreaming`. `thinking` and `webSearch` are intentionally
//      NOT wired to CLI flags — `claude --help` shows no `--thinking` or
//      `--web-search` options today, so those controls land as store-only
//      state until the capability system (future milestone) maps them to
//      provider-specific plumbing. The store field must still exist so the
//      UI can persist user intent.
//
// Vitest excludes `client/` (see reference_vitest_client_excluded) so the
// popover is never rendered — behavioral guards are pure-logic store tests
// + source-text pins on the tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { useChatSettingsStore } from '../client/src/stores/chat-settings-store';

const ROOT = path.resolve(__dirname, '..');
const SETTINGS_POPOVER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/settings-popover.tsx',
);
const SHARED_TYPES_PATH = path.resolve(ROOT, 'shared/types.ts');
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

// ---------------------------------------------------------------------------
// 1. Source-text guardrails on settings-popover.tsx — five new controls
// ---------------------------------------------------------------------------

describe('settings-popover.tsx — task005 controls', () => {
  const src = fs.readFileSync(SETTINGS_POPOVER_PATH, 'utf-8');

  it('replaces the task005 placeholder slot (no empty <div data-testid=chat-settings-slot-task005 />)', () => {
    // Regression: the placeholder from task004 was a self-closing empty div.
    // Once the controls land, the testid either disappears or wraps real
    // content — in either case the placeholder empty-div pattern must be
    // gone.
    expect(src).not.toMatch(
      /data-testid=["']chat-settings-slot-task005["']\s*\/>/,
    );
  });

  it('task006 placeholder slot has been replaced by the project selector', () => {
    // When task005 shipped, the task006 slot was still the empty placeholder.
    // Once task006 lands, the empty-div placeholder must be gone. The real
    // selector test lives in chat-project-selector.test.ts.
    expect(src).not.toMatch(
      /data-testid=["']chat-settings-slot-task006["']\s*\/>/,
    );
  });

  it('mounts an effort selector with low/medium/high options', () => {
    expect(src).toMatch(/data-testid=["']chat-settings-effort["']/);
    // Use case-sensitive pins on the three expected levels (matches the CLI
    // --effort flag values: low, medium, high). xhigh / max are intentionally
    // out of scope for the first cut.
    expect(src).toMatch(/\blow\b/);
    expect(src).toMatch(/\bmedium\b/);
    expect(src).toMatch(/\bhigh\b/);
  });

  it('mounts an extended thinking toggle', () => {
    expect(src).toMatch(/data-testid=["']chat-settings-thinking["']/);
    expect(src).toMatch(/Extended thinking/i);
  });

  it('mounts a web search toggle', () => {
    expect(src).toMatch(/data-testid=["']chat-settings-web-search["']/);
    expect(src).toMatch(/Web search/i);
  });

  it('mounts a collapsible system prompt section', () => {
    // Section header that toggles visibility.
    expect(src).toMatch(/data-testid=["']chat-settings-system-prompt-toggle["']/);
    // Textarea element — shown only when expanded.
    expect(src).toMatch(/data-testid=["']chat-settings-system-prompt["']/);
    expect(src).toMatch(/System prompt/i);
    // Placeholder copy — pinned so the hint text doesn't silently drift.
    expect(src).toMatch(/Custom instructions for this conversation/i);
  });

  it('mounts a file attachment control with a hidden input', () => {
    expect(src).toMatch(/data-testid=["']chat-settings-attachments["']/);
    // An <input type="file" multiple .../> is the accepted primitive here
    // because the shadcn UI folder has no file-picker component and we
    // intentionally don't want to build one from scratch.
    expect(src).toMatch(/type=["']file["']/);
    expect(src).toMatch(/\bmultiple\b/);
    // "Attach file" button label.
    expect(src).toMatch(/Attach file/i);
  });

  it('reads + writes each new field through the settings store', () => {
    expect(src).toMatch(/\beffort\s*:/);
    expect(src).toMatch(/\bthinking\s*:/);
    expect(src).toMatch(/\bwebSearch\s*:/);
    expect(src).toMatch(/\bsystemPrompt\s*:/);
    expect(src).toMatch(/\battachments\s*:/);
  });

  it('has no gradient or bounce/scale animations (safety)', () => {
    expect(src).not.toMatch(/\bbg-gradient-/);
    expect(src).not.toMatch(/\btext-gradient\b/);
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bhover:scale-/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });
});

// ---------------------------------------------------------------------------
// 2. shared/types.ts — ChatSettings gains `attachments?: string[]`
// ---------------------------------------------------------------------------

describe('shared/types.ts — ChatSettings.attachments', () => {
  const src = fs.readFileSync(SHARED_TYPES_PATH, 'utf-8');

  it('declares attachments as an optional string[] field on ChatSettings', () => {
    // `attachments` holds the file PATHS the user has added to this
    // conversation — content injection is deferred. Optional because the
    // vast majority of conversations have no attachments.
    expect(src).toMatch(/attachments\?\s*:\s*string\[\]/);
  });
});

// ---------------------------------------------------------------------------
// 3. Pure-logic: each control writes its field through updateSettings
// ---------------------------------------------------------------------------

function resetStore() {
  useChatSettingsStore.setState({
    globalDefaults: {
      providerId: 'claude-code',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
    },
    overrides: {},
    loaded: false,
  });
}

describe('chat settings store — task005 field coverage', () => {
  beforeEach(() => {
    resetStore();
  });

  it('updateSettings({ effort }) records the override', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', { effort: 'high' });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.effort).toBe('high');
  });

  it('updateSettings({ thinking }) records the override', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', { thinking: true });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.thinking).toBe(true);
  });

  it('updateSettings({ webSearch }) records the override', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', { webSearch: true });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.webSearch).toBe(true);
  });

  it('updateSettings({ systemPrompt }) records the override', () => {
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { systemPrompt: 'Be terse.' });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.systemPrompt).toBe('Be terse.');
  });

  it('updateSettings({ attachments }) records paths as a string[]', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', {
      attachments: ['/tmp/a.txt', '/tmp/b.png'],
    });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.attachments).toEqual(['/tmp/a.txt', '/tmp/b.png']);
  });

  it('per-conversation isolation: controls on conv-1 do not leak to conv-2', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', {
      effort: 'high',
      thinking: true,
      systemPrompt: 'conv-1 prompt',
    });
    const conv2 = useChatSettingsStore.getState().getSettings('conv-2');
    expect(conv2.effort).toBe('medium'); // default
    expect(conv2.thinking).toBeUndefined();
    expect(conv2.systemPrompt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Runner-side CLI args — --effort and --append-system-prompt passthrough
// ---------------------------------------------------------------------------
//
// `claude --help` (verified 2026-04-16) lists:
//   --effort <level>                low, medium, high, xhigh, max
//   --append-system-prompt <prompt> Append a system prompt to the default
//   --system-prompt <prompt>        Replace the system prompt entirely
//
// We wire:
//   - opts.effort       → `--effort <level>`
//   - opts.systemPrompt → `--append-system-prompt <text>` (appends to the
//     CLI's default, preserving Claude Code's expected behavior; using
//     --system-prompt would overwrite the CLI's prompt, breaking tools)
//
// NOT wired (no matching CLI flag today):
//   - opts.thinking     → no `--thinking` flag exists
//   - opts.webSearch    → no `--web-search` flag exists
//
// Runner tests use vi.mock('child_process'), same pattern as
// chat-model-dropdown.test.ts. Kept here so task005's runner contract is
// pinned in one file.

vi.mock('child_process', () => {
  return { spawn: vi.fn() };
});

import { spawn } from 'child_process';
import { runClaudeStreaming } from '../server/scanner/claude-runner';

function makeFakeChild() {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn(() => {
    setImmediate(() => child.emit('close', null));
  });
  return child;
}

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

async function drain(iter: AsyncGenerator<unknown>, child: any) {
  const consume = (async () => {
    try {
      for await (const _c of iter) {
        /* drain */
      }
    } catch {
      /* ignore */
    }
  })();
  await Promise.resolve();
  queueMicrotask(() => child.emit('close', 0));
  await consume;
}

describe('runClaudeStreaming — task005 CLI flag passthrough', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes --effort <level> when opts.effort is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: 'hi', effort: 'high' });
    await drain(iter, child);

    expect(spawnMock).toHaveBeenCalled();
    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain('--effort');
    expect(a[a.indexOf('--effort') + 1]).toBe('high');
  });

  it('omits --effort when opts.effort is not provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: 'hi' });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain('--effort');
  });

  it('includes --append-system-prompt <text> when opts.systemPrompt is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: 'hi',
      systemPrompt: 'Be terse.',
    });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain('--append-system-prompt');
    expect(a[a.indexOf('--append-system-prompt') + 1]).toBe('Be terse.');
  });

  it('omits --append-system-prompt when opts.systemPrompt is empty string', async () => {
    // Empty string shouldn't land as an empty flag value — treat falsy
    // system prompts as "not set" at the runner boundary.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: 'hi', systemPrompt: '' });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain('--append-system-prompt');
  });

  it('does NOT add --thinking or --web-search flags (no such CLI options)', async () => {
    // Regression guard: these booleans exist on StreamingClaudeOptions so
    // the route can accept them, but the runner must not invent flags that
    // don't exist — `claude --help` shows no --thinking or --web-search.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: 'hi',
      thinking: true,
      webSearch: true,
    } as any);
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).not.toContain('--thinking');
    expect(a).not.toContain('--web-search');
    expect(a).not.toContain('--webSearch');
  });

  it('passes effort and systemPrompt alongside --model and --resume', async () => {
    // Regression guard: all four flags coexist without clobbering each
    // other.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: 'hi',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-9',
      effort: 'medium',
      systemPrompt: 'context',
    });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain('--model');
    expect(a).toContain('--resume');
    expect(a).toContain('--effort');
    expect(a).toContain('--append-system-prompt');
    expect(a[a.indexOf('--effort') + 1]).toBe('medium');
    expect(a[a.indexOf('--append-system-prompt') + 1]).toBe('context');
  });
});

// ---------------------------------------------------------------------------
// 5. Route-level passthrough — POST /api/chat/prompt forwards new settings
// ---------------------------------------------------------------------------
//
// Covered in tests/chat-popover-controls-route.test.ts (separate file) so
// the runner `vi.mock('child_process')` and the route
// `vi.mock('../server/scanner/claude-runner')` don't collide — same split
// reason as chat-model-dropdown.test.ts vs chat-model-dropdown-route.test.ts.
//
// This file handles runner + source-text. The route-forwarding contract
// lives next door.

// ---------------------------------------------------------------------------
// 6. chat-panel.tsx sends the new fields in the POST body
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — forwards task005 settings in POST body', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('includes effort, thinking, webSearch, systemPrompt in the fetch body', () => {
    // Structural pin: the JSON.stringify call on the POST body mentions
    // each new field. Relies on the existing stringify block that already
    // forwards `conversationId` + `text` + `model` from task003.
    const stringify = src.match(
      /JSON\.stringify\s*\(\s*\{[^}]*\}\s*\)/s,
    );
    expect(stringify, 'expected a JSON.stringify POST body').not.toBeNull();
    const body = stringify![0];
    expect(body).toMatch(/\beffort\b/);
    expect(body).toMatch(/\bthinking\b/);
    expect(body).toMatch(/\bwebSearch\b/);
    expect(body).toMatch(/\bsystemPrompt\b/);
  });
});
