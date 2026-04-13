import fs from 'fs';
import { extractText } from './utils';
import { discoverSubagents } from './subagent-discovery';
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
  TimelineMessage,
  TimelineMessageType,
  TimelineSubagentContext,
  SessionTree,
  SessionTreeNode,
  SubagentRootNode,
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
            agentId: null,
          });
        }
      }

      // Extract toolUseResult metadata (record-level, separate from content blocks).
      // toolUseResult is an envelope for a single tool-call result — when it
      // carries an Agent dispatch, its `agentId` field is the subagent that
      // ran. We attach it to the first ToolResult so tier-1 linkage can
      // resolve subagent parent → child without scanning text content.
      const tur = record.toolUseResult;
      if (tur && typeof tur === 'object') {
        if (toolResults.length > 0) {
          if (typeof tur.durationMs === 'number') toolResults[0].durationMs = tur.durationMs;
          if (typeof tur.success === 'boolean') toolResults[0].success = tur.success;
          if (typeof tur.agentId === 'string' && tur.agentId) {
            toolResults[0].agentId = tur.agentId;
          }
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

// ---------------------------------------------------------------------------
// Typed message timeline — powers `GET /api/sessions/:id/messages`
// ---------------------------------------------------------------------------

/** Safety cap to prevent OOM on pathological sessions. */
const MAX_TIMELINE_MESSAGES = 5000;

/** Upper bound on how many characters of free text we keep per message. */
const MAX_TEXT_CHARS = 2000;

/**
 * Pull a short human-readable description out of a system record. Mirrors
 * the classification used by the flat-array parser but collapses everything
 * to a single string so the frontend can render without knowing the
 * subtype-specific schema.
 */
function summarizeSystemRecord(record: Record<string, unknown>): string {
  const subtype = (record.subtype as string) || '';
  switch (subtype) {
    case 'turn_duration': {
      const ms = (record.durationMs as number) || 0;
      const count = (record.messageCount as number) || 0;
      return `turn complete · ${ms} ms · ${count} msgs`;
    }
    case 'stop_hook_summary': {
      const count = (record.hookCount as number) || 0;
      const errs = Array.isArray(record.hookErrors) ? (record.hookErrors as unknown[]).length : 0;
      return `${count} hooks ran` + (errs > 0 ? ` · ${errs} errors` : '');
    }
    case 'local_command':
      // Slash commands — surfaced as skill_invocation. Fall through for
      // anything the skill extractor didn't consume.
      return ((record.content as string) || '').slice(0, 200);
    case 'bridge_status':
      return ((record.content as string) || '').slice(0, 200);
    default:
      return subtype || 'system';
  }
}

/**
 * Skill/slash-command XML found in user-message text and in `system` records
 * with `subtype: "local_command"`. Returns null when the string doesn't
 * contain a recognizable command-name block. Kept permissive — partial tags
 * are accepted so the frontend can render best-effort commands even from
 * half-escaped JSONL.
 */
function extractSkillInvocation(content: string): { commandName: string; commandArgs: string } | null {
  const nameMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
  if (!nameMatch) return null;
  const argsMatch = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
  return {
    commandName: nameMatch[1].trim(),
    commandArgs: argsMatch ? argsMatch[1].trim() : '',
  };
}

/**
 * Walk `record.message.content` and flatten into zero-or-more typed messages.
 * One assistant/user record can yield multiple timeline entries: e.g. an
 * assistant turn with a thinking block + two tool_use blocks becomes one
 * `thinking` message and two `tool_call` messages. All share the record's
 * `uuid` / `timestamp` — the frontend uses those + `type` as a stable key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenAssistant(record: any): TimelineMessage[] {
  const out: TimelineMessage[] = [];
  const msg = record?.message;
  if (!msg || typeof msg !== 'object') return out;
  const content = Array.isArray(msg.content) ? msg.content : [];
  const uuid = record.uuid || '';
  const ts = record.timestamp || '';
  const isSidechain = !!record.isSidechain;

  // Build a usage snapshot once — emitted with the first assistant_text per
  // record, so the frontend can show cost / token totals on the turn header
  // without walking to the underlying ParsedSession.
  const rawUsage = (msg.usage || {}) as Record<string, unknown>;
  const stu = (rawUsage.server_tool_use || {}) as Record<string, unknown>;
  const usage: TokenUsage = {
    inputTokens: (rawUsage.input_tokens as number) || 0,
    outputTokens: (rawUsage.output_tokens as number) || 0,
    cacheReadTokens: (rawUsage.cache_read_input_tokens as number) || 0,
    cacheCreationTokens: (rawUsage.cache_creation_input_tokens as number) || 0,
    serviceTier: (rawUsage.service_tier as string) || '',
    inferenceGeo: (rawUsage.inference_geo as string) || '',
    speed: (rawUsage.speed as string) || '',
    serverToolUse: {
      webSearchRequests: (stu.web_search_requests as number) || 0,
      webFetchRequests: (stu.web_fetch_requests as number) || 0,
    },
  };

  let emittedText = false;
  for (const block of content) {
    if (block == null || typeof block !== 'object') continue;
    const btype = (block as Record<string, unknown>).type as string;
    if (btype === 'text') {
      const text = typeof block.text === 'string' ? block.text : '';
      if (!text) continue;
      out.push({
        type: 'assistant_text',
        uuid,
        timestamp: ts,
        model: (msg.model as string) || '',
        text: text.slice(0, MAX_TEXT_CHARS),
        stopReason: (msg.stop_reason as string) || '',
        // Attach usage only to the first text block so totals aren't
        // double-counted when a turn has multiple text segments.
        usage: emittedText ? { ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } : usage,
        isSidechain,
      });
      emittedText = true;
    } else if (btype === 'thinking') {
      const text = typeof (block as Record<string, unknown>).thinking === 'string'
        ? ((block as Record<string, unknown>).thinking as string)
        : (typeof (block as Record<string, unknown>).text === 'string'
          ? ((block as Record<string, unknown>).text as string)
          : '');
      // Claude Code JSONL persists thinking blocks as `{thinking: "", signature: "..."}`
      // — only an encrypted signature, never the raw reasoning text. Suppress
      // empty records so the timeline doesn't show broken "Thinking... (0 chars)"
      // rows with nothing to expand. If Claude Code ever starts persisting the
      // text, this filter becomes a no-op automatically.
      if (!text) continue;
      out.push({
        type: 'thinking',
        uuid,
        timestamp: ts,
        text: text.slice(0, MAX_TEXT_CHARS),
        isSidechain,
      });
    } else if (btype === 'tool_use') {
      out.push({
        type: 'tool_call',
        uuid,
        timestamp: ts,
        callId: (block as Record<string, unknown>).id as string || '',
        name: (block as Record<string, unknown>).name as string || '',
        input: ((block as Record<string, unknown>).input as Record<string, unknown>) || {},
        isSidechain,
      });
    }
  }

  // If the record had no usable content blocks at all but still carried
  // usage (rare — happens on empty model replies), emit a placeholder
  // assistant_text so the turn is visible and token counts aren't dropped.
  if (out.length === 0 && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    out.push({
      type: 'assistant_text',
      uuid,
      timestamp: ts,
      model: (msg.model as string) || '',
      text: '',
      stopReason: (msg.stop_reason as string) || '',
      usage,
      isSidechain,
    });
  }
  return out;
}

// Tags that are system-injected into user messages by Claude Code itself.
// `local-command-*` come from slash command output/caveats; `command-*`
// frame the slash command invocation; `system-reminder` is injected by the
// harness. All of these should be stripped before emitting user_text so the
// reader sees only what the user actually typed.
const SYSTEM_INJECTED_TAGS =
  'system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|local-command-stdin';
const SYSTEM_INJECTED_TAG_RE = new RegExp(
  `<(?:${SYSTEM_INJECTED_TAGS})>[\\s\\S]*?<\\/(?:${SYSTEM_INJECTED_TAGS})>`,
  'g',
);

function stripSystemInjectedTags(raw: string): string {
  return raw.replace(SYSTEM_INJECTED_TAG_RE, '').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenUser(record: any): TimelineMessage[] {
  const out: TimelineMessage[] = [];
  const msg = record?.message;
  if (!msg || typeof msg !== 'object') return out;
  const uuid = record.uuid || '';
  const ts = record.timestamp || '';
  const isSidechain = !!record.isSidechain;
  const isMeta = !!record.isMeta;

  const emitUserFromRaw = (raw: string): void => {
    // Always try to extract a skill invocation first — if the user typed
    // `/effort max\nyes`, we want the skill_invocation AND a user_text for
    // the residual "yes" after stripping the command tags.
    const skill = extractSkillInvocation(raw);
    if (skill) {
      out.push({
        type: 'skill_invocation',
        timestamp: ts,
        commandName: skill.commandName,
        commandArgs: skill.commandArgs,
        isSidechain,
      });
    }
    // isMeta records are framework-injected plumbing — when a user invokes
    // a slash command, Claude Code emits the command as a normal user
    // record (with <command-name> XML → skill_invocation chip above), then
    // injects a SECOND user record with `isMeta: true` containing the
    // skill's full body ("Base directory for this skill: ..."). That
    // second record has no XML to strip, so without this guard it lands
    // in the timeline as a blue user bubble full of skill boilerplate.
    // The skill_invocation chip from the preceding non-meta record
    // already represents the command; the body is noise.
    if (isMeta) return;
    const stripped = stripSystemInjectedTags(raw);
    if (stripped) {
      out.push({
        type: 'user_text',
        uuid,
        timestamp: ts,
        text: stripped.slice(0, MAX_TEXT_CHARS),
        isMeta,
        isSidechain,
      });
    }
  };

  // Content can be a bare string or an array of blocks. Handle both.
  if (typeof msg.content === 'string') {
    emitUserFromRaw(msg.content);
    return out;
  }

  const content = Array.isArray(msg.content) ? msg.content : [];
  let userText = '';
  for (const block of content) {
    if (block == null || typeof block !== 'object') continue;
    const btype = (block as Record<string, unknown>).type as string;
    if (btype === 'text') {
      const text = typeof block.text === 'string' ? block.text : '';
      if (text) userText += (userText ? '\n' : '') + text;
    } else if (btype === 'tool_result') {
      const toolUseId = (block as Record<string, unknown>).tool_use_id as string || '';
      const isError = !!(block as Record<string, unknown>).is_error;
      const resultContent = (block as Record<string, unknown>).content;
      let resultText = '';
      if (typeof resultContent === 'string') resultText = resultContent;
      else if (Array.isArray(resultContent)) resultText = extractText(resultContent);
      out.push({
        type: 'tool_result',
        uuid,
        timestamp: ts,
        toolUseId,
        content: resultText.slice(0, MAX_TEXT_CHARS),
        isError,
        isSidechain,
      });
    }
  }

  if (userText) emitUserFromRaw(userText);
  return out;
}

/**
 * Parse an entire session JSONL file into a typed, paginated message
 * timeline. Returns the full count (`totalMessages`) and a slice (`messages`)
 * controlled by `offset`/`limit`. Emits seven typed variants:
 *
 * - `user_text` — user message text (stripped of XML frames)
 * - `assistant_text` — assistant text block
 * - `thinking` — assistant thinking block
 * - `tool_call` — assistant tool_use block
 * - `tool_result` — user tool_result block
 * - `system_event` — catch-all for `system` records
 * - `skill_invocation` — slash commands lifted from user text or system records
 *
 * Optional `types` narrows the emitted variants (applied before pagination
 * so the client can ask for "all tool_calls" without fetching + filtering
 * the full timeline).
 */
export function parseSessionMessages(
  filePath: string,
  offset: number,
  limit: number,
  types?: Set<TimelineMessageType>,
): { messages: TimelineMessage[]; totalMessages: number } {
  // Parse the main session file, then every discovered subagent file next
  // to it. Subagent records have `isSidechain: true` and tree nodes that
  // live under a `subagent-root`, so merging them into the timeline is how
  // the frontend gets anything to group under SidechainGroup. Without this
  // merge, main-session messages never have a subagent-root ancestor and
  // `subagentContext` is always null.
  const mainMessages = parseJsonlFileToMessages(filePath);
  const allMessages: TimelineMessage[] = [...mainMessages];
  if (allMessages.length < MAX_TIMELINE_MESSAGES) {
    const subagents = discoverSubagents(filePath);
    for (const sub of subagents) {
      if (allMessages.length >= MAX_TIMELINE_MESSAGES) break;
      const subMessages = parseJsonlFileToMessages(sub.filePath);
      for (const m of subMessages) {
        allMessages.push(m);
        if (allMessages.length >= MAX_TIMELINE_MESSAGES) break;
      }
    }
    // Merge sort by timestamp so subagent runs appear interleaved with
    // their parent turn rather than appended at the end. ISO-8601 strings
    // sort lexicographically in chronological order.
    allMessages.sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return 0;
    });
  }

  const filtered = types
    ? allMessages.filter((m) => types.has(m.type))
    : allMessages;
  const totalMessages = filtered.length;
  const sliced = filtered.slice(offset, offset + limit);
  return { messages: sliced, totalMessages };
}

/**
 * Parse one JSONL file (main session OR subagent) into a flat list of
 * typed TimelineMessage records. Shared between the main-file and
 * subagent-file read paths. Applies `MAX_TIMELINE_MESSAGES` as a soft cap
 * so a single enormous file can't blow memory. No pagination or type
 * filtering happens here — both are applied by `parseSessionMessages`
 * after all files have been merged and sorted.
 */
function parseJsonlFileToMessages(filePath: string): TimelineMessage[] {
  const out: TimelineMessage[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return out;
  }

  let pos = 0;
  while (pos < content.length && out.length < MAX_TIMELINE_MESSAGES) {
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

    const rtype = record.type || '';
    let emitted: TimelineMessage[] = [];

    if (rtype === 'assistant') {
      emitted = flattenAssistant(record);
    } else if (rtype === 'user') {
      emitted = flattenUser(record);
    } else if (rtype === 'system') {
      const subtype = (record.subtype as string) || '';
      const ts = (record.timestamp as string) || '';
      // Slash command content comes through as `local_command` system
      // records — we upgrade those to `skill_invocation` so the frontend
      // can render a distinct chip instead of raw XML.
      if (subtype === 'local_command') {
        const rawContent = (record.content as string) || '';
        const skill = extractSkillInvocation(rawContent);
        if (skill) {
          emitted.push({
            type: 'skill_invocation',
            timestamp: ts,
            commandName: skill.commandName,
            commandArgs: skill.commandArgs,
            isSidechain: Boolean(record.isSidechain),
          });
        } else {
          emitted.push({
            type: 'system_event',
            timestamp: ts,
            subtype,
            summary: summarizeSystemRecord(record),
            isSidechain: Boolean(record.isSidechain),
          });
        }
      } else {
        emitted.push({
          type: 'system_event',
          timestamp: ts,
          subtype,
          summary: summarizeSystemRecord(record),
        });
      }
    } else {
      // file-history-snapshot, queue-operation, attachment, permission-mode,
      // last-prompt — surface the interesting ones as system_event so the
      // timeline stays complete. Skip unknowns silently (graceful degradation).
      const ts = (record.timestamp as string) || '';
      if (rtype === 'file-history-snapshot') {
        emitted.push({
          type: 'system_event',
          timestamp: ts,
          subtype: 'file-snapshot',
          summary: (record.isSnapshotUpdate ? 'incremental file snapshot' : 'full file snapshot'),
        });
      } else if (rtype === 'queue-operation') {
        emitted.push({
          type: 'system_event',
          timestamp: ts,
          subtype: `queue-${(record.operation as string) || 'unknown'}`,
          summary: (record.content as string) || ((record.operation as string) || 'queue operation'),
        });
      } else if (rtype === 'attachment') {
        const att = record.attachment;
        if (att && typeof att === 'object' && att.type === 'deferred_tools_delta') {
          const added = Array.isArray(att.addedNames) ? att.addedNames.length : 0;
          const removed = Array.isArray(att.removedNames) ? att.removedNames.length : 0;
          emitted.push({
            type: 'system_event',
            timestamp: ts,
            subtype: 'tools-changed',
            summary: `+${added} -${removed} tools`,
          });
        }
      } else if (rtype === 'permission-mode') {
        emitted.push({
          type: 'system_event',
          timestamp: ts,
          subtype: 'permission-change',
          summary: (record.permissionMode as string) || 'permission mode changed',
        });
      } else if (rtype === 'last-prompt') {
        emitted.push({
          type: 'system_event',
          timestamp: ts,
          subtype: 'last-prompt',
          summary: 'last prompt marker',
        });
      }
    }

    for (const m of emitted) {
      out.push(m);
      if (out.length >= MAX_TIMELINE_MESSAGES) break;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Tree enrichment — attaches treeNodeId + subagentContext to each message.
// Used when the route handler sees `?include=tree`.
// ---------------------------------------------------------------------------

/**
 * Walk up `tree.nodesById` from `startId` until we hit a `subagent-root`
 * (success) or a `session-root` / missing parent (null). Caches results on
 * `cache` keyed by id so repeated calls on the same ancestor chain are O(1).
 */
function findSubagentAncestor(
  tree: SessionTree,
  startId: string,
  cache: Map<string, TimelineSubagentContext | null>,
): TimelineSubagentContext | null {
  // Re-use memoized result.
  const memo = cache.get(startId);
  if (memo !== undefined) return memo;

  const visited: string[] = [];
  let current: SessionTreeNode | undefined = tree.nodesById.get(startId);
  let found: TimelineSubagentContext | null = null;
  while (current) {
    // Respect memoization mid-walk too — lets us short-circuit long chains.
    const inner = cache.get(current.id);
    if (inner !== undefined) {
      found = inner;
      break;
    }
    visited.push(current.id);
    if (current.kind === 'subagent-root') {
      const sub = current as SubagentRootNode;
      found = {
        agentId: sub.agentId,
        agentType: sub.agentType,
        description: sub.description,
      };
      break;
    }
    if (current.kind === 'session-root' || !current.parentId) {
      found = null;
      break;
    }
    current = tree.nodesById.get(current.parentId);
  }
  // Write-back to cache for every visited ancestor — they all share `found`.
  for (const id of visited) cache.set(id, found);
  return found;
}

/**
 * For a timeline message, compute the candidate tree node id. The mapping
 * follows `docs/scanner-capabilities.md`:
 *
 * - `tool_call` / `tool_result` → `tool:<callId>` (only built when the pair
 *   matched in the flat parser; unmatched calls fall back to their owning
 *   assistant/user turn)
 * - `thinking` / `assistant_text` → `asst:<uuid>`
 * - `user_text` → `user:<uuid>`
 * - `system_event` / `skill_invocation` → no tree node (session-level events)
 */
function candidateTreeNodeId(message: TimelineMessage): string | null {
  switch (message.type) {
    case 'tool_call':
      return message.callId ? `tool:${message.callId}` : `asst:${message.uuid}`;
    case 'tool_result':
      return message.toolUseId ? `tool:${message.toolUseId}` : `user:${message.uuid}`;
    case 'thinking':
    case 'assistant_text':
      return message.uuid ? `asst:${message.uuid}` : null;
    case 'user_text':
      return message.uuid ? `user:${message.uuid}` : null;
    case 'system_event':
    case 'skill_invocation':
      return null;
  }
}

/**
 * Attach `treeNodeId` and `subagentContext` to each message in place.
 * Returns `{ status }` — `ok` when tree enrichment ran, `unavailable` when
 * `tree` was null (in which case every message gets `treeNodeId: null` and
 * `subagentContext: null`, keeping the shape stable).
 */
export function enrichMessagesWithTree(
  messages: TimelineMessage[],
  tree: SessionTree | null,
): { status: 'ok' | 'unavailable' } {
  if (!tree) {
    for (const m of messages) {
      m.treeNodeId = null;
      m.subagentContext = null;
    }
    return { status: 'unavailable' };
  }

  const ancestorCache = new Map<string, TimelineSubagentContext | null>();
  for (const m of messages) {
    const candidate = candidateTreeNodeId(m);
    if (!candidate) {
      m.treeNodeId = null;
      m.subagentContext = null;
      continue;
    }
    const node = tree.nodesById.get(candidate);
    if (!node) {
      // The id we guessed didn't land on a real node (e.g. orphan tool
      // call, parser/builder disagree). Fall back to null — frontend will
      // render the message without grouping rather than crashing.
      m.treeNodeId = null;
      m.subagentContext = null;
      continue;
    }
    m.treeNodeId = candidate;
    m.subagentContext = findSubagentAncestor(tree, candidate, ancestorCache);
  }
  return { status: 'ok' };
}
