import { describe, it, expect } from 'vitest';
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
