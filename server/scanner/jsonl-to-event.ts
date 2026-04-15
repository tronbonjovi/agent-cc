/**
 * JSONL → InteractionEvent mapper (scanner-ingester task001).
 *
 * Pure data transformation. Given a batch of parsed JSONL lines from a
 * Claude Code session file plus a context envelope (`conversationId`,
 * `sessionPath`), this module produces a stream of `InteractionEvent` values
 * shaped for insertion into `interactions.db`.
 *
 * Design notes (see contract + `reference_claude_code_jsonl` memory):
 *
 *   - STATELESS. No file I/O, no DB, no randomness. The mapper runs twice on
 *     the same input and returns byte-identical events. This is load-bearing:
 *     task002 (the ingester) reruns the mapper on every startup and relies on
 *     `INSERT OR REPLACE` semantics to avoid duplicates.
 *
 *   - EVENT IDS. Derived from the JSONL record's `uuid` field, namespaced by
 *     block kind (`<uuid>`, `<uuid>:tool:<idx>`, `<uuid>:result:<idx>`) so a
 *     single assistant record with N tool_use blocks produces N+1 distinct
 *     but still-deterministic event ids. Never `crypto.randomUUID()`.
 *
 *   - FRAMEWORK NOISE. `isMeta: true` user records are framework injections
 *     (slash-command body injection, etc.) and are DROPPED before any blocks
 *     are emitted — they are not user speech. This matches `session-parser`
 *     behavior and the `reference_claude_code_jsonl` memory.
 *
 *   - XML TAG STRIPPING. Framework injects several XML tags into user text
 *     (`<system-reminder>`, `<command-name>`, etc.). These are stripped from
 *     text content before the event is emitted. The authoritative tag list
 *     lives in the memory file; FRAMEWORK_XML_TAGS below mirrors it.
 *
 *   - COST POPULATION. Only assistant records carry `usage` data; each one
 *     produces at most one `InteractionCost` which is attached to the first
 *     text/tool_call block emitted by that record. All other events have
 *     `cost: null` (per the `InteractionEvent` contract). Dollar cost is
 *     computed via `pricing.ts` so the unified store is analytics-ready.
 *
 *   - THINKING BLOCKS. Per the memory, `thinking.thinking` is always empty
 *     in persisted JSONL. We skip thinking blocks entirely — emitting a
 *     `ThinkingContent` with empty text would just clutter the store.
 *
 *   - SIDECHAINS. Records with `isSidechain: true` in a main session file are
 *     stray; real sidechain messages live in separate subagent files. This
 *     mapper does not cross files. Sidechain handling is task002's problem.
 *
 *   - MALFORMED INPUT. Any line that isn't a plain object, or is missing
 *     essentials (`type`, `uuid`), is silently skipped. Never throws. The
 *     tests cover garbage input directly.
 */

import type {
  InteractionEvent,
  InteractionContent,
  InteractionCost,
  TextContent,
  ToolCallContent,
  ToolResultContent,
} from '../../shared/types';
import { computeCost, getPricing } from './pricing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Framework-injected XML tags to strip from user text content.
 * Source: `reference_claude_code_jsonl` memory. Do not extend without
 * updating that memory — it is the single source of truth.
 */
const FRAMEWORK_XML_TAGS = [
  'system-reminder',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
  'local-command-stderr',
  'local-command-caveat',
  'local-command-stdin',
] as const;

/** Pre-built regex that strips the open/close forms of every framework tag. */
const FRAMEWORK_TAG_REGEX = new RegExp(
  `<(?:${FRAMEWORK_XML_TAGS.join('|')})>[\\s\\S]*?<\\/(?:${FRAMEWORK_XML_TAGS.join('|')})>`,
  'g',
);

// ---------------------------------------------------------------------------
// Context + public entry point
// ---------------------------------------------------------------------------

export interface JsonlMapContext {
  /** Conversation ID to stamp on every emitted event. Typically the session id. */
  conversationId: string;
  /** Absolute path to the source JSONL (stored in `metadata.sessionPath`). */
  sessionPath: string;
}

/**
 * Convert parsed JSONL lines into `InteractionEvent[]`. Pure; no side
 * effects. Lines can be anything (strings, objects, garbage) — non-objects
 * and missing-field records are skipped.
 *
 * Two-pass resolution for tool_result → tool_call linking:
 *
 *   Pass 1 emits all events and, while walking assistant tool_use blocks,
 *   records `toolUseId → eventId` in a map. tool_result events are emitted
 *   with a synthetic placeholder `parentEventId` of the form
 *   `tool-use:<toolUseId>` that pass 2 will resolve.
 *
 *   Pass 2 walks the emitted events, replaces every synthetic placeholder
 *   with the real assistant-side event id from the map, or sets it to `null`
 *   if no tool_use with that id was seen in the same file (bare tool_result).
 *
 * The synthetic placeholder is an internal detail of this function and never
 * escapes — callers only ever see resolved ids or `null`.
 */
export function jsonlLinesToEvents(
  lines: unknown[],
  context: JsonlMapContext,
): InteractionEvent[] {
  // Pass 1: emit everything, recording tool_use → event id as we go.
  const out: InteractionEvent[] = [];
  const toolUseToEventId = new Map<string, string>();

  for (const line of lines) {
    if (!isPlainRecord(line)) continue;
    const events = handleLine(line, context);
    for (const e of events) {
      if (
        e.role === 'assistant' &&
        e.content.type === 'tool_call' &&
        e.content.toolUseId
      ) {
        // Don't overwrite if the same toolUseId somehow appears twice — the
        // first tool_use wins, matching the natural reading order of a file.
        if (!toolUseToEventId.has(e.content.toolUseId)) {
          toolUseToEventId.set(e.content.toolUseId, e.id);
        }
      }
      out.push(e);
    }
  }

  // Pass 2: resolve synthetic tool_result parent links to real event ids.
  for (const e of out) {
    const pid = e.parentEventId;
    if (typeof pid === 'string' && pid.startsWith('tool-use:')) {
      const toolUseId = pid.slice('tool-use:'.length);
      const resolved = toolUseToEventId.get(toolUseId);
      e.parentEventId = resolved ?? null;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Line-level dispatch
// ---------------------------------------------------------------------------

type Record = globalThis.Record<string, unknown>;

function handleLine(record: Record, ctx: JsonlMapContext): InteractionEvent[] {
  const type = record.type;
  const uuid = record.uuid;
  const ts = record.timestamp;

  // Essentials check — no uuid means we can't derive a stable event id.
  if (typeof uuid !== 'string' || !uuid) return [];
  if (typeof ts !== 'string' || !ts) return [];

  if (type === 'assistant') return handleAssistant(record, ctx, uuid, ts);
  if (type === 'user') return handleUser(record, ctx, uuid, ts);
  // Other record types (system, file-history-snapshot, attachment, etc.)
  // are framework plumbing and have no counterpart in InteractionEvent yet.
  return [];
}

// ---------------------------------------------------------------------------
// Assistant records
// ---------------------------------------------------------------------------

/**
 * Emit one event per meaningful content block in an assistant record.
 * The first emitted event gets the cost attached; the rest have cost: null
 * (same-turn events share a single API call so double-counting would be wrong).
 */
function handleAssistant(
  record: Record,
  ctx: JsonlMapContext,
  uuid: string,
  timestamp: string,
): InteractionEvent[] {
  const message = record.message;
  if (!isPlainRecord(message)) return [];
  const content = Array.isArray(message.content) ? message.content : [];

  const model = typeof message.model === 'string' ? message.model : '';
  const cost = buildCostFromUsage(message.usage, model);

  const events: InteractionEvent[] = [];
  let costAssigned = false;
  let textIdx = 0;
  let toolIdx = 0;

  for (const block of content) {
    if (!isPlainRecord(block)) continue;
    const blockType = block.type;

    if (blockType === 'text') {
      const text = typeof block.text === 'string' ? stripFrameworkTags(block.text) : '';
      if (!text) continue;
      const textContent: TextContent = { type: 'text', text };
      events.push(
        makeEvent({
          id: `${uuid}:text:${textIdx}`,
          conversationId: ctx.conversationId,
          timestamp,
          role: 'assistant',
          content: textContent,
          cost: costAssigned ? null : cost,
          sessionPath: ctx.sessionPath,
          sourceUuid: uuid,
        }),
      );
      if (!costAssigned && cost) costAssigned = true;
      textIdx++;
    } else if (blockType === 'tool_use') {
      const toolName = typeof block.name === 'string' ? block.name : '';
      const toolUseId = typeof block.id === 'string' ? block.id : `${uuid}:tool:${toolIdx}`;
      const toolCall: ToolCallContent = {
        type: 'tool_call',
        toolName,
        input: block.input ?? null,
        toolUseId,
      };
      events.push(
        makeEvent({
          id: `${uuid}:tool:${toolIdx}`,
          conversationId: ctx.conversationId,
          timestamp,
          role: 'assistant',
          content: toolCall,
          cost: costAssigned ? null : cost,
          sessionPath: ctx.sessionPath,
          sourceUuid: uuid,
        }),
      );
      if (!costAssigned && cost) costAssigned = true;
      toolIdx++;
    }
    // thinking blocks: skipped — always empty in persisted JSONL.
  }

  return events;
}

// ---------------------------------------------------------------------------
// User records
// ---------------------------------------------------------------------------

/**
 * Emit events for a user record. Framework-meta records (`isMeta: true`) are
 * filtered entirely — the skill_invocation chip from the preceding non-meta
 * record already represents the user's action.
 *
 * A user record can carry:
 *   - a raw text string (`message.content: "hi"`)
 *   - an array of content blocks (`tool_result`, `text`)
 * Tool-result blocks are emitted as `tool_result` events with `role: 'tool'`
 * and `parentEventId` pointing at the assistant's tool_call event (derived
 * deterministically from `tool_use_id`, not the JSONL record uuid).
 */
function handleUser(
  record: Record,
  ctx: JsonlMapContext,
  uuid: string,
  timestamp: string,
): InteractionEvent[] {
  if (record.isMeta === true) return [];
  const message = record.message;
  if (!isPlainRecord(message)) return [];

  const events: InteractionEvent[] = [];
  const rawContent = message.content;

  // String content — plain user message.
  if (typeof rawContent === 'string') {
    const text = stripFrameworkTags(rawContent);
    if (text) {
      events.push(
        makeEvent({
          id: `${uuid}:text:0`,
          conversationId: ctx.conversationId,
          timestamp,
          role: 'user',
          content: { type: 'text', text },
          cost: null,
          sessionPath: ctx.sessionPath,
          sourceUuid: uuid,
        }),
      );
    }
    return events;
  }

  if (!Array.isArray(rawContent)) return events;

  let textIdx = 0;
  let resultIdx = 0;
  for (const block of rawContent) {
    if (!isPlainRecord(block)) continue;
    const blockType = block.type;

    if (blockType === 'text') {
      const text = typeof block.text === 'string' ? stripFrameworkTags(block.text) : '';
      if (!text) continue;
      events.push(
        makeEvent({
          id: `${uuid}:text:${textIdx}`,
          conversationId: ctx.conversationId,
          timestamp,
          role: 'user',
          content: { type: 'text', text },
          cost: null,
          sessionPath: ctx.sessionPath,
          sourceUuid: uuid,
        }),
      );
      textIdx++;
    } else if (blockType === 'tool_result') {
      const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
      const content: ToolResultContent = {
        type: 'tool_result',
        toolUseId,
        output: block.content ?? null,
        isError: block.is_error === true,
      };
      // Link back to the assistant's tool_call event. We don't know the real
      // event id at this point (it's `<assistant-uuid>:tool:<idx>` from a
      // possibly-unseen earlier record), so stamp a synthetic placeholder
      // that the second pass in `jsonlLinesToEvents` will resolve against
      // the toolUseId → eventId map. If no matching tool_use is found in the
      // file, pass 2 will downgrade this to `null`.
      const parentEventId = toolUseId ? `tool-use:${toolUseId}` : null;
      events.push(
        makeEvent({
          id: `${uuid}:result:${resultIdx}`,
          conversationId: ctx.conversationId,
          timestamp,
          role: 'tool',
          content,
          cost: null,
          sessionPath: ctx.sessionPath,
          sourceUuid: uuid,
          parentEventId,
        }),
      );
      resultIdx++;
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assemble an InteractionEvent with the scanner source tag and a small
 * metadata envelope carrying back-references. Keeps the event-building
 * concerns in one place so handlers stay readable.
 */
function makeEvent(args: {
  id: string;
  conversationId: string;
  timestamp: string;
  role: InteractionEvent['role'];
  content: InteractionContent;
  cost: InteractionCost | null;
  sessionPath: string;
  sourceUuid: string;
  parentEventId?: string | null;
}): InteractionEvent {
  return {
    id: args.id,
    conversationId: args.conversationId,
    parentEventId: args.parentEventId ?? null,
    timestamp: args.timestamp,
    source: 'scanner-jsonl',
    role: args.role,
    content: args.content,
    cost: args.cost,
    metadata: {
      sessionPath: args.sessionPath,
      sourceUuid: args.sourceUuid,
    },
  };
}

/**
 * Build an `InteractionCost` from the `usage` object on an assistant message.
 * Returns null when usage is missing or has no tokens — we don't want empty
 * cost records polluting analytics. Dollar cost comes from `pricing.ts`.
 */
function buildCostFromUsage(usage: unknown, model: string): InteractionCost | null {
  if (!isPlainRecord(usage)) return null;
  const input = numberOr(usage.input_tokens, 0);
  const output = numberOr(usage.output_tokens, 0);
  const cacheRead = numberOr(usage.cache_read_input_tokens, 0);
  const cacheCreation = numberOr(usage.cache_creation_input_tokens, 0);

  if (input === 0 && output === 0 && cacheRead === 0 && cacheCreation === 0) {
    return null;
  }

  const pricing = getPricing(model);
  const usd = computeCost(pricing, input, output, cacheRead, cacheCreation);

  return {
    usd,
    tokensIn: input,
    tokensOut: output,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    // Duration is not available from JSONL usage blocks — the CLI never
    // persists per-call wall time. Leave as 0 so downstream analytics still
    // has a number to sum over.
    durationMs: 0,
    model: model || undefined,
  };
}

function stripFrameworkTags(input: string): string {
  return input.replace(FRAMEWORK_TAG_REGEX, '').trim();
}

function isPlainRecord(v: unknown): v is Record {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
