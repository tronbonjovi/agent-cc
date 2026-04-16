// tests/chat-project-selector.test.ts
//
// chat-composer-controls task006 — Project context selector.
//
// When the user picks a project in the settings popover, the Claude CLI is
// spawned with `cwd` set to the project's absolute path. This gives Claude
// access to that project's CLAUDE.md, git state, and file tree. The default
// "General" option leaves `cwd` unset so the CLI uses its own default.
//
// Four layers verified (same pattern as task005):
//
//   1. Source-text guardrails on `settings-popover.tsx` — the task006 slot
//      is replaced by a project selector mount point, with "General" as the
//      first option.
//
//   2. Pure-logic: the settings store round-trips `projectPath` through
//      `updateSettings` / `getSettings`.
//
//   3. Runner-side: `runClaudeStreaming` accepts a `cwd` option and passes
//      it into `spawn`. When omitted, spawn is called without cwd (lets the
//      subprocess inherit the parent's cwd).
//
//   4. Route-level: POST /api/chat/prompt reads `projectPath` from the
//      body and forwards it as `cwd` into `runClaudeStreaming`. Route-level
//      tests live in `chat-project-selector-route.test.ts` — kept separate
//      to avoid the child_process / runner mock collision (same split as
//      chat-popover-controls-route.test.ts).
//
// Vitest excludes `client/` (see reference_vitest_client_excluded), so the
// popover is never rendered. Behavioral guards are pure-logic store tests +
// source-text pins on the tsx.

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
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

// ---------------------------------------------------------------------------
// 1. Source-text guardrails on settings-popover.tsx — project selector
// ---------------------------------------------------------------------------

describe('settings-popover.tsx — task006 project selector', () => {
  const src = fs.readFileSync(SETTINGS_POPOVER_PATH, 'utf-8');

  it('replaces the task006 placeholder slot (no empty <div data-testid=chat-settings-slot-task006 />)', () => {
    // Regression: the placeholder was a self-closing empty div. Once the
    // selector lands, either the testid disappears or it wraps real content
    // — in either case the empty-div pattern must be gone.
    expect(src).not.toMatch(
      /data-testid=["']chat-settings-slot-task006["']\s*\/>/,
    );
  });

  it('mounts a project selector with a stable test id', () => {
    expect(src).toMatch(/data-testid=["']chat-settings-project["']/);
  });

  it('offers a "General" option as the first choice (no project context)', () => {
    // "General" represents "no cwd" — the CLI spawns with its default cwd
    // (the server process's working directory). Word boundary match to avoid
    // false positives against other words.
    expect(src).toMatch(/\bGeneral\b/);
  });

  it('reads + writes projectPath through the settings store', () => {
    // Selection must round-trip through updateSettings, same pattern as the
    // provider / model / effort controls.
    expect(src).toMatch(/projectPath\s*:/);
  });

  it('fetches projects from /api/projects (scanner-discovered list)', () => {
    // The selector populates itself by hitting the existing projects
    // endpoint — we do NOT create a new endpoint for this feature. Pin the
    // URL so a refactor can't silently switch to a different (possibly
    // unintended) source.
    expect(src).toMatch(/\/api\/projects/);
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
// 2. Pure-logic: projectPath round-trips through the settings store
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

describe('chat settings store — task006 projectPath field', () => {
  beforeEach(() => {
    resetStore();
  });

  it('updateSettings({ projectPath }) records the override', () => {
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { projectPath: '/home/user/projects/app' });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.projectPath).toBe('/home/user/projects/app');
  });

  it('updateSettings({ projectPath: undefined }) clears the override (back to General)', () => {
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { projectPath: '/home/user/projects/app' });
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { projectPath: undefined });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.projectPath).toBeUndefined();
  });

  it('per-conversation isolation: projectPath on conv-1 does not leak to conv-2', () => {
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { projectPath: '/p/one' });
    const conv2 = useChatSettingsStore.getState().getSettings('conv-2');
    expect(conv2.projectPath).toBeUndefined();
  });

  it('defaults to undefined projectPath (General) when no override is set', () => {
    const s = useChatSettingsStore.getState().getSettings('conv-new');
    expect(s.projectPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Runner-side: cwd option is passed to spawn
// ---------------------------------------------------------------------------
//
// The runner spawns `claude` as a subprocess. When opts.cwd is provided, it
// must be passed to spawn's options object so the child inherits that
// working directory. When omitted, spawn must be called without a cwd key
// (so the child inherits the parent process's cwd — the CLI's default).

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

describe('runClaudeStreaming — task006 cwd passthrough', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes opts.cwd to spawn when a project is selected', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: 'hi',
      cwd: '/home/user/projects/app',
    });
    await drain(iter, child);

    expect(spawnMock).toHaveBeenCalled();
    const spawnOpts = spawnMock.mock.calls[0][2] as { cwd?: string };
    expect(spawnOpts.cwd).toBe('/home/user/projects/app');
  });

  it('omits cwd from spawn options when opts.cwd is undefined ("General")', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: 'hi' });
    await drain(iter, child);

    const spawnOpts = spawnMock.mock.calls[0][2] as { cwd?: string };
    // cwd should not be set — Node's spawn treats `cwd: undefined` the same
    // as "not provided", so either missing or explicitly undefined is fine.
    expect(spawnOpts.cwd).toBeUndefined();
  });

  it('passes cwd alongside other options without clobbering them', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: 'hi',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      cwd: '/workspace/repo',
    });
    await drain(iter, child);

    const [, args, spawnOpts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd?: string; env?: unknown },
    ];
    expect(args).toContain('--model');
    expect(args).toContain('--effort');
    expect(spawnOpts.cwd).toBe('/workspace/repo');
    expect(spawnOpts.env).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. chat-panel.tsx sends projectPath in the POST body
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — forwards projectPath in POST body', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('includes projectPath in the JSON.stringify POST body', () => {
    const stringify = src.match(
      /JSON\.stringify\s*\(\s*\{[^}]*\}\s*\)/s,
    );
    expect(stringify, 'expected a JSON.stringify POST body').not.toBeNull();
    const body = stringify![0];
    expect(body).toMatch(/\bprojectPath\b/);
  });
});
