// client/src/components/chat/interaction-event-renderer.tsx
//
// InteractionEventRenderer — the per-event rendering layer for the new chat
// surface (unified-capture milestone, task007).
//
// This is a NEW renderer for a NEW surface. It is deliberately not an
// extraction or port of the legacy Messages tab pipeline (ConversationViewer +
// the bubble files under client/src/components/analytics/messages/bubbles/).
// Those operate on a different shape (TimelineMessage) that carries fields the
// InteractionContent union does not model. Forcing a port would lose
// information; instead this component is designed fresh against the
// InteractionEvent / InteractionContent types from shared/types.
//
// Scope: pure data → DOM. No fetching, no filtering, no search, no scroll
// management, no markdown. ChatPanel owns the surrounding scaffolding and will
// mount this in task006 by feeding it InteractionEvent[] from its (rewired)
// store. Until then this component is freestanding.
//
// The exhaustive switch in EventRow is TypeScript-enforced: if a sixth content
// variant is added to the InteractionContent union, tsc will fail this file
// until the switch handles it. The discriminant-sync test in
// tests/interaction-event-renderer.test.ts catches the same drift at runtime
// in case of a checking gap.

import type {
  InteractionEvent,
  TextContent,
  ToolCallContent,
  ToolResultContent,
  ThinkingContent,
  SystemContent,
} from '../../../../shared/types';

interface Props {
  events: InteractionEvent[];
}

export function InteractionEventRenderer({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="interaction-event-renderer-empty">
        No messages yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="interaction-event-renderer">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}

function EventRow({ event }: { event: InteractionEvent }) {
  switch (event.content.type) {
    case 'text':
      return <TextBubble event={event} content={event.content} />;
    case 'tool_call':
      return <ToolCallPanel event={event} content={event.content} />;
    case 'tool_result':
      return <ToolResultPanel event={event} content={event.content} />;
    case 'thinking':
      return <ThinkingBlock event={event} content={event.content} />;
    case 'system':
      return <SystemNote event={event} content={event.content} />;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
//
// Each sub-component is intentionally small and presentational. No internal
// state, no effects. Container layout (gap, max width) is owned by the parent
// list — these only style their own bubble/panel.

function TextBubble({ event, content }: { event: InteractionEvent; content: TextContent }) {
  // Role-aware alignment: user → right, assistant → left, anything else → center.
  // Done with self-* on a flex child so the parent's flex column lays them out
  // correctly without us touching the parent's layout.
  const alignment =
    event.role === 'user'
      ? 'self-end items-end'
      : event.role === 'assistant'
        ? 'self-start items-start'
        : 'self-center items-center';

  // Visual weight follows the role too. User gets primary-on-primary so it
  // reads as "their" bubble, assistant gets the muted card surface, anything
  // else (system/tool spilling into a text bubble) is neutral muted.
  const bubbleClasses =
    event.role === 'user'
      ? 'bg-primary text-primary-foreground'
      : event.role === 'assistant'
        ? 'bg-card text-card-foreground border border-border'
        : 'bg-muted text-muted-foreground';

  return (
    <div className={`flex flex-col max-w-[80%] ${alignment}`} data-event-type="text">
      <div className={`rounded-lg px-3 py-2 whitespace-pre-wrap text-sm ${bubbleClasses}`}>
        {content.text}
      </div>
    </div>
  );
}

function ToolCallPanel({ event, content }: { event: InteractionEvent; content: ToolCallContent }) {
  // Diagnostic panel — full width, distinct from chat bubbles. Tool name is
  // the headline; serialized input sits underneath in a <pre>.
  return (
    <div
      className="rounded-md border border-border bg-muted/40 p-3 text-xs"
      data-event-type="tool_call"
      data-event-id={event.id}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-semibold text-foreground">{content.toolName}</span>
        <span className="text-muted-foreground uppercase tracking-wide">tool call</span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-muted-foreground font-mono text-xs">
        {safeStringify(content.input)}
      </pre>
    </div>
  );
}

function ToolResultPanel({
  event,
  content,
}: {
  event: InteractionEvent;
  content: ToolResultContent;
}) {
  // Same shell as ToolCallPanel, but error state flips the border to
  // destructive so failed tool calls stand out at a glance.
  const borderClass = content.isError
    ? 'border-destructive bg-destructive/10'
    : 'border-border bg-muted/40';

  return (
    <div
      className={`rounded-md border p-3 text-xs ${borderClass}`}
      data-event-type="tool_result"
      data-event-id={event.id}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-semibold text-foreground">tool result</span>
        {content.isError ? (
          <span className="text-destructive uppercase tracking-wide">error</span>
        ) : (
          <span className="text-muted-foreground uppercase tracking-wide">ok</span>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words text-muted-foreground font-mono text-xs">
        {typeof content.output === 'string' ? content.output : safeStringify(content.output)}
      </pre>
    </div>
  );
}

function ThinkingBlock({ event, content }: { event: InteractionEvent; content: ThinkingContent }) {
  // Low visual weight — italic + dim + slight indent. Signals "model is
  // reasoning out loud" without competing with real assistant output.
  return (
    <div
      className="ml-4 border-l-2 border-border pl-3 text-sm italic text-muted-foreground whitespace-pre-wrap"
      data-event-type="thinking"
      data-event-id={event.id}
    >
      {content.text}
    </div>
  );
}

function SystemNote({ event, content }: { event: InteractionEvent; content: SystemContent }) {
  // Lowest-weight row — centered muted note with a small subtype tag prefix
  // so workflow_step / hook_fire / info events are distinguishable at a
  // glance. content.data is intentionally NOT rendered here (it's `unknown`
  // and varies by subtype — a later milestone owns rendering it).
  return (
    <div
      className="self-center text-xs text-muted-foreground"
      data-event-type="system"
      data-event-id={event.id}
    >
      <span className="font-mono uppercase tracking-wide mr-2">[{content.subtype}]</span>
      <span>{content.text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// JSON.stringify with a circular-reference guard. Tool inputs/outputs come
// from external sources and may contain cycles; we don't want a single bad
// payload to throw and break the whole list render.
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
