// tests/chat-panel.test.ts
//
// Tests for the ChatPanel component — originally authored in chat-skeleton
// task005 and rewritten in unified-capture task006 when the store layer split
// into React-Query-owned history + Zustand-owned live events.
//
// Follows the repo convention: client/ is excluded from vitest, so React
// components can't be rendered here. Instead we use:
//   1. Source-text guardrails on chat-panel.tsx to verify structure, imports,
//      SSE + fetch wiring, history-query integration, and generic placeholder
//      text.
//   2. Pure-logic tests that exercise the chat store directly (the same store
//      the component consumes) to prove the state transitions the component
//      relies on actually work end-to-end.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { InteractionEvent } from '../shared/types';

const ROOT = path.resolve(__dirname, '..');
const CHAT_PANEL_PATH = path.resolve(ROOT, 'client/src/components/chat/chat-panel.tsx');

// ---------------------------------------------------------------------------
// chat-panel.tsx — source-text guardrails
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — source guardrails', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('exports a ChatPanel component', () => {
    expect(src).toMatch(/export\s+function\s+ChatPanel/);
  });

  it('renders the chat-panel test id', () => {
    expect(src).toContain('data-testid="chat-panel"');
  });

  it('imports the chat store', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-store['"]/);
    expect(src).toContain('useChatStore');
  });

  it('imports useChatHistory and InteractionEventRenderer', () => {
    // Two-layer model: history query + live events store, rendered through
    // the unified-capture InteractionEventRenderer.
    expect(src).toMatch(/from ['"]@\/hooks\/use-chat-history['"]/);
    expect(src).toContain('useChatHistory');
    expect(src).toMatch(/from ['"]@\/components\/chat\/interaction-event-renderer['"]/);
    expect(src).toContain('InteractionEventRenderer');
  });

  it('imports useQueryClient from @tanstack/react-query', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\buseQueryClient\b[^}]*\}\s*from\s*['"]@tanstack\/react-query['"]/,
    );
  });

  it('imports the shadcn ScrollArea and Button UI primitives', () => {
    // task002 (chat-composer-controls) replaced the single-line <Input>
    // with a multi-line <textarea> so prompts can span multiple lines.
    // The Input import is therefore no longer required here; the textarea
    // check lives in tests/chat-composer-layout.test.ts.
    expect(src).toMatch(/from ['"]@\/components\/ui\/scroll-area['"]/);
    expect(src).toMatch(/from ['"]@\/components\/ui\/button['"]/);
  });

  it('opens an EventSource against the relative /api/chat/stream/:id path', () => {
    expect(src).toContain('new EventSource(');
    expect(src).toMatch(/\/api\/chat\/stream\//);
  });

  it('closes the EventSource on unmount (cleanup return)', () => {
    expect(src).toMatch(/\.close\(\)/);
  });

  it('posts to the relative /api/chat/prompt path via fetch', () => {
    expect(src).toContain('/api/chat/prompt');
    expect(src).toMatch(/fetch\(/);
    expect(src).toContain("method: 'POST'");
  });

  it('sends conversationId and text in the POST body', () => {
    expect(src).toMatch(/JSON\.stringify\(\s*\{\s*conversationId\s*,\s*text\s*\}/);
  });

  it('coalesces text chunks via coalesceAssistantText', () => {
    // New live-events path: text chunks merge into the tail assistant bubble.
    expect(src).toContain('coalesceAssistantText');
    expect(src).toMatch(/chunk\.type\s*===\s*['"]text['"]/);
    // Legacy API should be gone — if this reappears the wrong store is wired.
    expect(src).not.toContain('appendMessage(');
    expect(src).not.toContain('appendAssistantChunk');
  });

  it('appends an optimistic user echo on submit so Send feels responsive', () => {
    // The Claude CLI's first chunks arrive 5-10s after POST (session hooks
    // + init warm-up), so without an immediate echo the input clears into
    // dead air. handleSubmit must appendLiveEvent a user text event right
    // after setStreaming(true) and BEFORE the fetch.
    expect(src).toContain('appendLiveEvent');
    expect(src).toMatch(/useChatStore\(\(s\)\s*=>\s*s\.appendLiveEvent\)/);
    // The optimistic event must carry role "user" and the submitted text.
    expect(src).toMatch(/role:\s*['"]user['"]/);
    // Must be inside handleSubmit, before the fetch call.
    const submitBody = src.match(
      /const handleSubmit\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n  \};/,
    );
    expect(submitBody, 'handleSubmit body not found').not.toBeNull();
    const body = submitBody![0];
    const appendIdx = body.indexOf('appendLiveEvent(');
    const fetchIdx = body.indexOf("fetch('/api/chat/prompt'");
    expect(appendIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(fetchIdx);
  });

  it('un-renders the optimistic echo when POST fails or the network errors', () => {
    // If the fetch rejects or returns !ok, the optimistic user bubble must
    // come out of liveEvents — otherwise the user sees a stranded prompt
    // next to an error banner with no explanation.
    expect(src).toContain('removeLiveEvent');
    expect(src).toMatch(/useChatStore\(\(s\)\s*=>\s*s\.removeLiveEvent\)/);
    // Must be called in the !res.ok branch AND the catch branch of the
    // AI-prompt fetch. Scope the match to the try/catch that wraps the
    // `/api/chat/prompt` POST specifically — task003 added a *separate*
    // earlier try/catch for the slash-command dispatch path, which runs
    // before the optimistic echo is appended and therefore has nothing
    // to remove. Targeting the prompt fetch's enclosing try keeps this
    // guardrail honest as future milestones add more pre-send logic.
    const submitBody = src.match(
      /const handleSubmit\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n  \};/,
    );
    expect(submitBody, 'handleSubmit body not found').not.toBeNull();
    const body = submitBody![0];
    // Anchor on the prompt URL and inspect only the surrounding region:
    // from the URL forward we must see the `!res.ok` branch (and its
    // removeLiveEvent call) and then the enclosing `catch (err)` block
    // (with its own removeLiveEvent call). Scoping this way avoids
    // picking up the earlier slash-command dispatch try/catch.
    const promptIdx = body.indexOf('/api/chat/prompt');
    expect(promptIdx, 'prompt fetch call not found').toBeGreaterThan(-1);
    const promptTail = body.slice(promptIdx);
    const notOkBranch = promptTail.match(
      /if\s*\(\s*!res\.ok\s*\)\s*\{[\s\S]*?\n\s{6}\}/,
    );
    expect(notOkBranch, '!res.ok branch not found').not.toBeNull();
    expect(notOkBranch![0]).toContain('removeLiveEvent(conversationId, optimisticId)');
    const catchBranch = promptTail.match(
      /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?\n\s{4}\}/,
    );
    expect(catchBranch, 'AI-prompt catch branch not found').not.toBeNull();
    expect(catchBranch![0]).toContain('removeLiveEvent(conversationId, optimisticId)');
  });

  it('reads text chunks through the shared chat-chunk parser (no raw.text shortcut)', () => {
    // Regression guard: the pre-fix version read `chunk.raw.text` directly,
    // which is always undefined for the real `{ type: "assistant", message:
    // { content: [...] } }` wire shape, so the live bubble never rendered.
    // The client and server must both walk the envelope through the shared
    // `extractChunkText` helper so they cannot drift again.
    expect(src).toContain('extractChunkText');
    expect(src).toMatch(/from ['"][^'"]*shared\/chat-chunk['"]/);
    // Isolate the onmessage handler and ban the shortcut only in that body;
    // checking the whole file would trip on regex literals in surrounding
    // comments or docstrings.
    const onmessage = src.match(/es\.onmessage\s*=\s*\(ev\)\s*=>\s*\{[\s\S]*?\n\s{4}\};/);
    expect(onmessage, 'onmessage handler not found').not.toBeNull();
    expect(onmessage![0]).not.toMatch(/chunk\.raw\.text/);
  });

  it('logs onmessage parse errors loudly (no silent catch inside the SSE handler)', () => {
    // Bug D was masked for an entire milestone by a bare `catch {}` in the
    // onmessage handler. Any regression must surface in devtools rather than
    // vanish into a swallow block — checked only in the onmessage body so we
    // don't accidentally ban legitimate silent catches elsewhere (e.g. the
    // "non-JSON error body" fallback in handleSubmit).
    const onmessage = src.match(/es\.onmessage\s*=\s*\(ev\)\s*=>\s*\{[\s\S]*?\n\s{4}\};/);
    expect(onmessage, 'onmessage handler not found').not.toBeNull();
    const body = onmessage![0];
    expect(body).toMatch(/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]*?console\.error/);
    expect(body).not.toMatch(/catch\s*\{/);
  });

  it('releases the streaming gate before running the done-handler side effects', () => {
    // If `invalidateQueries` or `clearLive` ever throws on `done`, the Send
    // button must still re-enable. Order: setStreaming(false) first, then
    // the query/live-buffer bookkeeping.
    const doneBranch = src.match(
      /chunk\.type\s*===\s*['"]done['"][\s\S]*?\}\s*\n\s*(?:\/\/[^\n]*\n\s*)*\}/,
    );
    expect(doneBranch, 'done branch not found in onmessage handler').not.toBeNull();
    const body = doneBranch![0];
    const setStreamingIdx = body.indexOf('setStreaming(false)');
    const invalidateIdx = body.indexOf('invalidateQueries');
    // task007: clearLive now takes a conversationId argument.
    const clearLiveIdx = body.indexOf('clearLive(');
    expect(setStreamingIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(-1);
    expect(clearLiveIdx).toBeGreaterThan(-1);
    expect(setStreamingIdx).toBeLessThan(invalidateIdx);
    expect(setStreamingIdx).toBeLessThan(clearLiveIdx);
  });

  it('invalidates the chat-history query and clears live events on done', () => {
    // On SSE `done`, ChatPanel asks React Query to refetch the persisted
    // history and drops its in-flight buffer so the turn doesn't double-render.
    expect(src).toContain('invalidateQueries');
    expect(src).toMatch(/queryKey\s*:\s*\[\s*['"]chat-history['"]\s*,\s*conversationId\s*\]/);
    // task007: clearLive is now keyed by conversationId.
    expect(src).toMatch(/clearLive\(\s*conversationId\s*\)/);
    expect(src).toMatch(/chunk\.type\s*===\s*['"]done['"]/);
  });

  it('renders events through InteractionEventRenderer, merging history + live via mergeChatEvents', () => {
    // task006: the render path must run history + liveEvents through the
    // pure mergeChatEvents helper so workflow_event / hook_event chunks
    // that get both appended live AND pulled back via history refetch
    // don't render twice.
    expect(src).toMatch(/<InteractionEventRenderer\s+events=\{/);
    expect(src).toMatch(/from ['"]@\/lib\/chat-event-merge['"]/);
    expect(src).toContain('mergeChatEvents');
    expect(src).toMatch(/mergeChatEvents\(\s*historyEvents\s*,\s*liveEvents\s*\)/);
    // The raw concat must be gone — otherwise the dedup is bypassed.
    expect(src).not.toMatch(/\[\s*\.\.\.historyEvents\s*,\s*\.\.\.liveEvents\s*\]/);
  });

  it('workflow_event SSE branch appends live AND invalidates history', () => {
    // task006: rich live rendering. The branch must call appendLiveEvent
    // BEFORE the invalidateQueries call so the step renders instantly, and
    // must still invalidate so the persisted copy promotes to history.
    const branch = src.match(
      /chunk\.type\s*===\s*['"]workflow_event['"][\s\S]*?\}\s*else\s+if/,
    );
    expect(branch, 'workflow_event branch not found').not.toBeNull();
    const body = branch![0];
    const appendIdx = body.indexOf('appendLiveEvent(');
    const invalidateIdx = body.indexOf('invalidateQueries');
    expect(appendIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(invalidateIdx);
  });

  it('hook_event SSE branch appends live AND invalidates history', () => {
    // task006 parallel to workflow_event. The branch is the last else-if
    // in the chain, so anchor on the closing brace of the handler block
    // rather than the next `else if`.
    const branch = src.match(
      /chunk\.type\s*===\s*['"]hook_event['"][\s\S]*?\n\s{8}\}/,
    );
    expect(branch, 'hook_event branch not found').not.toBeNull();
    const body = branch![0];
    const appendIdx = body.indexOf('appendLiveEvent(');
    const invalidateIdx = body.indexOf('invalidateQueries');
    expect(appendIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(invalidateIdx);
  });

  it('drops the stale "intentionally ignored in the live stream" comment', () => {
    // task006 comment cleanup: once workflow_event and hook_event are
    // rendered live, the blanket "ignored in the live stream" note is
    // actively misleading. Lock the cleanup.
    expect(src).not.toContain('intentionally ignored in the live stream');
  });

  it('does not import useChatTabsStore directly (task007 narrowed regression lock)', () => {
    // task007 retarget: ChatPanel now sources the active conversation id
    // via the `useActiveConversationId` hook, NOT a direct subscribe to
    // `useChatTabsStore`. The hook file is allowed to wrap the tabs store;
    // the panel itself must stay on the hook seam so the rest of the panel
    // doesn't grow dependencies on tab-store internals.
    //
    // The original task006 lock banned any mention of useChatTabsStore here.
    // After task007 that would be a false negative — the hook IS the correct
    // consumer of the tabs store — so the lock is narrowed to:
    //   - no direct `from '@/stores/chat-tabs-store'` import
    //   - no direct `useChatTabsStore(...)` invocation
    expect(src).not.toMatch(/from ['"]@\/stores\/chat-tabs-store['"]/);
    expect(src).not.toMatch(/useChatTabsStore\s*\(/);
  });

  it('sources conversationId via useActiveConversationId hook (task007)', () => {
    // task007: the panel must consume the hook, not `useChatStore.conversationId`.
    expect(src).toMatch(/from ['"]@\/hooks\/use-active-conversation-id['"]/);
    expect(src).toContain('useActiveConversationId');
    expect(src).toMatch(/const\s+conversationId\s*=\s*useActiveConversationId\(\)/);
  });

  it('no longer reads conversationId from useChatStore (task007)', () => {
    // The hardcoded `'default'` field is gone from useChatStore; any
    // residual selector pointing at it would be dead code.
    expect(src).not.toMatch(/useChatStore\(\(s\)\s*=>\s*s\.conversationId\)/);
  });

  it('reads input from the drafts store, not local useState (task007)', () => {
    // Per-tab drafts live on useChatStore.drafts, keyed by conversationId.
    // Local `useState('')` for the input would discard drafts across tab
    // switches — task007 explicitly replaces that wiring.
    expect(src).toContain('drafts');
    expect(src).toMatch(/useChatStore\(\(s\)\s*=>\s*s\.drafts/);
    expect(src).toContain('setDraft');
    // The old local useState('') for input must be gone.
    expect(src).not.toMatch(/useState\(\s*['"]{2}\s*\)/);
  });

  it('wires up the first-mount auto-create flow via useChatTabsStoreAutoCreate (task007)', () => {
    // The actual auto-create effect lives in a dedicated hook so the panel
    // stays ignorant of the tabs store. Tests for the hook (open-on-empty +
    // strict-mode latch + "Main" tab title) live in
    // tests/use-chat-tabs-auto-create.test.ts — here we only pin that the
    // panel wires it up.
    expect(src).toMatch(
      /from ['"]@\/hooks\/use-chat-tabs-auto-create['"]/,
    );
    expect(src).toContain('useChatTabsStoreAutoCreate');
    expect(src).toMatch(/useChatTabsStoreAutoCreate\(\)/);
  });

  it('flips streaming off when the stream finishes or errors', () => {
    expect(src).toContain('setStreaming(false)');
    expect(src).toMatch(/onerror/);
  });

  it('checks res.ok and surfaces a visible error when POST /api/chat/prompt rejects', () => {
    // Regression: 503 (e.g. "Claude CLI not installed") is a *successful* fetch
    // — only network errors throw. Without an explicit res.ok branch the catch
    // never runs, setStreaming(false) never fires, and the input greys out
    // forever with no message shown. handleSubmit must check res.ok, parse the
    // server's error body, surface it via lastError state, and release the
    // streaming gate.
    expect(src).toMatch(/const\s+res\s*=\s*await\s+fetch\(/);
    expect(src).toMatch(/if\s*\(\s*!res\.ok\s*\)/);
    expect(src).toContain('setLastError');
    // The error body parser must handle the project's standard `{ error: "..." }`
    // shape from server route handlers.
    expect(src).toMatch(/body\.error/);
    // The error banner must render somewhere in the JSX so the user actually
    // sees the failure instead of a silently greyed-out input.
    expect(src).toContain('data-testid="chat-error-banner"');
    expect(src).toMatch(/role=["']alert["']/);
    // lastError must reset on each new submit so a successful retry clears the
    // previous error automatically.
    expect(src).toMatch(/setLastError\(null\)/);
  });

  it('reads isStreaming from the store and disables the input + button while streaming', () => {
    // Guard against rapid re-submits during an active SSE stream: the store
    // exposes `isStreaming`, ChatPanel must subscribe to it, early-return in
    // handleSubmit, and pass `disabled={isStreaming}` to both Input and Button.
    expect(src).toMatch(/useChatStore\(\(s\)\s*=>\s*s\.isStreaming\)/);
    expect(src).toMatch(/if\s*\(\s*isStreaming\s*\)\s*return/);
    // Both primitives need the disabled prop wired to the same flag.
    const disabledMatches = src.match(/disabled=\{isStreaming\}/g) ?? [];
    expect(disabledMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('has an Enter-key submit handler on the input', () => {
    expect(src).toMatch(/onKeyDown/);
    expect(src).toMatch(/e\.key\s*===\s*['"]Enter['"]/);
  });

  it('uses a generic placeholder (no user-specific project names)', () => {
    expect(src).toMatch(/placeholder=["']Message Claude/);
    expect(src).not.toMatch(/placeholder=["'][^"']*(Nicora|findash|pii-washer)/i);
  });

  it('uses no hardcoded absolute URLs (relative paths only, reverse-proxy safe)', () => {
    expect(src).not.toMatch(/https?:\/\/localhost/);
    expect(src).not.toMatch(/https?:\/\/127\.0\.0\.1/);
  });

  it('has no bounce/scale cartoonish animations', () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

// ---------------------------------------------------------------------------
// chat store behavior — the exact transitions ChatPanel relies on
// ---------------------------------------------------------------------------

let useChatStore: typeof import('../client/src/stores/chat-store').useChatStore;

const CONV = 'default';

beforeEach(async () => {
  const mod = await import('../client/src/stores/chat-store');
  useChatStore = mod.useChatStore;
  useChatStore.setState({
    liveEvents: {},
    drafts: {},
    isStreaming: false,
  });
});

function makeTextEvent(overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    id: 'e1',
    conversationId: 'default',
    parentEventId: null,
    timestamp: '2026-04-15T00:00:00.000Z',
    source: 'chat-ai',
    role: 'assistant',
    content: { type: 'text', text: 'hello' },
    cost: null,
    ...overrides,
  };
}

describe('ChatPanel store contract', () => {
  it('starts with an empty liveEvents map', () => {
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents).toEqual({});
  });

  it('appendLiveEvent seeds tool_call / thinking events into the live buffer', () => {
    const event = makeTextEvent({ id: 'tc1', role: 'assistant' });
    useChatStore.getState().appendLiveEvent(CONV, event);
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0].id).toBe('tc1');
  });

  it('setStreaming toggles isStreaming (submit → true, done/error → false)', () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('coalesceAssistantText accumulates streamed SSE text into one assistant bubble', () => {
    const { coalesceAssistantText } = useChatStore.getState();
    coalesceAssistantText(CONV, 'Hel');
    coalesceAssistantText(CONV, 'lo ');
    coalesceAssistantText(CONV, 'world');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0].role).toBe('assistant');
    expect(liveEvents[CONV][0].content).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('clearLive drops the conversation-scoped live buffer after stream done', () => {
    const store = useChatStore.getState();
    store.coalesceAssistantText(CONV, 'partial turn');
    expect(useChatStore.getState().liveEvents[CONV]).toHaveLength(1);
    useChatStore.getState().clearLive(CONV);
    expect(useChatStore.getState().liveEvents[CONV] ?? []).toEqual([]);
  });

  it('removeLiveEvent filters out the optimistic echo by id on POST failure', () => {
    const { appendLiveEvent, removeLiveEvent } = useChatStore.getState();
    appendLiveEvent(CONV, makeTextEvent({ id: 'opt-user', role: 'user' }));
    appendLiveEvent(CONV, makeTextEvent({ id: 'keep-me', role: 'assistant' }));
    expect(useChatStore.getState().liveEvents[CONV]).toHaveLength(2);
    removeLiveEvent(CONV, 'opt-user');
    const remaining = useChatStore.getState().liveEvents[CONV];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('keep-me');
  });

  it('removeLiveEvent is a no-op when the id is not in the buffer', () => {
    const { appendLiveEvent, removeLiveEvent } = useChatStore.getState();
    appendLiveEvent(CONV, makeTextEvent({ id: 'only-one' }));
    removeLiveEvent(CONV, 'not-there');
    expect(useChatStore.getState().liveEvents[CONV]).toHaveLength(1);
    expect(useChatStore.getState().liveEvents[CONV][0].id).toBe('only-one');
  });

  it('appendLiveEvent is idempotent on id collisions per-conversation (task007)', () => {
    // task006's id-collision dedup must survive the per-conversation refactor.
    const { appendLiveEvent } = useChatStore.getState();
    appendLiveEvent(CONV, makeTextEvent({ id: 'same' }));
    appendLiveEvent(
      CONV,
      makeTextEvent({ id: 'same', content: { type: 'text', text: 'different' } }),
    );
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0].content).toEqual({ type: 'text', text: 'hello' });
  });

  it('appendLiveEvent keeps distinct ids in insertion order', () => {
    const { appendLiveEvent } = useChatStore.getState();
    appendLiveEvent(CONV, makeTextEvent({ id: 'a' }));
    appendLiveEvent(CONV, makeTextEvent({ id: 'b' }));
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV].map((e) => e.id)).toEqual(['a', 'b']);
  });

  // ---- task007: per-conversation scoping -----------------------------------

  it('appendLiveEvent keeps conversations isolated (tabA does not leak into tabB)', () => {
    const { appendLiveEvent } = useChatStore.getState();
    appendLiveEvent('tabA', makeTextEvent({ id: 'a-1' }));
    appendLiveEvent('tabB', makeTextEvent({ id: 'b-1' }));
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents['tabA'].map((e) => e.id)).toEqual(['a-1']);
    expect(liveEvents['tabB'].map((e) => e.id)).toEqual(['b-1']);
  });

  it('clearLive(tabA) does not touch tabB', () => {
    const { appendLiveEvent, clearLive } = useChatStore.getState();
    appendLiveEvent('tabA', makeTextEvent({ id: 'a-1' }));
    appendLiveEvent('tabB', makeTextEvent({ id: 'b-1' }));
    clearLive('tabA');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents['tabA'] ?? []).toEqual([]);
    expect(liveEvents['tabB'].map((e) => e.id)).toEqual(['b-1']);
  });

  it('id-collision dedup is per-conversation (same id in different tabs both land)', () => {
    const { appendLiveEvent } = useChatStore.getState();
    appendLiveEvent('tabA', makeTextEvent({ id: 'shared' }));
    appendLiveEvent('tabB', makeTextEvent({ id: 'shared' }));
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents['tabA']).toHaveLength(1);
    expect(liveEvents['tabB']).toHaveLength(1);
  });

  it('coalesceAssistantText is conversation-scoped', () => {
    const { coalesceAssistantText } = useChatStore.getState();
    coalesceAssistantText('tabA', 'Hello ');
    coalesceAssistantText('tabB', 'World');
    coalesceAssistantText('tabA', 'there');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents['tabA']).toHaveLength(1);
    expect(liveEvents['tabA'][0].content).toEqual({ type: 'text', text: 'Hello there' });
    expect(liveEvents['tabB']).toHaveLength(1);
    expect(liveEvents['tabB'][0].content).toEqual({ type: 'text', text: 'World' });
  });
});

// ---------------------------------------------------------------------------
// task007: drafts map on the chat store
// ---------------------------------------------------------------------------

describe('chat store drafts (task007)', () => {
  it('drafts default to an empty map', () => {
    const { drafts } = useChatStore.getState();
    expect(drafts).toEqual({});
  });

  it('setDraft stores the draft text under the tab id', () => {
    useChatStore.getState().setDraft('tabA', 'hello draft');
    expect(useChatStore.getState().drafts['tabA']).toBe('hello draft');
  });

  it('getDraft returns the stored draft or empty string', () => {
    const { setDraft, getDraft } = useChatStore.getState();
    setDraft('tabA', 'hi');
    expect(getDraft('tabA')).toBe('hi');
    expect(getDraft('tabB')).toBe('');
  });

  it('setDraft is isolated per conversation', () => {
    const { setDraft } = useChatStore.getState();
    setDraft('tabA', 'A text');
    setDraft('tabB', 'B text');
    const { drafts } = useChatStore.getState();
    expect(drafts['tabA']).toBe('A text');
    expect(drafts['tabB']).toBe('B text');
  });

  it('clearing a draft sets it to empty string (does not mutate other tabs)', () => {
    const { setDraft } = useChatStore.getState();
    setDraft('tabA', 'keep');
    setDraft('tabB', 'drop');
    setDraft('tabB', '');
    const { drafts } = useChatStore.getState();
    expect(drafts['tabA']).toBe('keep');
    expect(drafts['tabB']).toBe('');
  });
});
