# Chat Evolution — From Skeleton to Real AI Chat

**Date:** 2026-04-16
**Status:** Draft
**Scope:** UX cleanup, composer controls, multi-provider system

## Overview

The chat feature works but it's a bare pipe to Claude Code CLI. No model choice, no controls, no markdown rendering, broken conversation continuity, no streaming. This spec covers three layers of improvement, built in order:

1. **UX Cleanup** — fix what's broken, clean up the interface
2. **Composer Controls** — model picker, settings popover, per-conversation config
3. **Provider System** — generic multi-provider backend supporting Claude Code + any OpenAI-compatible API

## Layer 1: UX Cleanup

### Fix Conversation Continuity

Current bug: each message spawns a fresh CLI session and wipes previous messages from view.

- Messages persist in the tab across turns.
- Conversation history passes to the CLI on each prompt so Claude has context.
- Tab state survives page reloads (already partially working via chat-tabs-store persistence).

### Fix Streaming

Current behavior: send button greys out, dead air, then full response appears at once.

- Tokens render as they arrive using the existing SSE infrastructure.
- Thinking indicator (pulsing dot or similar) shows during the gap between sending and the first token arriving.
- The SSE stream and `runClaudeStreaming` already emit chunked events — the frontend needs to render them incrementally instead of waiting for completion.

### Markdown Rendering

Current: assistant text renders as plain text. Code blocks, tables, lists are all raw.

- Full markdown in assistant responses: headings, bold/italic, lists, fenced code blocks with syntax highlighting + copy button, tables, blockquotes, links.
- Add `react-markdown` + syntax highlighting library (e.g., `rehype-highlight` or `react-syntax-highlighter`).
- User messages remain plain text (no markdown parsing needed).

### Kill the Conversation Sidebar

Current: a left sidebar inside the chat panel showing "Open tabs" + "Recent sessions," eating ~25% of panel width with mostly duplicated information.

- Remove the conversation sidebar entirely (`conversation-sidebar.tsx`).
- Add a history icon to the collapse bar. Click opens a popover listing recent conversations.
- Click a conversation in the popover to open it as a new tab.

### Consistent Collapse Bars

Current: chat panel conditionally renders (gone from DOM when collapsed). Terminal has a 32px toolbar strip.

- Chat panel gets a thin vertical bar matching the terminal's horizontal bar pattern.
- Chevron on the bar: `<` to collapse, `>` to expand.
- When expanded, the bar doubles as a mini toolbar — history icon lives here, room for future controls.
- No artificial min/max constraints on panel width. Fully fluid, drag to whatever size.
- Both collapse bars (terminal horizontal, chat vertical) should feel like the same UI pattern.

### Remove AI vs Deterministic Card

- Delete `client/src/components/dashboard/ai-vs-deterministic-card.tsx` and its test file.
- Remove the card mount from `dashboard.tsx`.
- If cost-savings analysis belongs anywhere, it's in the analytics/costs section — not a dashboard card.

### Thinking Indicator

- While waiting for the first token after sending a message, show a visual indicator (pulsing dot, typing animation, or similar).
- Disappears once streaming begins.

## Layer 2: Composer Controls

Modeled after Claude.ai's composer area. All controls live in/around the input area at the bottom of the chat.

### Model Dropdown

- Shows the current model name plainly (e.g., "Claude Opus 4.6", "llama3.2:8b"). Real names, no abstraction.
- Click to open a dropdown listing available models for the active provider.
- For Claude Code: model passed via `--model` flag to the CLI.
- For OpenAI-compatible providers: model ID sent in the API request.
- Model list populated dynamically from the provider's discovery endpoint.

### + Button (Settings Popover)

Opens a popover with per-conversation settings:

- **Provider selector** — which backend to use (Claude Code, Ollama, custom providers).
- **Project selector** — pick which project context to attach, from scanner's discovered projects. Spawns CLI with `cwd: projectDir`. A "General" option for conversations not tied to a codebase.
- **Effort level** — maps to CLI `--effort` flag for Claude Code. Hidden for providers that don't support it.
- **Extended thinking toggle** — on/off, for models that support it.
- **Web search toggle** — for models/providers that support it.
- **System prompt** — freeform text field for custom instructions per conversation.
- **File attachments** — attach files to provide as context.

Controls show/hide based on what the active provider + model supports. The popover adapts — no showing controls that do nothing.

### Mic Icon

- Placeholder position for future voice input.
- Disabled/hidden until voice is implemented.

### Composer Layout

- Input field with model dropdown on one side, + button and mic on the other.
- Same spatial arrangement as Claude.ai's composer.

### Per-Conversation vs Global Settings

- Global defaults set in the settings page (preferred model, default effort, etc.).
- Per-conversation overrides in the + popover. Changing settings in the popover affects only the active tab.
- New conversations inherit global defaults.

## Layer 3: Provider System

### Provider Model

A provider is a configuration entry stored in `agent-cc.json`:

```typescript
interface ProviderConfig {
  id: string;            // unique slug: "claude-code", "ollama", "openai", etc.
  name: string;          // display name: "Claude Code", "Ollama (local)", "OpenAI"
  type: "claude-cli" | "openai-compatible";
  baseUrl?: string;      // for openai-compatible: "http://localhost:11434", "https://api.openai.com"
  auth: {
    type: "none" | "api-key" | "oauth";
    apiKey?: string;     // for api-key auth, stored server-side, masked in API responses
    oauthConfig?: {      // for oauth auth (subscription-based access)
      authUrl: string;
      tokenUrl: string;
      clientId: string;
      scopes?: string[];
    };
  };
  capabilities: {
    thinking?: boolean;
    effort?: boolean;
    webSearch?: boolean;
    temperature?: boolean;
    systemPrompt?: boolean;
    fileAttachments?: boolean;
    projectContext?: boolean;
  };
}
```

Auth types:
- **none** — no authentication (Ollama, local servers).
- **api-key** — per-token billing via API key (OpenAI API, Groq, Together, etc.).
- **oauth** — subscription-based access (OpenAI via subscription, similar to how Claude Code CLI and Codex CLI use your existing subscription). Settings page handles the OAuth flow — user clicks "Sign in," completes the browser flow, token is stored server-side.

### Built-in Providers

- **Claude Code** — type `claude-cli`. Always present (if CLI installed). Spawns `claude -p` subprocess. Supports: effort, thinking, web search, project context, file attachments.
- **Ollama** — type `openai-compatible`. Default entry with `baseUrl: "http://localhost:11434"`. No API key. Configurable URL via `OLLAMA_URL` env var or settings page for LAN setups.

### Adding Custom Providers

Any OpenAI-compatible API can be added through the settings page:

- Provide: name, base URL, and auth method (none, API key, or OAuth sign-in).
- Works with: OpenAI, Groq, Together, Mistral, OpenRouter, any llama.cpp/vLLM server, etc.
- Provider appears in the + popover's provider selector immediately.

### Model Discovery

- Ollama: `GET {baseUrl}/api/tags` → list of installed models.
- OpenAI-compatible: `GET {baseUrl}/v1/models` → list of available models.
- Claude Code: known model set (Opus, Sonnet, Haiku) or read from CLI.
- Model list refreshes on demand when the model dropdown opens or settings change.

### OpenAI-Compatible Adapter

- Generic adapter that talks to any `/v1/chat/completions` endpoint.
- Streaming via SSE (`stream: true`), same format across all compatible providers.
- Translates the adapter response format into the same `InteractionEvent` stream the frontend already consumes.
- Server-side only — API keys never leave the backend.

### Capability Detection

Each provider defines which composer controls it supports via the `capabilities` object. The + popover reads the active provider's capabilities and shows/hides controls accordingly.

Provider-specific capability defaults:

| Capability | Claude Code | Ollama | OpenAI | Generic |
|------------|------------|--------|--------|---------|
| thinking | yes | no | model-dependent | no |
| effort | yes | no | no | no |
| webSearch | yes | no | no | no |
| temperature | no | yes | yes | yes |
| systemPrompt | yes | yes | yes | yes |
| fileAttachments | yes | no | model-dependent | no |
| projectContext | yes | no | no | no |

### Graceful Degradation

- Provider unavailable (Ollama not running, bad API key): model dropdown shows "unavailable" with a message. No crash, no broken state.
- Claude CLI not installed: Claude Code provider disabled with clear message.
- Unknown provider errors: caught and displayed in the chat as a system message.

### Credential Security

- API keys and OAuth tokens stored in `agent-cc.json`, server-side only.
- API responses mask keys to last 4 characters (e.g., `sk-...7xQ2`). OAuth tokens never exposed to frontend at all.
- Settings page shows masked keys. To update, replace the whole key — no "reveal" button. OAuth shows "Connected" / "Not connected" with a sign-in/disconnect button.
- All credentials used only server-side when making provider API calls. Never sent to the frontend.
- OAuth refresh tokens handled server-side — auto-refresh before expiry, re-prompt sign-in if refresh fails.
- Single-user devbox context: if someone has file access to the data directory, they already own the box.

## Out of Scope

- **Ollama conversation persistence** — Ollama conversations are ephemeral for now. No JSONL, no history. Future project if wanted.
- **Voice input** — mic icon placeholder only, implementation deferred.
- **Side-by-side model comparison** — cool feature (Open WebUI, big-AGI) but not needed now.
- **Knowledge bases / RAG** — named document collections for provider context. Future.
- **Cost tracking for non-Claude providers** — only Claude Code sessions feed into the cost indexer.
- **Conversation search, pin/favorite, export** — nice-to-haves, deferred.

## Build Order

1. **Layer 1 first** — fix the broken stuff (continuity, streaming), add markdown, clean up the UI (sidebar removal, collapse bars, card deletion).
2. **Layer 2 second** — add composer controls to the fixed chat. Model dropdown, + popover with settings, capability-aware show/hide.
3. **Layer 3 third** — wire up the provider system. Ollama as first non-Claude provider, then generic OpenAI-compatible support for any API.

Each layer builds on the previous one. Layer 1 is usable alone. Layer 2 requires Layer 1. Layer 3 requires Layer 2.

## Key Files (Existing)

- `client/src/components/chat/chat-panel.tsx` — main chat surface
- `client/src/components/chat/chat-tab-bar.tsx` — tab management
- `client/src/components/chat/conversation-sidebar.tsx` — **to be removed**
- `client/src/components/chat/interaction-event-renderer.tsx` — message rendering
- `client/src/stores/chat-store.ts` — chat state (Zustand)
- `client/src/stores/chat-tabs-store.ts` — tab state (Zustand)
- `client/src/stores/layout-store.ts` — panel collapse/width state
- `client/src/components/layout.tsx` — main 3-column layout shell
- `server/routes/chat.ts` — SSE + prompt dispatch
- `server/scanner/claude-runner.ts` — CLI subprocess spawning
- `client/src/components/dashboard/ai-vs-deterministic-card.tsx` — **to be deleted**
