/**
 * Parser + dispatcher tests for the client-side slash command router shipped
 * in chat-workflows-tabs-task003.
 *
 * Archon pattern: the chat input is AI-only. Slash commands are intercepted
 * on the client, parsed into a structured `{ name, args, raw }` payload, and
 * POSTed as JSON to `/api/chat/workflow`. The client does NOT hold a static
 * registry of workflow names — the server is the source of truth and returns
 * 404 for unknown workflows so the client can fall through to the normal AI
 * prompt path.
 *
 * Vitest excludes `client/`, so (per `reference_vitest_client_excluded`)
 * this file imports the library directly from the client tree and mocks
 * `fetch` via `vi.stubGlobal`. No React Testing Library, no JSX.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSlashCommand,
  dispatchCommand,
} from '../client/src/lib/chat-commands';

describe('parseSlashCommand', () => {
  it('returns null for plain text without a leading slash', () => {
    expect(parseSlashCommand('hello world')).toBeNull();
  });

  it('returns null for a lone slash or whitespace-only slash input', () => {
    // `/` alone, `/` followed by whitespace, and leading-whitespace
    // variants all collapse to an empty command name — they must be
    // treated as "not a slash command" so the caller falls through to
    // AI as a normal prompt (an empty input is separately guarded by
    // the caller's `.trim()` check).
    expect(parseSlashCommand('/')).toBeNull();
    expect(parseSlashCommand('/ ')).toBeNull();
    expect(parseSlashCommand('   /   ')).toBeNull();
  });

  it('extracts name and args from a standard slash command', () => {
    expect(parseSlashCommand('/workflow validate')).toEqual({
      name: 'workflow',
      args: 'validate',
      raw: '/workflow validate',
    });
  });

  it('handles a command with no args', () => {
    expect(parseSlashCommand('/build')).toEqual({
      name: 'build',
      args: '',
      raw: '/build',
    });
  });

  it('trims leading whitespace and reports the trimmed form as raw', () => {
    const parsed = parseSlashCommand('  /cmd one two');
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('cmd');
    expect(parsed!.args).toBe('one two');
    expect(parsed!.raw).toBe('/cmd one two');
  });

  it('collapses interior whitespace between tokens', () => {
    // Users double-spacing between args should not produce garbage tokens
    // in the dispatched payload — `filter(Boolean)` in the split drops
    // empty strings before the `.join(' ')`.
    const parsed = parseSlashCommand('/cmd   a   b');
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('cmd');
    expect(parsed!.args).toBe('a b');
  });
});

describe('dispatchCommand', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('POSTs JSON to /api/chat/workflow with the expected body shape', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const parsed = {
      name: 'workflow',
      args: 'validate',
      raw: '/workflow validate',
    };
    await dispatchCommand(parsed, 'conv-abc');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/workflow');
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      conversationId: 'conv-abc',
      workflow: 'workflow',
      args: 'validate',
      raw: '/workflow validate',
    });
  });

  it('returns { handled: true } when the server responds 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
      })),
    );

    const result = await dispatchCommand(
      { name: 'build', args: '', raw: '/build' },
      'conv-1',
    );
    expect(result).toEqual({ handled: true });
  });

  it('returns { handled: false } when the server responds 404 (unknown workflow)', async () => {
    // 404 is the Archon fall-through signal: the server does not recognise
    // this workflow name, so the caller should POST the raw input to the
    // AI prompt endpoint instead.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })),
    );

    const result = await dispatchCommand(
      { name: 'nosuch', args: '', raw: '/nosuch' },
      'conv-1',
    );
    expect(result).toEqual({ handled: false });
  });

  it('throws a descriptive error on non-404 non-2xx (e.g. 500)', async () => {
    // Anything other than 2xx or 404 is a real dispatch failure — we must
    // NOT silently fall through to AI (that would double-execute on a
    // transient backend hiccup). Throwing forces the caller's try/catch
    // path, which surfaces the error and aborts the send.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })),
    );

    await expect(
      dispatchCommand(
        { name: 'broken', args: '', raw: '/broken' },
        'conv-1',
      ),
    ).rejects.toThrow(/500/);
  });
});
