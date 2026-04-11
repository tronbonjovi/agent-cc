# Messages Page Redesign Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Messages tab under Analytics — conversation viewer with filtering and usable message presentation

---

## Problem

The current Messages page is a split view with a session list on the left and a prompt templates panel on the right. Messages within sessions show raw content with broken "skill" labels and no meaningful way to distinguish human conversation from mechanical tool noise. In a typical Claude Code session, the actual dialogue between user and assistant is buried in hundreds of tool calls, tool results, thinking blocks, and system events. The page needs to make conversations readable and filterable.

## Core Principle

**Human conversation is the signal. Everything else is filterable context.** Default to showing what you and Claude actually said to each other. Tool calls, thinking, system events are available on demand but don't clutter the primary view.

---

## Design

### Layout: Session Selector → Conversation Viewer

Similar to the Sessions tab's list-detail pattern but optimized for reading conversations:

**Left sidebar** (narrow): Session list for picking which conversation to read. Compact rows — session title, message count, timestamp. Search and filter. Stays in sync with Sessions tab selection.

**Main area** (wide): Conversation viewer — the actual message thread, rendered as a readable chat-style view.

Prompt templates panel removed from this view (it already exists in Library or can move to Settings). Messages page should be purely about reading conversations.

### Message Types & Visual Treatment

Every message in a JSONL session is one of these types. Each gets distinct visual treatment:

| Type | Visual | Default visibility |
|------|--------|-------------------|
| **User text** | Left-aligned bubble, distinct background. Your words. | Always visible |
| **Assistant text** | Right-aligned or full-width response block. Claude's words. | Always visible |
| **Thinking** | Collapsed block with "Thinking..." label. Expandable to show reasoning. Muted/italic styling. | Hidden (expandable) |
| **Tool call** | Compact inline block: tool icon + name + key param (file path, command). Color-coded by tool type. | Hidden by default |
| **Tool result** | Nested under its tool call. Shows success/error + truncated output. Expandable. | Hidden by default |
| **System event** | Small inline annotation (permission change, skill load, etc.). Muted styling. | Hidden by default |
| **Skill invocation** | Labeled block showing which skill was loaded. | Hidden by default |
| **Sidechain** | Indented or visually grouped as a sub-conversation. Badge indicating subagent work. | Collapsed summary |

### Filter Bar

Persistent filter bar above the conversation viewer. Toggle pills for each message type:

| Filter | What it shows/hides |
|--------|-------------------|
| **Conversation** (default ON) | User + assistant text messages |
| **Thinking** | Extended thinking blocks |
| **Tools** | Tool calls + results |
| **System** | System events, skill loads, permission changes |
| **Sidechains** | Subagent/bridge conversations |
| **Errors only** | Show only messages with tool errors |

**Conversation mode** (default): Only user text + assistant text visible. Clean, readable dialogue. This is the "what did we actually discuss" view.

**Full mode**: Everything visible. The "what exactly happened" forensic view.

**Errors mode**: Filters to tool errors and surrounding context. The "what went wrong" debugging view.

### Conversation Rendering

#### User Messages
- Left-aligned with user-colored background
- Full text rendered (markdown supported)
- Timestamp on hover or in margin
- If the message triggered tool calls, a collapsed "Tools used" summary below showing count and types

#### Assistant Messages  
- Full-width response block with assistant-colored background
- Text content rendered with markdown
- Code blocks syntax-highlighted
- If response included tool calls, they appear as collapsed items between text segments (only when Tools filter is ON)
- Stop reason indicator if not `end_turn` (e.g., "max_tokens" warning badge)
- Model badge if model changed mid-session

#### Tool Calls (when visible)
- Compact blocks between messages
- Icon + tool name + primary parameter:
  - Read: file path
  - Edit: file path + "edited"
  - Write: file path + "created"
  - Bash: command (truncated)
  - Grep: pattern + path
  - Glob: pattern
  - Agent: description
- Duration and success/error badge
- Expandable to show full parameters and result content
- Error results highlighted red with output shown

#### Thinking Blocks (when visible)
- Collapsed by default: "Thinking... (N tokens)"
- Expandable to show full thinking text
- Muted styling — clearly secondary to conversation

#### Sidechain Conversations (when visible)
- Grouped and indented as a sub-thread
- Collapsed summary: "Subagent: [description] — N messages"
- Expandable to show the full sidechain conversation with same rendering rules

### Search

**In-conversation search**: Search within the currently-viewed session's messages.
- Highlights matches in rendered text
- Jump between matches (prev/next)
- Works across all message types (including collapsed ones — auto-expands matches)

**Cross-session search**: Search across all sessions (shared with Sessions tab deep search).
- Results show session + message context
- Click result → opens that session at that message

### Navigation Within Conversation

- Scroll position preserved when toggling filters
- "Jump to top" / "Jump to bottom" buttons for long sessions
- Message count indicator: "Message 47 of 234"
- Keyboard navigation: arrow keys for prev/next message, Enter to expand collapsed items

---

## Removed From This Page

- **Prompt templates panel** — relocate to Library or Settings. Doesn't belong in a conversation viewer.

---

## Data Sources

Messages come from the JSONL session file, parsed via the session parser:

| Content | Parser source |
|---------|--------------|
| User text | `userMessages[]` where `!isMeta`, `textPreview` or full content from JSONL |
| Assistant text | `assistantMessages[]`, `textPreview` or full content from JSONL |
| Thinking | `assistantMessages[].hasThinking` + thinking block content from JSONL |
| Tool calls | `assistantMessages[].toolCalls[]` |
| Tool results | `userMessages[].toolResults[]` matched by `toolUseId` |
| System events | `systemEvents.*`, `lifecycle[]` |
| Sidechains | `isSidechain` flag on messages, `counts.sidechainMessages` |
| Stop reasons | `assistantMessages[].stopReason` |

### Backend

- Message timeline endpoint returning ordered messages with type annotations (extend existing `/api/sessions/:id` or dedicated endpoint)
- Full message content read from JSONL (parser currently captures `textPreview` at 300 chars — full content needs raw JSONL read for detail view)
- Message search endpoint for in-conversation and cross-session search

### Frontend

- Session sidebar (compact list, reuses session list component)
- Conversation viewer component with message type rendering
- Filter pill bar component
- Message bubble components per type (user, assistant, tool, thinking, system, sidechain)
- In-conversation search with highlight and navigation
- Collapsible/expandable message groups

---

## Implementation Notes

- The parser captures `textPreview` (300 chars) for indexing. Full message rendering requires reading raw JSONL content. Consider a dedicated "message content" endpoint that reads specific messages by UUID from the JSONL file.
- Conversation tree (`conversationTree[]` with parent/child UUIDs) can be used to render threaded views if needed in the future, but flat chronological is the right default.
- Sidechain grouping uses `isSidechain` flag — group consecutive sidechain messages into collapsible sub-threads.
- Filter state persists in URL params alongside session ID.
