import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  ParsedSession,
  SessionMeta,
  SessionCounts,
  AssistantRecord,
  TokenUsage,
  ToolCall,
  UserRecord,
  ToolResult,
  ToolExecution,
  TurnDuration,
  HookSummary,
  LocalCommand,
  BridgeEvent,
  FileSnapshot,
  LifecycleEvent,
  ConversationNode,
} from '../shared/session-types';
import { parseSessionFile } from '../server/scanner/session-parser';

// Helper: build a JSONL file from record objects
function buildJSONL(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

// Temp dir for test JSONL files
const tmpDir = path.join(
  os.tmpdir(),
  'cc-parser-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
);

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function writeSession(name: string, records: Record<string, unknown>[]): string {
  const fp = path.join(tmpDir, name + '.jsonl');
  fs.writeFileSync(fp, buildJSONL(records));
  return fp;
}

describe('session-types smoke test', () => {
  it('creates a complete valid ParsedSession stub', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheCreationTokens: 100,
      serviceTier: 'standard',
      inferenceGeo: 'us',
      speed: 'standard',
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    };

    const toolCall: ToolCall = {
      id: 'tc-001',
      name: 'Read',
      filePath: '/src/index.ts',
      command: null,
      pattern: null,
    };

    const assistantMsg: AssistantRecord = {
      uuid: 'a-uuid-001',
      parentUuid: 'u-uuid-001',
      timestamp: '2026-04-11T10:00:00Z',
      requestId: 'req-001',
      isSidechain: false,
      model: 'claude-sonnet-4-20250514',
      stopReason: 'end_turn',
      usage,
      toolCalls: [toolCall],
      hasThinking: true,
      textPreview: 'Here is the implementation...',
    };

    const toolResult: ToolResult = {
      toolUseId: 'tc-001',
      isError: false,
      durationMs: 42,
      success: true,
    };

    const userMsg: UserRecord = {
      uuid: 'u-uuid-002',
      parentUuid: 'a-uuid-001',
      timestamp: '2026-04-11T10:00:01Z',
      isSidechain: false,
      isMeta: false,
      permissionMode: null,
      toolResults: [toolResult],
      textPreview: '',
    };

    const toolExec: ToolExecution = {
      callId: 'tc-001',
      name: 'Read',
      filePath: '/src/index.ts',
      command: null,
      pattern: null,
      timestamp: '2026-04-11T10:00:00Z',
      resultTimestamp: '2026-04-11T10:00:01Z',
      durationMs: 42,
      isError: false,
      isSidechain: false,
    };

    const turnDuration: TurnDuration = {
      timestamp: '2026-04-11T10:00:02Z',
      durationMs: 1500,
      messageCount: 2,
      parentUuid: 'u-uuid-001',
    };

    const hookSummary: HookSummary = {
      timestamp: '2026-04-11T10:00:02Z',
      hookCount: 1,
      hooks: [{ command: 'lint', durationMs: 200 }],
      errors: [],
      preventedContinuation: false,
      stopReason: 'end_turn',
    };

    const localCmd: LocalCommand = {
      timestamp: '2026-04-11T10:00:03Z',
      content: '<command-name>status</command-name>',
    };

    const bridgeEvt: BridgeEvent = {
      timestamp: '2026-04-11T10:00:04Z',
      url: 'https://example.com/session',
      content: 'connected',
    };

    const fileSnap: FileSnapshot = {
      messageId: 'a-uuid-001',
      isUpdate: false,
      timestamp: '2026-04-11T10:00:00Z',
    };

    const lifecycle: LifecycleEvent = {
      timestamp: '2026-04-11T10:00:05Z',
      type: 'permission-change',
      detail: 'auto-accept',
    };

    const node: ConversationNode = {
      uuid: 'u-uuid-001',
      parentUuid: '',
      type: 'user',
      timestamp: '2026-04-11T09:59:59Z',
      isSidechain: false,
    };

    const meta: SessionMeta = {
      sessionId: 'test-session-001',
      slug: 'smoke-test-session',
      firstMessage: 'Hello world',
      firstTs: '2026-04-11T09:59:59Z',
      lastTs: '2026-04-11T10:00:05Z',
      sizeBytes: 4096,
      filePath: '/tmp/test-session.jsonl',
      projectKey: 'test-project',
      cwd: '/home/user/project',
      version: '1.0.0',
      gitBranch: 'main',
      entrypoint: 'cli',
    };

    const counts: SessionCounts = {
      totalRecords: 10,
      assistantMessages: 1,
      userMessages: 1,
      systemEvents: 3,
      toolCalls: 1,
      toolErrors: 0,
      fileSnapshots: 1,
      sidechainMessages: 0,
    };

    const session: ParsedSession = {
      meta,
      assistantMessages: [assistantMsg],
      userMessages: [userMsg],
      systemEvents: {
        turnDurations: [turnDuration],
        hookSummaries: [hookSummary],
        localCommands: [localCmd],
        bridgeEvents: [bridgeEvt],
      },
      toolTimeline: [toolExec],
      fileSnapshots: [fileSnap],
      lifecycle: [lifecycle],
      conversationTree: [node],
      counts,
    };

    // Structural assertions
    expect(session.meta.sessionId).toBe('test-session-001');
    expect(session.meta.slug).toBe('smoke-test-session');
    expect(session.meta.firstMessage).toBe('Hello world');
    expect(session.assistantMessages).toHaveLength(1);
    expect(session.assistantMessages[0].model).toBe('claude-sonnet-4-20250514');
    expect(session.assistantMessages[0].usage.inputTokens).toBe(1000);
    expect(session.assistantMessages[0].toolCalls[0].name).toBe('Read');
    expect(session.assistantMessages[0].hasThinking).toBe(true);
    expect(session.userMessages).toHaveLength(1);
    expect(session.userMessages[0].toolResults[0].isError).toBe(false);
    expect(session.systemEvents.turnDurations[0].durationMs).toBe(1500);
    expect(session.systemEvents.hookSummaries[0].hookCount).toBe(1);
    expect(session.systemEvents.localCommands[0].content).toContain('status');
    expect(session.systemEvents.bridgeEvents[0].url).toContain('example.com');
    expect(session.toolTimeline[0].durationMs).toBe(42);
    expect(session.fileSnapshots[0].isUpdate).toBe(false);
    expect(session.lifecycle[0].type).toBe('permission-change');
    expect(session.conversationTree[0].type).toBe('user');
    expect(session.counts.totalRecords).toBe(10);
    expect(session.counts.toolErrors).toBe(0);
  });

  it('accepts all lifecycle event types', () => {
    const types: LifecycleEvent['type'][] = [
      'permission-change',
      'queue-enqueue',
      'queue-dequeue',
      'queue-remove',
      'tools-changed',
      'last-prompt',
    ];

    const events: LifecycleEvent[] = types.map((type) => ({
      timestamp: '2026-04-11T10:00:00Z',
      type,
      detail: 'test',
    }));

    expect(events).toHaveLength(6);
    expect(events.map((e) => e.type)).toEqual(types);
  });

  it('accepts nullable fields correctly', () => {
    const meta: SessionMeta = {
      sessionId: 'nullable-test',
      slug: '',
      firstMessage: '',
      firstTs: null,
      lastTs: null,
      sizeBytes: 0,
      filePath: '/tmp/empty.jsonl',
      projectKey: 'test',
      cwd: '/tmp',
      version: '',
      gitBranch: '',
      entrypoint: 'cli',
    };

    expect(meta.firstTs).toBeNull();
    expect(meta.lastTs).toBeNull();

    const toolCall: ToolCall = {
      id: 'tc-null',
      name: 'Bash',
      filePath: null,
      command: null,
      pattern: null,
    };

    expect(toolCall.filePath).toBeNull();

    const userRecord: UserRecord = {
      uuid: 'u-null',
      parentUuid: '',
      timestamp: '',
      isSidechain: false,
      isMeta: false,
      permissionMode: null,
      toolResults: [],
      textPreview: '',
    };

    expect(userRecord.permissionMode).toBeNull();
  });
});

// ===========================================================================
// Parser tests
// ===========================================================================

describe('parseSessionFile', () => {
  describe('metadata extraction', () => {
    it('extracts slug, cwd, version, gitBranch, entrypoint from first records', () => {
      const fp = writeSession('meta-test', [
        {
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: 'sess-1',
          timestamp: '2026-01-01T10:00:00Z',
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:01Z',
          sessionId: 'sess-1',
          cwd: '/home/test/project',
          version: '2.1.92',
          gitBranch: 'main',
          entrypoint: 'cli',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Hello world' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:05Z',
          sessionId: 'sess-1',
          slug: 'happy-test',
          cwd: '/home/test/project',
          version: '2.1.92',
          gitBranch: 'main',
          entrypoint: 'cli',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'end_turn',
            stop_details: {},
            stop_sequence: null,
            content: [{ type: 'text', text: 'Hi there' }],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
              service_tier: 'default',
              inference_geo: 'us',
              speed: 'standard',
              server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
            },
          },
        },
      ]);

      const parsed = parseSessionFile(fp, '-home-test-project');
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.slug).toBe('happy-test');
      expect(parsed!.meta.cwd).toBe('/home/test/project');
      expect(parsed!.meta.version).toBe('2.1.92');
      expect(parsed!.meta.gitBranch).toBe('main');
      expect(parsed!.meta.entrypoint).toBe('cli');
      expect(parsed!.meta.firstTs).toBe('2026-01-01T10:00:00Z');
      expect(parsed!.meta.lastTs).toBe('2026-01-01T10:00:05Z');
      expect(parsed!.meta.firstMessage).toBe('Hello world');
      expect(parsed!.meta.projectKey).toBe('-home-test-project');
    });

    it('returns null for empty file', () => {
      const fp = path.join(tmpDir, 'empty.jsonl');
      fs.writeFileSync(fp, '');
      expect(parseSessionFile(fp, 'key')).toBeNull();
    });

    it('handles file with only malformed JSON lines', () => {
      const fp = path.join(tmpDir, 'bad.jsonl');
      fs.writeFileSync(fp, 'not json\nalso not json\n');
      const parsed = parseSessionFile(fp, 'key');
      // Should return a ParsedSession with zero records, not null
      expect(parsed).not.toBeNull();
      expect(parsed!.counts.totalRecords).toBe(0);
    });
  });

  describe('assistant record extraction', () => {
    it('extracts model, stopReason, usage, toolCalls, hasThinking', () => {
      const fp = writeSession('assistant-test', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Read a file' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            stop_details: {},
            stop_sequence: null,
            content: [
              { type: 'thinking', thinking: 'Let me read the file' },
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/foo.ts' } },
            ],
            usage: {
              input_tokens: 200,
              output_tokens: 80,
              cache_read_input_tokens: 50,
              cache_creation_input_tokens: 10,
              service_tier: 'default',
              inference_geo: 'us',
              speed: 'standard',
              server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
            },
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.assistantMessages).toHaveLength(1);

      const msg = parsed!.assistantMessages[0];
      expect(msg.model).toBe('claude-sonnet-4-20250514');
      expect(msg.stopReason).toBe('tool_use');
      expect(msg.hasThinking).toBe(true);
      expect(msg.requestId).toBe('req-1');
      expect(msg.usage.inputTokens).toBe(200);
      expect(msg.usage.outputTokens).toBe(80);
      expect(msg.usage.cacheReadTokens).toBe(50);
      expect(msg.usage.cacheCreationTokens).toBe(10);
      expect(msg.usage.serverToolUse.webSearchRequests).toBe(1);

      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls[0].name).toBe('Read');
      expect(msg.toolCalls[0].filePath).toBe('/tmp/foo.ts');
    });

    it('extracts textPreview from text content blocks', () => {
      const fp = writeSession('text-preview', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Explain this' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'end_turn',
            stop_details: {},
            stop_sequence: null,
            content: [{ type: 'text', text: 'Here is a detailed explanation of the code.' }],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.assistantMessages[0].textPreview).toBe(
        'Here is a detailed explanation of the code.',
      );
    });

    it('truncates textPreview to 300 chars', () => {
      const longText = 'A'.repeat(500);
      const fp = writeSession('text-truncate', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Go' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: longText }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.assistantMessages[0].textPreview).toHaveLength(300);
    });
  });

  describe('user record extraction', () => {
    it('extracts tool results with error status', () => {
      const fp = writeSession('user-tools', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Do something' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls /nonexist' } }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          sourceToolAssistantUUID: 'a1',
          toolUseResult: { durationMs: 42, success: false },
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tu-1', is_error: true, content: 'No such file' },
            ],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.userMessages).toHaveLength(2);

      const toolUser = parsed!.userMessages[1];
      expect(toolUser.toolResults).toHaveLength(1);
      expect(toolUser.toolResults[0].isError).toBe(true);
      expect(toolUser.toolResults[0].toolUseId).toBe('tu-1');
      expect(toolUser.toolResults[0].durationMs).toBe(42);
      expect(toolUser.toolResults[0].success).toBe(false);

      // Counts
      expect(parsed!.counts.toolErrors).toBe(1);
    });

    it('extracts user text preview, stripping system-reminder tags', () => {
      const fp = writeSession('user-text', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: {
            role: 'user',
            content: 'Real question <system-reminder>hidden</system-reminder> more text',
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.userMessages[0].textPreview).toBe('Real question  more text');
    });
  });

  describe('tool execution timeline', () => {
    it('matches tool_use with tool_result into ToolExecution', () => {
      const fp = writeSession('tool-timeline', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Read file' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/foo.ts' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          toolUseResult: { durationMs: 5, type: 'text', file: { filePath: '/tmp/foo.ts' } },
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'file contents' }],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.toolTimeline).toHaveLength(1);

      const exec = parsed!.toolTimeline[0];
      expect(exec.name).toBe('Read');
      expect(exec.filePath).toBe('/tmp/foo.ts');
      expect(exec.callId).toBe('tu-1');
      expect(exec.durationMs).toBe(5);
      expect(exec.isError).toBe(false);
      expect(exec.timestamp).toBe('2026-01-01T10:00:02Z');
      expect(exec.resultTimestamp).toBe('2026-01-01T10:00:03Z');
    });

    it('extracts Bash command from tool calls', () => {
      const fp = writeSession('bash-tool', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Run npm test' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:05Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tu-1', content: 'all tests passed' },
            ],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.toolTimeline[0].command).toBe('npm test');
    });

    it('extracts Grep/Glob pattern from tool calls', () => {
      const fp = writeSession('grep-tool', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Find imports' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'Grep',
                input: { pattern: 'import.*session' },
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: '3 matches' }],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.toolTimeline[0].pattern).toBe('import.*session');
    });
  });

  describe('system event extraction', () => {
    it('extracts turn_duration events', () => {
      const fp = writeSession('turn-duration', [
        {
          type: 'system',
          subtype: 'turn_duration',
          timestamp: '2026-01-01T10:01:00Z',
          durationMs: 45000,
          messageCount: 12,
          parentUuid: 'a1',
          sessionId: 's1',
          uuid: 'sys1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.systemEvents.turnDurations).toHaveLength(1);
      expect(parsed!.systemEvents.turnDurations[0].durationMs).toBe(45000);
      expect(parsed!.systemEvents.turnDurations[0].messageCount).toBe(12);
    });

    it('extracts stop_hook_summary events', () => {
      const fp = writeSession('hook-summary', [
        {
          type: 'system',
          subtype: 'stop_hook_summary',
          timestamp: '2026-01-01T10:01:00Z',
          hookCount: 2,
          hookInfos: [
            { command: 'bash hook.sh', durationMs: 7 },
            { command: 'node gate.mjs', durationMs: 63 },
          ],
          hookErrors: [],
          preventedContinuation: false,
          stopReason: '',
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.systemEvents.hookSummaries).toHaveLength(1);
      const hook = parsed!.systemEvents.hookSummaries[0];
      expect(hook.hookCount).toBe(2);
      expect(hook.hooks).toHaveLength(2);
      expect(hook.hooks[0].command).toBe('bash hook.sh');
      expect(hook.hooks[0].durationMs).toBe(7);
      expect(hook.preventedContinuation).toBe(false);
    });

    it('extracts local_command events', () => {
      const fp = writeSession('local-cmd', [
        {
          type: 'system',
          subtype: 'local_command',
          timestamp: '2026-01-01T10:01:00Z',
          content: '<command-name>/brainstorm</command-name>',
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.systemEvents.localCommands).toHaveLength(1);
      expect(parsed!.systemEvents.localCommands[0].content).toContain('/brainstorm');
    });

    it('extracts bridge_status events', () => {
      const fp = writeSession('bridge', [
        {
          type: 'system',
          subtype: 'bridge_status',
          timestamp: '2026-01-01T10:01:00Z',
          content: 'active',
          url: 'https://claude.ai/code/session_abc',
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.systemEvents.bridgeEvents).toHaveLength(1);
      expect(parsed!.systemEvents.bridgeEvents[0].url).toBe(
        'https://claude.ai/code/session_abc',
      );
    });
  });

  describe('lifecycle events', () => {
    it('extracts permission-mode changes', () => {
      const fp = writeSession('perm', [
        {
          type: 'permission-mode',
          permissionMode: 'approved',
          sessionId: 's1',
          timestamp: '2026-01-01T10:00:00Z',
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.lifecycle).toHaveLength(1);
      expect(parsed!.lifecycle[0].type).toBe('permission-change');
      expect(parsed!.lifecycle[0].detail).toBe('approved');
    });

    it('extracts queue-operation events', () => {
      const fp = writeSession('queue', [
        {
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
        },
        {
          type: 'queue-operation',
          operation: 'dequeue',
          timestamp: '2026-01-01T10:00:01Z',
          sessionId: 's1',
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.lifecycle).toHaveLength(2);
      expect(parsed!.lifecycle[0].type).toBe('queue-enqueue');
      expect(parsed!.lifecycle[1].type).toBe('queue-dequeue');
    });

    it('extracts attachment/tools-changed events', () => {
      const fp = writeSession('attach', [
        {
          type: 'attachment',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'at1',
          parentUuid: '',
          isSidechain: false,
          attachment: {
            type: 'deferred_tools_delta',
            addedNames: ['WebSearch', 'WebFetch'],
            removedNames: [],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.lifecycle).toHaveLength(1);
      expect(parsed!.lifecycle[0].type).toBe('tools-changed');
      expect(parsed!.lifecycle[0].detail).toBe('+2 -0 tools');
    });

    it('extracts last-prompt events', () => {
      const fp = writeSession('last', [
        { type: 'last-prompt', timestamp: '2026-01-01T10:00:00Z' },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.lifecycle).toHaveLength(1);
      expect(parsed!.lifecycle[0].type).toBe('last-prompt');
    });
  });

  describe('file-history-snapshot extraction', () => {
    it('extracts file snapshots', () => {
      const fp = writeSession('fh', [
        { type: 'file-history-snapshot', messageId: 'msg-1', isSnapshotUpdate: false, snapshot: {} },
        { type: 'file-history-snapshot', messageId: 'msg-1', isSnapshotUpdate: true, snapshot: {} },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.fileSnapshots).toHaveLength(2);
      expect(parsed!.fileSnapshots[0].isUpdate).toBe(false);
      expect(parsed!.fileSnapshots[1].isUpdate).toBe(true);
    });
  });

  describe('conversation tree', () => {
    it('builds tree from uuid/parentUuid chains', () => {
      const fp = writeSession('tree', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'hi' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'hello' }],
            usage: { input_tokens: 50, output_tokens: 20 },
          },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'a2',
          parentUuid: 'u1',
          isSidechain: true,
          requestId: 'r2',
          message: {
            id: 'm2',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'branch' }],
            usage: { input_tokens: 50, output_tokens: 20 },
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.conversationTree).toHaveLength(3);
      expect(parsed!.conversationTree[2].isSidechain).toBe(true);
      expect(parsed!.counts.sidechainMessages).toBe(1);
    });
  });

  describe('counts', () => {
    it('produces accurate counts for a mixed session', () => {
      const fp = writeSession('counts', [
        {
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: 's1',
          timestamp: '2026-01-01T10:00:00Z',
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:01Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'hello' },
        },
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: 'u1',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/f.ts' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:03Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }],
          },
        },
        {
          type: 'system',
          subtype: 'turn_duration',
          timestamp: '2026-01-01T10:00:04Z',
          durationMs: 3000,
          messageCount: 3,
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
        {
          type: 'file-history-snapshot',
          messageId: 'm1',
          isSnapshotUpdate: false,
          snapshot: {},
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.counts.totalRecords).toBe(6);
      expect(parsed!.counts.assistantMessages).toBe(1);
      expect(parsed!.counts.userMessages).toBe(2);
      expect(parsed!.counts.systemEvents).toBe(1);
      expect(parsed!.counts.toolCalls).toBe(1);
      expect(parsed!.counts.toolErrors).toBe(0);
      expect(parsed!.counts.fileSnapshots).toBe(1);
    });
  });
});
