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
// management. ChatPanel owns the surrounding scaffolding and mounts this by
// feeding it InteractionEvent[] from its (rewired) store.
//
// Markdown: assistant text is rendered through react-markdown with GFM
// (tables, strikethrough, task lists) + syntax-highlighted fenced code via
// rehype-highlight (backed by highlight.js). User text stays plain — users
// don't write markdown at us. Fenced code blocks get a copy-to-clipboard
// button; inline `code` stays inline with no button. See task004 of the
// chat-ux-cleanup milestone.
//
// The exhaustive switch in EventRow is TypeScript-enforced: if a sixth content
// variant is added to the InteractionContent union, tsc will fail this file
// until the switch handles it. The discriminant-sync test in
// tests/interaction-event-renderer.test.ts catches the same drift at runtime
// in case of a checking gap.

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
// Dark highlight.js theme — pairs well with the app's dark-first palette.
// Imported here (rather than in index.css) so the styles only ship with the
// chat bundle chunk that actually renders markdown. Mirrors how
// terminal-instance.tsx imports xterm's CSS next to its consumer.
import 'highlight.js/styles/github-dark.css';
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

  // Markdown only for assistant output. User messages and bare system text
  // pass through the plain-text path with whitespace preservation so their
  // raw input still reads correctly when they paste code or lists.
  const isAssistant = event.role === 'assistant';

  return (
    <div className={`flex flex-col max-w-[80%] ${alignment}`} data-event-type="text">
      <div
        className={`rounded-lg px-3 py-2 text-sm ${
          isAssistant ? 'markdown-body' : 'whitespace-pre-wrap'
        } ${bubbleClasses}`}
      >
        {isAssistant ? <AssistantMarkdown text={content.text} /> : content.text}
      </div>
    </div>
  );
}

// Hand-rolled prose styling — Tailwind's `prose` plugin isn't in the project,
// and this is a small enough surface that pulling it in for one component
// isn't worth the bundle cost. These classes are applied via the `components`
// map below so they take effect inside the bubble's existing padding.
const MD_CLASSES = {
  // Headings — scaled down from prose defaults since they live inside a
  // chat bubble. Tight top margin on the first heading, normal spacing after.
  h1: 'text-base font-semibold mt-3 mb-2 first:mt-0',
  h2: 'text-base font-semibold mt-3 mb-2 first:mt-0',
  h3: 'text-sm font-semibold mt-2 mb-1 first:mt-0',
  h4: 'text-sm font-semibold mt-2 mb-1 first:mt-0',
  // Paragraphs: tight leading, consistent bottom gap so stacked paragraphs
  // breathe but don't sprawl.
  p: 'my-2 first:mt-0 last:mb-0 leading-relaxed',
  // Lists: room for nested items without awkward indentation collapse.
  ul: 'list-disc pl-5 my-2 space-y-1',
  ol: 'list-decimal pl-5 my-2 space-y-1',
  li: 'leading-relaxed',
  // Inline code: explicit amber/neutral tokens rather than bg-primary/* (the
  // app's --primary is near-white, which would read as washed-out grey here).
  inlineCode: 'px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[0.85em]',
  // Tables (GFM): bordered, auto-width, with distinct header row.
  table: 'my-2 w-full border-collapse text-xs',
  th: 'border border-border px-2 py-1 text-left font-semibold bg-muted',
  td: 'border border-border px-2 py-1 align-top',
  // Blockquote: left-bar + muted text, matching the app's ThinkingBlock vibe.
  blockquote: 'my-2 border-l-2 border-border pl-3 text-muted-foreground italic',
  // Links: underlined foreground — no theme --primary dependency.
  a: 'underline underline-offset-2 text-foreground hover:opacity-80',
  // Horizontal rule: thin separator matching the app border token.
  hr: 'my-3 border-border',
  // Strong/em: inherit bubble foreground, just tweak weight/style.
  strong: 'font-semibold',
  em: 'italic',
};

function AssistantMarkdown({ text }: { text: string }) {
  // ReactMarkdown v10+ dropped the `inline` boolean prop on the `code`
  // component. The idiomatic replacement is to detect fenced code blocks by
  // the presence of a `language-*` class that the markdown parser attaches
  // to `code` elements inside `pre`. Inline backticks carry no className, so
  // the absence of `language-` is a reliable inline signal.
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: ({ children, ...props }) => (
          <h1 className={MD_CLASSES.h1} {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className={MD_CLASSES.h2} {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className={MD_CLASSES.h3} {...props}>
            {children}
          </h3>
        ),
        h4: ({ children, ...props }) => (
          <h4 className={MD_CLASSES.h4} {...props}>
            {children}
          </h4>
        ),
        p: ({ children, ...props }) => (
          <p className={MD_CLASSES.p} {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className={MD_CLASSES.ul} {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className={MD_CLASSES.ol} {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className={MD_CLASSES.li} {...props}>
            {children}
          </li>
        ),
        table: ({ children, ...props }) => (
          <table className={MD_CLASSES.table} {...props}>
            {children}
          </table>
        ),
        th: ({ children, ...props }) => (
          <th className={MD_CLASSES.th} {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className={MD_CLASSES.td} {...props}>
            {children}
          </td>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className={MD_CLASSES.blockquote} {...props}>
            {children}
          </blockquote>
        ),
        a: ({ children, ...props }) => (
          <a
            className={MD_CLASSES.a}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        ),
        hr: (props) => <hr className={MD_CLASSES.hr} {...props} />,
        strong: ({ children, ...props }) => (
          <strong className={MD_CLASSES.strong} {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }) => (
          <em className={MD_CLASSES.em} {...props}>
            {children}
          </em>
        ),
        // `pre` owns the fenced-code chrome (background, rounded corners, copy
        // button). The nested `code` element renders normally — rehype-highlight
        // decorates it with `hljs language-xxx` classes, and the theme CSS
        // imported at the top of this file paints the tokens.
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        // Inline `code` (backticks inside a sentence). Distinguished from
        // fenced blocks by the absence of a `language-*` class. Fenced
        // children are caught by the `pre` override above and never reach this
        // branch for rendering — but we still defensively check `inline`-ish
        // state by inspecting the className.
        code: ({ className, children, ...props }) => {
          const isFenced = typeof className === 'string' && /\blanguage-/.test(className);
          if (isFenced) {
            // Preserve className so rehype-highlight's tokenization survives.
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={MD_CLASSES.inlineCode} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// CodeBlock — wraps a fenced `<pre>` with a copy-to-clipboard affordance in
// the top-right corner. We render `children` (the `<code>` element react-
// markdown already built, with rehype-highlight's token spans) inside the
// `<pre>`; `extractCodeText` walks the same subtree to get raw text for the
// clipboard so what's copied matches what's rendered.
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const text = extractCodeText(children);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Brief feedback — 1.5s is long enough to notice, short enough not to
      // linger into the next interaction.
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on insecure contexts or when the user has
      // denied permission. Silent failure is better than a thrown exception
      // breaking the whole markdown render.
    }
  };

  return (
    <div className="relative my-2">
      <pre className="rounded-md bg-muted text-foreground p-3 pr-14 overflow-x-auto text-xs font-mono border border-border">
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-[0.7rem] rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// Walk a React node subtree and concatenate its text content. react-markdown
// gives us the rendered tree (code → span.hljs-* → string…) rather than the
// raw markdown, so we recurse rather than trying to read `children` as a
// string directly.
function extractCodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return extractCodeText(props?.children);
  }
  return '';
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
