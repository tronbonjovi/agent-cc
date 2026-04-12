import fs from 'fs';
import { extractText } from './utils';
import type {
  ParsedSession,
  SessionMeta,
  AssistantRecord,
  UserRecord,
  TokenUsage,
  ToolCall,
  ToolResult,
  ToolExecution,
  TurnDuration,
  HookSummary,
  LocalCommand,
  BridgeEvent,
  FileSnapshot,
  LifecycleEvent,
  ConversationNode,
  SessionCounts,
} from '@shared/session-types';

/** Parse a single JSONL file into a comprehensive ParsedSession.
 *  Reads the file once, extracts all record types. */
export function parseSessionFile(filePath: string, projectKey: string): ParsedSession | null {
  let content: string;
  let sizeBytes: number;
  try {
    const stat = fs.statSync(filePath);
    sizeBytes = stat.size;
    if (sizeBytes === 0) return null;
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // State collectors
  const assistantMessages: AssistantRecord[] = [];
  const userMessages: UserRecord[] = [];
  const turnDurations: TurnDuration[] = [];
  const hookSummaries: HookSummary[] = [];
  const localCommands: LocalCommand[] = [];
  const bridgeEvents: BridgeEvent[] = [];
  const toolTimeline: ToolExecution[] = [];
  const fileSnapshots: FileSnapshot[] = [];
  const lifecycle: LifecycleEvent[] = [];
  const conversationTree: ConversationNode[] = [];

  // Metadata — captured from first records that have each field
  let slug = '';
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let firstMessage = '';
  let cwd = '';
  let version = '';
  let gitBranch = '';
  let entrypoint = '';

  // Counts
  let totalRecords = 0;
  let toolErrors = 0;
  let sidechainMessages = 0;

  // Tool call matching: pending tool_use calls waiting for results
  const pendingToolCalls = new Map<
    string,
    { call: ToolCall; timestamp: string; isSidechain: boolean; assistantUuid: string }
  >();

  // Parse line by line
  let pos = 0;
  while (pos < content.length) {
    const nextNewline = content.indexOf('\n', pos);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline;
    const trimmed = content.slice(pos, lineEnd).trim();
    pos = lineEnd + 1;
    if (!trimmed) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let record: any;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    totalRecords++;
    const rtype: string = record.type || '';
    const ts: string = record.timestamp || '';

    // Track first/last timestamp
    if (ts) {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }

    // Capture metadata from first record that has each field
    if (!slug && record.slug) slug = record.slug;
    if (!cwd && record.cwd) cwd = record.cwd;
    if (!version && record.version) version = record.version;
    if (!gitBranch && record.gitBranch) gitBranch = record.gitBranch;
    if (!entrypoint && record.entrypoint) entrypoint = record.entrypoint;

    // Track sidechains
    if (record.isSidechain) sidechainMessages++;

    // Build conversation tree node
    if (record.uuid && (rtype === 'user' || rtype === 'assistant' || rtype === 'system')) {
      conversationTree.push({
        uuid: record.uuid,
        parentUuid: record.parentUuid || '',
        type: rtype as 'user' | 'assistant' | 'system',
        timestamp: ts,
        isSidechain: !!record.isSidechain,
      });
    }

    // === Record type dispatch ===

    if (rtype === 'assistant') {
      const msg = record.message;
      if (!msg || typeof msg !== 'object') continue;

      const usage = msg.usage || {};
      const msgContent = Array.isArray(msg.content) ? msg.content : [];

      // Extract tool calls
      const toolCalls: ToolCall[] = [];
      let hasThinking = false;
      let textPreview = '';

      for (const block of msgContent) {
        if (block == null || typeof block !== 'object') continue;
        if (block.type === 'thinking') {
          hasThinking = true;
        } else if (block.type === 'text' && typeof block.text === 'string') {
          if (!textPreview) textPreview = block.text.replace(/\n/g, ' ').slice(0, 300);
        } else if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown> | undefined;
          const tc: ToolCall = {
            id: block.id || '',
            name: block.name || '',
            filePath: ((input?.file_path || input?.path || null) as string | null),
            command: ((input?.command || null) as string | null),
            pattern: ((input?.pattern || null) as string | null),
          };
          toolCalls.push(tc);
          // Register as pending for matching
          pendingToolCalls.set(tc.id, {
            call: tc,
            timestamp: ts,
            isSidechain: !!record.isSidechain,
            assistantUuid: record.uuid || '',
          });
        }
      }

      const stu = usage.server_tool_use || {};
      const tokenUsage: TokenUsage = {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        serviceTier: usage.service_tier || '',
        inferenceGeo: usage.inference_geo || '',
        speed: usage.speed || '',
        serverToolUse: {
          webSearchRequests: stu.web_search_requests || 0,
          webFetchRequests: stu.web_fetch_requests || 0,
        },
      };

      assistantMessages.push({
        uuid: record.uuid || '',
        parentUuid: record.parentUuid || '',
        timestamp: ts,
        requestId: record.requestId || '',
        isSidechain: !!record.isSidechain,
        model: msg.model || '',
        stopReason: msg.stop_reason || '',
        usage: tokenUsage,
        toolCalls,
        hasThinking,
        textPreview,
      });
    } else if (rtype === 'user') {
      const msg = record.message;
      const msgContent =
        msg && typeof msg === 'object' && Array.isArray(msg.content) ? msg.content : [];

      // First meaningful user message becomes firstMessage
      if (!firstMessage && msg && typeof msg === 'object') {
        const text = extractText(msg.content || '');
        if (
          text &&
          !text.startsWith('<local-command') &&
          !text.startsWith('<command-name') &&
          !text.includes('[Request interrupted')
        ) {
          firstMessage = text
            .replace(/^---\n[\s\S]*?\n---\n*/, '')
            .replace(/\n/g, ' ')
            .trim();
        }
      }

      // Extract tool results
      const toolResults: ToolResult[] = [];
      for (const block of msgContent) {
        if (block == null || typeof block !== 'object') continue;
        if (block.type === 'tool_result') {
          const isError = !!block.is_error;
          if (isError) toolErrors++;
          toolResults.push({
            toolUseId: block.tool_use_id || '',
            isError,
            durationMs: null,
            success: null,
          });
        }
      }

      // Extract toolUseResult metadata (record-level, separate from content blocks)
      const tur = record.toolUseResult;
      if (tur && typeof tur === 'object') {
        // Attach durationMs/success to the first tool result if present
        if (toolResults.length > 0) {
          if (typeof tur.durationMs === 'number') toolResults[0].durationMs = tur.durationMs;
          if (typeof tur.success === 'boolean') toolResults[0].success = tur.success;
        }
      }

      // Match tool results back to pending tool calls -> build ToolExecution timeline
      for (const tr of toolResults) {
        const pending = pendingToolCalls.get(tr.toolUseId);
        if (pending) {
          toolTimeline.push({
            callId: tr.toolUseId,
            name: pending.call.name,
            filePath: pending.call.filePath,
            command: pending.call.command,
            pattern: pending.call.pattern,
            timestamp: pending.timestamp,
            resultTimestamp: ts,
            durationMs: tr.durationMs,
            isError: tr.isError,
            isSidechain: pending.isSidechain,
            issuedByAssistantUuid: pending.assistantUuid,
          });
          pendingToolCalls.delete(tr.toolUseId);
        }
      }

      // User text preview
      let textPreview = '';
      if (msg && typeof msg === 'object') {
        const text = extractText(msg.content || '');
        if (text) {
          textPreview = text
            .replace(
              /<(?:system-reminder|command-name|command-message)>[\s\S]*?<\/(?:system-reminder|command-name|command-message)>/g,
              '',
            )
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 300);
        }
      }

      userMessages.push({
        uuid: record.uuid || '',
        parentUuid: record.parentUuid || '',
        timestamp: ts,
        isSidechain: !!record.isSidechain,
        isMeta: !!record.isMeta,
        permissionMode: record.permissionMode || null,
        toolResults,
        textPreview,
      });
    } else if (rtype === 'system') {
      const subtype = record.subtype || '';

      if (subtype === 'turn_duration') {
        turnDurations.push({
          timestamp: ts,
          durationMs: record.durationMs || 0,
          messageCount: record.messageCount || 0,
          parentUuid: record.parentUuid || '',
        });
      } else if (subtype === 'stop_hook_summary') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const infos = Array.isArray(record.hookInfos) ? record.hookInfos : [];
        hookSummaries.push({
          timestamp: ts,
          hookCount: record.hookCount || 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hooks: infos.map((h: any) => ({
            command: h.command || '',
            durationMs: h.durationMs || 0,
          })),
          errors: Array.isArray(record.hookErrors) ? record.hookErrors : [],
          preventedContinuation: !!record.preventedContinuation,
          stopReason: record.stopReason || '',
        });
      } else if (subtype === 'local_command') {
        localCommands.push({
          timestamp: ts,
          content: record.content || '',
        });
      } else if (subtype === 'bridge_status') {
        bridgeEvents.push({
          timestamp: ts,
          url: record.url || '',
          content: record.content || '',
        });
      }
    } else if (rtype === 'file-history-snapshot') {
      fileSnapshots.push({
        messageId: record.messageId || '',
        isUpdate: !!record.isSnapshotUpdate,
        timestamp: ts || lastTs || '',
      });
    } else if (rtype === 'queue-operation') {
      const op = record.operation || '';
      const typeMap: Record<string, LifecycleEvent['type']> = {
        enqueue: 'queue-enqueue',
        dequeue: 'queue-dequeue',
        remove: 'queue-remove',
      };
      if (typeMap[op]) {
        lifecycle.push({
          timestamp: ts,
          type: typeMap[op],
          detail: record.content || op,
        });
      }
    } else if (rtype === 'attachment') {
      const att = record.attachment;
      if (att && typeof att === 'object' && att.type === 'deferred_tools_delta') {
        const added = Array.isArray(att.addedNames) ? att.addedNames.length : 0;
        const removed = Array.isArray(att.removedNames) ? att.removedNames.length : 0;
        lifecycle.push({
          timestamp: ts,
          type: 'tools-changed',
          detail: `+${added} -${removed} tools`,
        });
      }
    } else if (rtype === 'permission-mode') {
      lifecycle.push({
        timestamp: ts,
        type: 'permission-change',
        detail: record.permissionMode || '',
      });
    } else if (rtype === 'last-prompt') {
      lifecycle.push({
        timestamp: ts,
        type: 'last-prompt',
        detail: '',
      });
    }
  }

  // Derive sessionId from filename
  const basename = filePath.replace(/\\/g, '/').split('/').pop() || '';
  const sessionId = basename.replace(/\.jsonl$/, '');

  const meta: SessionMeta = {
    sessionId,
    slug,
    firstMessage,
    firstTs,
    lastTs,
    sizeBytes,
    filePath: filePath.replace(/\\/g, '/'),
    projectKey,
    cwd,
    version,
    gitBranch,
    entrypoint,
  };

  const counts: SessionCounts = {
    totalRecords,
    assistantMessages: assistantMessages.length,
    userMessages: userMessages.length,
    systemEvents:
      turnDurations.length + hookSummaries.length + localCommands.length + bridgeEvents.length,
    toolCalls: toolTimeline.length,
    toolErrors,
    fileSnapshots: fileSnapshots.length,
    sidechainMessages,
  };

  return {
    meta,
    assistantMessages,
    userMessages,
    systemEvents: { turnDurations, hookSummaries, localCommands, bridgeEvents },
    toolTimeline,
    fileSnapshots,
    lifecycle,
    conversationTree,
    counts,
  };
}
