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
import {
  parseSessionFile,
  parseSessionMessages,
  enrichMessagesWithTree,
} from '../server/scanner/session-parser';
import { sessionParseCache } from '../server/scanner/session-cache';
import type {
  SessionTree,
  SessionTreeNode,
  TimelineMessage,
  TimelineMessageType,
  SubagentRootNode,
  SessionRootNode,
  AssistantTurnNode,
  UserTurnNode,
  ToolCallNode,
} from '../shared/session-types';

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
      agentId: null,
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
      issuedByAssistantUuid: 'a-uuid-001',
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

  // =========================================================================
  // Gap-fill tests — edge cases and code paths not covered by task 002
  // =========================================================================

  describe('stop_hook_summary edge cases', () => {
    it('captures errors and preventedContinuation=true', () => {
      const fp = writeSession('hook-errors', [
        {
          type: 'system',
          subtype: 'stop_hook_summary',
          timestamp: '2026-01-01T10:01:00Z',
          hookCount: 1,
          hookInfos: [{ command: 'bash lint.sh', durationMs: 150 }],
          hookErrors: ['lint failed: 3 errors'],
          preventedContinuation: true,
          stopReason: 'hook_error',
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      const hook = parsed!.systemEvents.hookSummaries[0];
      expect(hook.preventedContinuation).toBe(true);
      expect(hook.errors).toEqual(['lint failed: 3 errors']);
      expect(hook.stopReason).toBe('hook_error');
    });
  });

  describe('queue-operation remove', () => {
    it('extracts queue-remove lifecycle event', () => {
      const fp = writeSession('queue-remove', [
        {
          type: 'queue-operation',
          operation: 'remove',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.lifecycle).toHaveLength(1);
      expect(parsed!.lifecycle[0].type).toBe('queue-remove');
    });
  });

  describe('bridge_status content field', () => {
    it('extracts content alongside url', () => {
      const fp = writeSession('bridge-content', [
        {
          type: 'system',
          subtype: 'bridge_status',
          timestamp: '2026-01-01T10:01:00Z',
          content: 'disconnected',
          url: 'https://claude.ai/code/xyz',
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: 'a1',
          isSidechain: false,
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.systemEvents.bridgeEvents[0].content).toBe('disconnected');
      expect(parsed!.systemEvents.bridgeEvents[0].url).toBe('https://claude.ai/code/xyz');
    });
  });

  describe('multiple tool calls in one assistant message', () => {
    it('creates separate ToolExecution entries for each tool_use', () => {
      const fp = writeSession('multi-tool', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Read two files' },
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
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/a.ts' } },
              { type: 'tool_use', id: 'tu-2', name: 'Grep', input: { pattern: 'TODO' } },
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
            content: [
              { type: 'tool_result', tool_use_id: 'tu-1', content: 'file a' },
              { type: 'tool_result', tool_use_id: 'tu-2', content: '5 matches' },
            ],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.assistantMessages[0].toolCalls).toHaveLength(2);
      expect(parsed!.toolTimeline).toHaveLength(2);
      expect(parsed!.toolTimeline[0].name).toBe('Read');
      expect(parsed!.toolTimeline[0].filePath).toBe('/tmp/a.ts');
      expect(parsed!.toolTimeline[1].name).toBe('Grep');
      expect(parsed!.toolTimeline[1].pattern).toBe('TODO');
      expect(parsed!.counts.toolCalls).toBe(2);
    });
  });

  describe('tool call with path input (not file_path)', () => {
    it('extracts filePath from input.path fallback', () => {
      const fp = writeSession('path-fallback', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'Search files' },
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
              { type: 'tool_use', id: 'tu-1', name: 'Glob', input: { path: '/tmp/src', pattern: '**/*.ts' } },
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
            content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: '10 files' }],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.toolTimeline[0].filePath).toBe('/tmp/src');
      expect(parsed!.toolTimeline[0].pattern).toBe('**/*.ts');
    });
  });

  describe('user record isMeta flag', () => {
    it('extracts isMeta from user records', () => {
      const fp = writeSession('is-meta', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          isMeta: true,
          message: { role: 'user', content: 'meta content' },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.userMessages[0].isMeta).toBe(true);
    });
  });

  describe('unmatched tool call (no result)', () => {
    it('does not create ToolExecution for tool_use without matching result', () => {
      const fp = writeSession('unmatched-tool', [
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
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-orphan', name: 'Bash', input: { command: 'echo hi' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        // No user record with tool_result for tu-orphan
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.assistantMessages[0].toolCalls).toHaveLength(1);
      expect(parsed!.toolTimeline).toHaveLength(0);
      expect(parsed!.counts.toolCalls).toBe(0);
    });
  });

  describe('file-history-snapshot messageId', () => {
    it('preserves the messageId value from the record', () => {
      const fp = writeSession('fh-msgid', [
        {
          type: 'file-history-snapshot',
          messageId: 'unique-msg-42',
          isSnapshotUpdate: false,
          snapshot: { files: {} },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.fileSnapshots[0].messageId).toBe('unique-msg-42');
    });
  });

  describe('sidechain tool execution', () => {
    it('propagates isSidechain to ToolExecution entries', () => {
      const fp = writeSession('sidechain-tool', [
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
          isSidechain: true,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-sc', name: 'Read', input: { file_path: '/tmp/sc.ts' } },
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
          isSidechain: true,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu-sc', content: 'ok' }],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.toolTimeline).toHaveLength(1);
      expect(parsed!.toolTimeline[0].isSidechain).toBe(true);
      expect(parsed!.counts.sidechainMessages).toBe(2);
    });
  });

  describe('firstMessage filtering', () => {
    it('skips local-command and command-name prefixed messages', () => {
      const fp = writeSession('first-msg-filter', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: '<command-name>status</command-name>' },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:01Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: '<local-command>/help</local-command>' },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:02Z',
          sessionId: 's1',
          uuid: 'u3',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'This is the real first message' },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.meta.firstMessage).toBe('This is the real first message');
    });
  });

  describe('user record with multiple tool results', () => {
    it('extracts all tool results and counts errors correctly', () => {
      const fp = writeSession('multi-results', [
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
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/a.ts' } },
              { type: 'tool_use', id: 'tu-2', name: 'Read', input: { file_path: '/tmp/b.ts' } },
              { type: 'tool_use', id: 'tu-3', name: 'Read', input: { file_path: '/tmp/c.ts' } },
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
          toolUseResult: { durationMs: 10, success: true },
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' },
              { type: 'tool_result', tool_use_id: 'tu-2', is_error: true, content: 'not found' },
              { type: 'tool_result', tool_use_id: 'tu-3', content: 'ok' },
            ],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      const toolUser = parsed!.userMessages[1];
      expect(toolUser.toolResults).toHaveLength(3);
      expect(toolUser.toolResults[0].isError).toBe(false);
      expect(toolUser.toolResults[1].isError).toBe(true);
      expect(toolUser.toolResults[2].isError).toBe(false);
      // durationMs/success only applied to first tool result from toolUseResult
      expect(toolUser.toolResults[0].durationMs).toBe(10);
      expect(toolUser.toolResults[0].success).toBe(true);
      expect(toolUser.toolResults[1].durationMs).toBeNull();
      expect(parsed!.counts.toolErrors).toBe(1);
      expect(parsed!.counts.toolCalls).toBe(3);
    });

    it('extracts toolUseResult.agentId into the matching ToolResult (Agent tool_result)', () => {
      const fp = writeSession('agent-result', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'dispatch a subagent' },
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
            model: 'claude-opus-4-6',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_agentcall',
                name: 'Agent',
                input: { subagent_type: 'Explore', description: 'd', prompt: 'p' },
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          sessionId: 's1',
          uuid: 'u2',
          parentUuid: 'a1',
          isSidechain: false,
          toolUseResult: {
            status: 'completed',
            agentId: 'abc123def456789',
            agentType: 'Explore',
            totalDurationMs: 5000,
          },
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_agentcall',
                content: [{ type: 'text', text: 'subagent result body' }],
              },
            ],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      const toolUser = parsed!.userMessages[1];
      expect(toolUser.toolResults).toHaveLength(1);
      expect(toolUser.toolResults[0].agentId).toBe('abc123def456789');
      expect(toolUser.toolResults[0].toolUseId).toBe('toolu_agentcall');
    });

    it('leaves agentId null for non-Agent tool_results', () => {
      const fp = writeSession('non-agent-result', [
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'a1',
          parentUuid: '',
          isSidechain: false,
          requestId: 'r1',
          message: {
            id: 'm1',
            role: 'assistant',
            model: 'claude-opus-4-6',
            type: 'message',
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tu-read', name: 'Read', input: { file_path: '/tmp/a.ts' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:01Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: 'a1',
          isSidechain: false,
          toolUseResult: { durationMs: 42, success: true },
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu-read', content: 'file contents' }],
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      const toolUser = parsed!.userMessages[0];
      expect(toolUser.toolResults[0].agentId).toBeNull();
      expect(toolUser.toolResults[0].durationMs).toBe(42);
    });
  });

  describe('edge cases', () => {
    it('handles session with only system records (no user/assistant)', () => {
      const fp = writeSession('system-only', [
        {
          type: 'system',
          subtype: 'turn_duration',
          timestamp: '2026-01-01T10:00:00Z',
          durationMs: 1000,
          messageCount: 0,
          sessionId: 's1',
          uuid: 'sys1',
          parentUuid: '',
          isSidechain: false,
        },
        {
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: 's1',
          timestamp: '2026-01-01T10:00:01Z',
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed).not.toBeNull();
      expect(parsed!.counts.assistantMessages).toBe(0);
      expect(parsed!.counts.userMessages).toBe(0);
      expect(parsed!.counts.systemEvents).toBe(1);
      expect(parsed!.lifecycle).toHaveLength(1);
      expect(parsed!.meta.firstMessage).toBe('');
    });

    it('handles very large user textPreview by truncating to 300 chars', () => {
      const longText = 'x'.repeat(500);
      const fp = writeSession('long-user-text', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: longText },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.userMessages[0].textPreview.length).toBeLessThanOrEqual(300);
    });

    it('handles records with missing optional fields gracefully', () => {
      const fp = writeSession('minimal-assistant', [
        {
          type: 'assistant',
          timestamp: '2026-01-01T10:00:00Z',
          message: {
            content: [{ type: 'text', text: 'hi' }],
            usage: {},
          },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed).not.toBeNull();
      const msg = parsed!.assistantMessages[0];
      expect(msg.model).toBe('');
      expect(msg.stopReason).toBe('');
      expect(msg.usage.inputTokens).toBe(0);
      expect(msg.uuid).toBe('');
    });

    it('derives sessionId from filename', () => {
      const fp = writeSession('abc-def-123', [
        {
          type: 'user',
          timestamp: '2026-01-01T10:00:00Z',
          sessionId: 's1',
          uuid: 'u1',
          parentUuid: '',
          isSidechain: false,
          message: { role: 'user', content: 'hi' },
        },
      ]);

      const parsed = parseSessionFile(fp, 'key');
      expect(parsed!.meta.sessionId).toBe('abc-def-123');
    });
  });
});

describe('SessionParseCache integration', () => {
  afterAll(() => sessionParseCache.invalidateAll());

  it('singleton is importable and has expected API', () => {
    expect(typeof sessionParseCache.getOrParse).toBe('function');
    expect(typeof sessionParseCache.invalidateAll).toBe('function');
    expect(typeof sessionParseCache.getById).toBe('function');
    expect(typeof sessionParseCache.invalidate).toBe('function');
    expect(typeof sessionParseCache.size).toBe('number');
  });

  it('parses a test file through the singleton and caches it', () => {
    sessionParseCache.invalidateAll();
    expect(sessionParseCache.size).toBe(0);

    const fp = writeSession('cache-integration', [
      {
        parentUuid: null,
        type: 'human',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        timestamp: '2026-04-11T10:00:00Z',
        sessionId: 'cache-test-session',
      },
      {
        parentUuid: 'u1',
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'hi back' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        costUSD: 0.001,
        durationMs: 100,
        timestamp: '2026-04-11T10:00:01Z',
        sessionId: 'cache-test-session',
      },
    ]);

    const result = sessionParseCache.getOrParse(fp, 'test-project');
    expect(result).not.toBeNull();
    expect(result!.meta.sessionId).toBe('cache-integration');
    expect(sessionParseCache.size).toBe(1);

    // Second call should return cached result
    const cached = sessionParseCache.getOrParse(fp, 'test-project');
    expect(cached).toBe(result); // same reference — from cache

    // getById should find it
    const byId = sessionParseCache.getById('cache-integration');
    expect(byId).toBe(result);
  });

  it('invalidateAll clears the cache', () => {
    expect(sessionParseCache.size).toBeGreaterThan(0);
    sessionParseCache.invalidateAll();
    expect(sessionParseCache.size).toBe(0);
  });
});

describe('ToolExecution.issuedByAssistantUuid linkage', () => {
  it('parseSessionFile populates issuedByAssistantUuid on every ToolExecution', () => {
    const fp = writeSession('issued-by-single', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        sessionId: 's1',
        uuid: 'u1',
        parentUuid: '',
        isSidechain: false,
        message: { role: 'user', content: 'do a thing' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:00:01Z',
        sessionId: 's1',
        uuid: 'asst-uuid-1',
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
            { type: 'tool_use', id: 'tu-A', name: 'Read', input: { file_path: '/tmp/a.ts' } },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:02Z',
        sessionId: 's1',
        uuid: 'u2',
        parentUuid: 'asst-uuid-1',
        isSidechain: false,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-A', content: 'ok' }],
        },
      },
    ]);

    const parsed = parseSessionFile(fp, 'key');
    expect(parsed).not.toBeNull();
    expect(parsed!.toolTimeline).toHaveLength(1);

    const assistantUuids = new Set(parsed!.assistantMessages.map((a) => a.uuid));
    for (const exec of parsed!.toolTimeline) {
      expect(exec.issuedByAssistantUuid).toBeTruthy();
      expect(assistantUuids.has(exec.issuedByAssistantUuid)).toBe(true);
    }
  });

  it('issuedByAssistantUuid points to the correct assistant turn (1:1 mapping)', () => {
    const fp = writeSession('issued-by-two-turns', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        sessionId: 's1',
        uuid: 'u1',
        parentUuid: '',
        isSidechain: false,
        message: { role: 'user', content: 'first thing' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:00:01Z',
        sessionId: 's1',
        uuid: 'asst-one',
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
            { type: 'tool_use', id: 'tu-one', name: 'Read', input: { file_path: '/tmp/one.ts' } },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:02Z',
        sessionId: 's1',
        uuid: 'u2',
        parentUuid: 'asst-one',
        isSidechain: false,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-one', content: 'one' }],
        },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:03Z',
        sessionId: 's1',
        uuid: 'u3',
        parentUuid: 'u2',
        isSidechain: false,
        message: { role: 'user', content: 'second thing' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:00:04Z',
        sessionId: 's1',
        uuid: 'asst-two',
        parentUuid: 'u3',
        isSidechain: false,
        requestId: 'r2',
        message: {
          id: 'm2',
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          type: 'message',
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'tu-two', name: 'Bash', input: { command: 'echo two' } },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:05Z',
        sessionId: 's1',
        uuid: 'u4',
        parentUuid: 'asst-two',
        isSidechain: false,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-two', content: 'two' }],
        },
      },
    ]);

    const parsed = parseSessionFile(fp, 'key');
    expect(parsed).not.toBeNull();
    expect(parsed!.toolTimeline).toHaveLength(2);

    const byCallId = new Map(parsed!.toolTimeline.map((e) => [e.callId, e]));
    expect(byCallId.get('tu-one')!.issuedByAssistantUuid).toBe('asst-one');
    expect(byCallId.get('tu-two')!.issuedByAssistantUuid).toBe('asst-two');
  });
});

// ---------------------------------------------------------------------------
// parseSessionMessages — typed message timeline
// ---------------------------------------------------------------------------

/**
 * Build a fixture session containing every one of the seven TimelineMessage
 * kinds so one parse call can exercise the full emit matrix. Reused across
 * multiple it-blocks so each test can assert against a stable dataset.
 */
function buildSevenKindFixture(): string {
  return writeSession('seven-kinds', [
    // 1. system_event (permission-mode) — record-type dispatch
    {
      type: 'permission-mode',
      permissionMode: 'default',
      timestamp: '2026-04-12T00:00:00.000Z',
    },
    // 2. skill_invocation — local_command system record
    {
      type: 'system',
      subtype: 'local_command',
      timestamp: '2026-04-12T00:00:00.100Z',
      content:
        '<command-name>brainstorm</command-name><command-args>new feature</command-args>',
    },
    // 3. user_text
    {
      type: 'user',
      uuid: 'u-1',
      parentUuid: '',
      timestamp: '2026-04-12T00:00:01.000Z',
      isSidechain: false,
      message: {
        role: 'user',
        content: 'hello please help me explore this repo',
      },
    },
    // 4. assistant_text + thinking + tool_call (one record emits three messages)
    {
      type: 'assistant',
      uuid: 'a-1',
      parentUuid: 'u-1',
      timestamp: '2026-04-12T00:00:02.000Z',
      isSidechain: false,
      requestId: 'req-1',
      message: {
        id: 'msg-1',
        role: 'assistant',
        model: 'claude-opus-4-6',
        type: 'message',
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: 'let me think about this' },
          { type: 'text', text: 'I will read the README first.' },
          {
            type: 'tool_use',
            id: 'tool-call-1',
            name: 'Read',
            input: { file_path: '/demo/README.md' },
          },
        ],
        usage: {
          input_tokens: 500,
          output_tokens: 120,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          service_tier: 'standard',
          server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        },
      },
    },
    // 5. tool_result
    {
      type: 'user',
      uuid: 'u-2',
      parentUuid: 'a-1',
      timestamp: '2026-04-12T00:00:03.000Z',
      isSidechain: false,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-call-1',
            content: [{ type: 'text', text: 'readme body here' }],
            is_error: false,
          },
        ],
      },
      toolUseResult: { durationMs: 12, success: true },
    },
    // 6. second assistant_text to verify pagination boundaries
    {
      type: 'assistant',
      uuid: 'a-2',
      parentUuid: 'u-2',
      timestamp: '2026-04-12T00:00:04.000Z',
      isSidechain: false,
      requestId: 'req-2',
      message: {
        id: 'msg-2',
        role: 'assistant',
        model: 'claude-opus-4-6',
        type: 'message',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'done reading' }],
        usage: {
          input_tokens: 200,
          output_tokens: 50,
          service_tier: 'standard',
          server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        },
      },
    },
  ]);
}

describe('parseSessionMessages — seven typed message kinds', () => {
  it('emits every message type for a fixture containing all seven kinds', () => {
    const fp = buildSevenKindFixture();
    const { messages, totalMessages } = parseSessionMessages(fp, 0, 500);
    // Shape assertions — chronological order, no surprises
    expect(totalMessages).toBeGreaterThan(0);
    expect(messages.length).toBe(totalMessages);

    const byType = new Map<TimelineMessageType, TimelineMessage[]>();
    for (const m of messages) {
      const bucket = byType.get(m.type) ?? [];
      bucket.push(m);
      byType.set(m.type, bucket);
    }

    // All seven kinds present
    expect(byType.has('user_text')).toBe(true);
    expect(byType.has('assistant_text')).toBe(true);
    expect(byType.has('thinking')).toBe(true);
    expect(byType.has('tool_call')).toBe(true);
    expect(byType.has('tool_result')).toBe(true);
    expect(byType.has('system_event')).toBe(true);
    expect(byType.has('skill_invocation')).toBe(true);

    // user_text carries uuid + text
    const userText = byType.get('user_text')![0];
    if (userText.type !== 'user_text') throw new Error('narrow fail');
    expect(userText.uuid).toBe('u-1');
    expect(userText.text).toContain('hello');

    // assistant_text carries model + usage
    const asstText = byType.get('assistant_text')![0];
    if (asstText.type !== 'assistant_text') throw new Error('narrow fail');
    expect(asstText.uuid).toBe('a-1');
    expect(asstText.model).toBe('claude-opus-4-6');
    expect(asstText.usage.inputTokens).toBe(500);
    expect(asstText.text).toContain('README');

    // thinking carries text
    const thinking = byType.get('thinking')![0];
    if (thinking.type !== 'thinking') throw new Error('narrow fail');
    expect(thinking.uuid).toBe('a-1');
    expect(thinking.text).toContain('think');

    // tool_call carries callId + name + input
    const tool = byType.get('tool_call')![0];
    if (tool.type !== 'tool_call') throw new Error('narrow fail');
    expect(tool.callId).toBe('tool-call-1');
    expect(tool.name).toBe('Read');
    expect(tool.input.file_path).toBe('/demo/README.md');

    // tool_result carries toolUseId + content
    const result = byType.get('tool_result')![0];
    if (result.type !== 'tool_result') throw new Error('narrow fail');
    expect(result.toolUseId).toBe('tool-call-1');
    expect(result.content).toContain('readme');
    expect(result.isError).toBe(false);

    // system_event carries subtype + summary
    const sys = byType.get('system_event')![0];
    if (sys.type !== 'system_event') throw new Error('narrow fail');
    expect(sys.subtype).toBe('permission-change');

    // skill_invocation carries commandName + commandArgs
    const skill = byType.get('skill_invocation')![0];
    if (skill.type !== 'skill_invocation') throw new Error('narrow fail');
    expect(skill.commandName).toBe('brainstorm');
    expect(skill.commandArgs).toBe('new feature');
  });

  it('toolUseId links tool_call to tool_result via matching ids', () => {
    const fp = buildSevenKindFixture();
    const { messages } = parseSessionMessages(fp, 0, 500);
    const toolCall = messages.find((m) => m.type === 'tool_call');
    const toolResult = messages.find((m) => m.type === 'tool_result');
    expect(toolCall).toBeDefined();
    expect(toolResult).toBeDefined();
    if (toolCall?.type !== 'tool_call' || toolResult?.type !== 'tool_result') {
      throw new Error('expected tool_call + tool_result');
    }
    expect(toolCall.callId).toBe(toolResult.toolUseId);
  });

  it('pagination: offset=2, limit=3 slices correctly and reports totalMessages', () => {
    const fp = buildSevenKindFixture();
    const all = parseSessionMessages(fp, 0, 500);
    const sliced = parseSessionMessages(fp, 2, 3);
    expect(sliced.totalMessages).toBe(all.totalMessages);
    expect(sliced.messages.length).toBe(Math.min(3, Math.max(0, all.totalMessages - 2)));
    // Each sliced message should match positional index 2..4
    for (let i = 0; i < sliced.messages.length; i++) {
      expect(sliced.messages[i]).toEqual(all.messages[i + 2]);
    }
  });

  it('types filter narrows to requested kinds only, and is applied before pagination', () => {
    const fp = buildSevenKindFixture();
    const filter = new Set<TimelineMessageType>(['user_text', 'assistant_text']);
    const { messages } = parseSessionMessages(fp, 0, 500, filter);
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(['user_text', 'assistant_text']).toContain(m.type);
    }
  });

  it('empty JSONL returns zero messages without crashing', () => {
    const fp = writeSession('empty', []);
    const { messages, totalMessages } = parseSessionMessages(fp, 0, 500);
    expect(messages).toEqual([]);
    expect(totalMessages).toBe(0);
  });

  it('missing file returns zero messages without throwing', () => {
    const { messages, totalMessages } = parseSessionMessages(
      path.join(tmpDir, 'does-not-exist.jsonl'),
      0,
      500,
    );
    expect(messages).toEqual([]);
    expect(totalMessages).toBe(0);
  });

  it('strips <system-reminder> and <command-name> wrappers from user_text', () => {
    const fp = writeSession('strip-xml', [
      {
        type: 'user',
        uuid: 'u-1',
        timestamp: '2026-04-12T00:00:00Z',
        message: {
          role: 'user',
          content:
            '<system-reminder>noise</system-reminder>real user question here',
        },
      },
    ]);
    const { messages } = parseSessionMessages(fp, 0, 500);
    const userText = messages.find((m) => m.type === 'user_text');
    expect(userText).toBeDefined();
    if (userText?.type !== 'user_text') throw new Error('narrow fail');
    expect(userText.text).toBe('real user question here');
    expect(userText.text).not.toContain('system-reminder');
  });

  it('does NOT emit treeNodeId or subagentContext when enrichment is not called', () => {
    const fp = buildSevenKindFixture();
    const { messages } = parseSessionMessages(fp, 0, 500);
    for (const m of messages) {
      expect(m.treeNodeId).toBeUndefined();
      expect(m.subagentContext).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// enrichMessagesWithTree — attaches treeNodeId + subagentContext
// ---------------------------------------------------------------------------

/** Zero-cost stub for testing — no real pricing needed. */
function zeroCost() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    durationMs: 0,
  };
}

/**
 * Hand-rolled minimal SessionTree for enrichment tests. Shape:
 *
 *   session-root
 *   ├── asst:a-1 (parent assistant turn)
 *   │   └── tool:tool-call-1 (Agent dispatch)
 *   │       └── agent:agentXX (subagent root)
 *   │           └── asst:sub-a-1 (nested assistant — lives under subagent)
 *   └── user:u-1 (plain user turn directly under root)
 */
function buildMinimalTree(): SessionTree {
  const root: SessionRootNode = {
    kind: 'session-root',
    id: 'session:test-session',
    parentId: null,
    children: [],
    timestamp: '2026-04-12T00:00:00Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    sessionId: 'test-session',
    slug: 'test',
    firstMessage: '',
    firstTs: '2026-04-12T00:00:00Z',
    lastTs: '2026-04-12T00:01:00Z',
    filePath: '/tmp/test.jsonl',
    projectKey: 'test',
    gitBranch: 'main',
  };
  const asst1: AssistantTurnNode = {
    kind: 'assistant-turn',
    id: 'asst:a-1',
    parentId: root.id,
    children: [],
    timestamp: '2026-04-12T00:00:01Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: 'a-1',
    model: 'claude-opus-4-6',
    stopReason: 'tool_use',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: '',
      inferenceGeo: '',
      speed: '',
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: '',
    hasThinking: false,
    isSidechain: false,
  };
  const tool1: ToolCallNode = {
    kind: 'tool-call',
    id: 'tool:tool-call-1',
    parentId: asst1.id,
    children: [],
    timestamp: '2026-04-12T00:00:02Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    callId: 'tool-call-1',
    name: 'Agent',
    filePath: null,
    command: null,
    pattern: null,
    durationMs: 100,
    isError: false,
    isSidechain: false,
  };
  const agent: SubagentRootNode = {
    kind: 'subagent-root',
    id: 'agent:agentXXXXXXXXXXXX',
    parentId: tool1.id,
    children: [],
    timestamp: '2026-04-12T00:00:03Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    agentId: 'agentXXXXXXXXXXXX',
    agentType: 'Explore',
    description: 'do the exploration',
    prompt: 'explore the repo',
    sessionId: 'test-session',
    filePath: '/tmp/sub.jsonl',
    dispatchedByTurnId: asst1.id,
    dispatchedByToolCallId: tool1.id,
    linkage: { method: 'agentid-in-result', confidence: 'high' },
  };
  // Nested assistant turn inside the subagent — its ancestor chain should
  // resolve to the subagent root when enrichment walks upward.
  const subAsst: AssistantTurnNode = {
    kind: 'assistant-turn',
    id: 'asst:sub-a-1',
    parentId: agent.id,
    children: [],
    timestamp: '2026-04-12T00:00:04Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: 'sub-a-1',
    model: 'claude-opus-4-6',
    stopReason: 'end_turn',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: '',
      inferenceGeo: '',
      speed: '',
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: '',
    hasThinking: false,
    isSidechain: false,
  };
  const user1: UserTurnNode = {
    kind: 'user-turn',
    id: 'user:u-1',
    parentId: root.id,
    children: [],
    timestamp: '2026-04-12T00:00:00Z',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: 'u-1',
    textPreview: '',
    isMeta: false,
    isSidechain: false,
  };

  // Wire children
  root.children = [asst1, user1];
  asst1.children = [tool1];
  tool1.children = [agent];
  agent.children = [subAsst];

  const nodesById = new Map<string, SessionTreeNode>([
    [root.id, root],
    [asst1.id, asst1],
    [tool1.id, tool1],
    [agent.id, agent],
    [subAsst.id, subAsst],
    [user1.id, user1],
  ]);
  const subagentsByAgentId = new Map<string, SessionTreeNode>([[agent.agentId, agent]]);

  return {
    root,
    nodesById,
    subagentsByAgentId,
    totals: {
      assistantTurns: 2,
      userTurns: 1,
      toolCalls: 1,
      toolErrors: 0,
      subagents: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 100,
    },
    warnings: [],
  };
}

describe('enrichMessagesWithTree — attaches tree linkage to messages', () => {
  it('attaches treeNodeId to messages that map to a real node', () => {
    const tree = buildMinimalTree();
    const messages: TimelineMessage[] = [
      {
        type: 'user_text',
        uuid: 'u-1',
        timestamp: '2026-04-12T00:00:00Z',
        text: 'hi',
        isMeta: false,
      },
      {
        type: 'assistant_text',
        uuid: 'a-1',
        timestamp: '2026-04-12T00:00:01Z',
        model: 'claude-opus-4-6',
        text: 'sure',
        stopReason: 'tool_use',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          serviceTier: '',
          inferenceGeo: '',
          speed: '',
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
      },
      {
        type: 'tool_call',
        uuid: 'a-1',
        timestamp: '2026-04-12T00:00:02Z',
        callId: 'tool-call-1',
        name: 'Agent',
        input: {},
      },
    ];
    const { status } = enrichMessagesWithTree(messages, tree);
    expect(status).toBe('ok');
    expect(messages[0].treeNodeId).toBe('user:u-1');
    expect(messages[1].treeNodeId).toBe('asst:a-1');
    expect(messages[2].treeNodeId).toBe('tool:tool-call-1');
  });

  it('attaches subagentContext when the message lives under a subagent-root', () => {
    const tree = buildMinimalTree();
    const messages: TimelineMessage[] = [
      // This assistant turn sits inside the subagent — its ancestor chain
      // passes through agent:agentXXXXXXXXXXXX, so enrichment should
      // populate subagentContext.
      {
        type: 'assistant_text',
        uuid: 'sub-a-1',
        timestamp: '2026-04-12T00:00:04Z',
        model: 'claude-opus-4-6',
        text: 'subagent text',
        stopReason: 'end_turn',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          serviceTier: '',
          inferenceGeo: '',
          speed: '',
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
      },
    ];
    enrichMessagesWithTree(messages, tree);
    expect(messages[0].treeNodeId).toBe('asst:sub-a-1');
    expect(messages[0].subagentContext).not.toBeNull();
    expect(messages[0].subagentContext?.agentId).toBe('agentXXXXXXXXXXXX');
    expect(messages[0].subagentContext?.agentType).toBe('Explore');
    expect(messages[0].subagentContext?.description).toBe('do the exploration');
  });

  it('leaves subagentContext null when the message sits directly under session-root', () => {
    const tree = buildMinimalTree();
    const messages: TimelineMessage[] = [
      {
        type: 'user_text',
        uuid: 'u-1',
        timestamp: '2026-04-12T00:00:00Z',
        text: 'hi',
        isMeta: false,
      },
    ];
    enrichMessagesWithTree(messages, tree);
    expect(messages[0].treeNodeId).toBe('user:u-1');
    expect(messages[0].subagentContext).toBeNull();
  });

  it('tree=null — every message gets treeNodeId: null and status unavailable', () => {
    const messages: TimelineMessage[] = [
      {
        type: 'user_text',
        uuid: 'u-1',
        timestamp: '2026-04-12T00:00:00Z',
        text: 'hi',
        isMeta: false,
      },
      {
        type: 'system_event',
        timestamp: '2026-04-12T00:00:00Z',
        subtype: 'permission-change',
        summary: 'default',
      },
    ];
    const { status } = enrichMessagesWithTree(messages, null);
    expect(status).toBe('unavailable');
    for (const m of messages) {
      expect(m.treeNodeId).toBeNull();
      expect(m.subagentContext).toBeNull();
    }
  });

  it('system_event / skill_invocation always get treeNodeId: null (no tree mapping)', () => {
    const tree = buildMinimalTree();
    const messages: TimelineMessage[] = [
      {
        type: 'system_event',
        timestamp: '2026-04-12T00:00:00Z',
        subtype: 'permission-change',
        summary: 'default',
      },
      {
        type: 'skill_invocation',
        timestamp: '2026-04-12T00:00:00Z',
        commandName: 'brainstorm',
        commandArgs: '',
      },
    ];
    enrichMessagesWithTree(messages, tree);
    expect(messages[0].treeNodeId).toBeNull();
    expect(messages[1].treeNodeId).toBeNull();
    expect(messages[0].subagentContext).toBeNull();
    expect(messages[1].subagentContext).toBeNull();
  });

  it('unknown uuid — treeNodeId: null, no crash', () => {
    const tree = buildMinimalTree();
    const messages: TimelineMessage[] = [
      {
        type: 'assistant_text',
        uuid: 'non-existent-uuid',
        timestamp: '2026-04-12T00:00:00Z',
        model: 'claude-opus-4-6',
        text: 'orphan',
        stopReason: 'end_turn',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          serviceTier: '',
          inferenceGeo: '',
          speed: '',
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
      },
    ];
    enrichMessagesWithTree(messages, tree);
    expect(messages[0].treeNodeId).toBeNull();
    expect(messages[0].subagentContext).toBeNull();
  });
});
