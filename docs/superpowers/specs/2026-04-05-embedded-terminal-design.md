# Embedded Terminal Panel

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Add a VS Code-style terminal panel to Agent CC

## Summary

Add an embedded terminal panel to Agent CC's layout, giving users a full shell environment directly inside the app. Built with xterm.js for rendering and node-pty for server-side process management, connected via WebSocket.

## Architecture

### End-to-End Flow

1. Agent CC server starts a WebSocket endpoint at `/ws/terminal`
2. User creates a terminal tab in the browser
3. Frontend connects to the WebSocket endpoint
4. Server spawns a shell process (user's default shell) via node-pty
5. Keystrokes flow: xterm.js → WebSocket → node-pty → shell process
6. Output flows back: shell process → node-pty → WebSocket → xterm.js
7. Each terminal tab is an independent shell process + WebSocket connection

### New Dependencies

- **xterm.js** — terminal emulator rendering in the browser
- **@xterm/addon-fit** — auto-sizes terminal to container dimensions
- **node-pty** — spawns pseudo-terminal processes (native C++ addon, requires build tools: python3, make, gcc)

## Panel UI

### Layout

- Bottom panel in the main content area (below page content, right of sidebar)
- Global component — lives in the layout, persists across page navigation
- Resizable via drag handle between content and panel
- Collapsible — toggle to hide/show the entire panel
- Open by default on app start

### Tab Bar

- Each terminal instance gets a tab
- Tabs are renameable (default: "Terminal 1", "Terminal 2", etc.)
- "+" button to create new terminal tabs
- Split button to divide the active view side-by-side
- Collapse/expand toggle for the whole panel

### Multiple Terminals

- Each tab is an independent shell session
- Side-by-side split view — two terminals visible simultaneously (max 2 panes per split, can add more via tabs)
- Split is horizontal (left/right within the panel)

### State Persistence

- Panel height, open tab count, split layout, collapsed state — saved to Agent CC's JSON database
- Persists across page navigation and browser reloads
- Terminal sessions themselves do NOT persist across server restarts (fresh shells on restart, same as VS Code)

## Server Side

### WebSocket Endpoint: `/ws/terminal`

- On connection: spawn a PTY process using node-pty with the user's default shell
- Working directory: user's home directory
- Pipe data bidirectionally between WebSocket and PTY
- Handle resize events when panel or split dimensions change
- Clean up PTY process on WebSocket disconnect
- Track all active terminals for cleanup on server shutdown

### Process Management

- One WebSocket connection + one PTY process per terminal tab
- Closing a tab kills the associated shell process
- Server shutdown kills all active PTY processes gracefully

## Explicitly Deferred

- No integration between terminal and task board (no "run task" button)
- No auto-naming terminals based on running process
- No persistent terminal sessions across server restarts
- No custom shell configuration in Agent CC settings
- No non-terminal panel tab types (output, logs, etc.) — terminals only for now

The tabbed panel structure supports adding all of the above later.
