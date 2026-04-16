/**
 * Source-text guardrail for the client-side slash command dispatcher.
 *
 * Security regression guard: the client must never shell out. Its
 * only job is to parse the input into a `{ name, args, raw }` payload and
 * POST it as JSON to `/api/chat/workflow`. The server decides whether a
 * workflow exists and what to run — the client has zero execution
 * authority. This test pins that invariant at the source level so a
 * future "helpful" refactor can't quietly add `child_process` back in.
 *
 * Scope note: this is a source-text check (like `chat-tab-bar-source.test.ts`)
 * because vitest's `exclude: ["client"]` config means we can't import and
 * introspect module internals the way we would for a server file. Regex on
 * the file contents is the idiomatic M6 pattern for client guardrails.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const CHAT_COMMANDS_PATH = path.resolve(
  ROOT,
  'client/src/lib/chat-commands.ts',
);

describe('chat-commands.ts — security guardrail', () => {
  const src = fs.readFileSync(CHAT_COMMANDS_PATH, 'utf-8');

  it('does not reference child_process, exec, spawn, or shell', () => {
    // Strip comments so the prose in this file explaining *why* we ban
    // these identifiers doesn't trip its own guardrail.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(codeOnly).not.toMatch(/\bchild_process\b/);
    expect(codeOnly).not.toMatch(/\bexec\b/);
    expect(codeOnly).not.toMatch(/\bspawn\b/);
    expect(codeOnly).not.toMatch(/\bshell\b/);
  });
});
