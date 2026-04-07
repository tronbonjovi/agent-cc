import { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useTheme } from "@/hooks/use-theme";
import type { TerminalConnectionState } from "@shared/types";
import "xterm/css/xterm.css";

/** Convert HSL string "220 14% 10%" to hex "#xxxxxx" */
function hslToHex(hsl: string): string {
  const [hDeg, sPct, lPct] = hsl.trim().split(/\s+/).map(parseFloat);
  const h = hDeg / 360;
  const s = sPct / 100;
  const l = lPct / 100;

  if (s === 0) {
    const v = Math.round(l * 255).toString(16).padStart(2, "0");
    return `#${v}${v}${v}`;
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, "0");
  return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

const DARK_ANSI = {
  black: "#1a1a1a",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#82aaff",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#e0e0e0",
};

const LIGHT_ANSI = {
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#fafafa",
};

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_TIMEOUT_MS = 300000; // 5 minutes — match server grace period

export interface TerminalInstanceHandle {
  /** Send explicit kill to server — use when user intentionally closes a tab */
  killSession(): void;
}

interface TerminalInstanceProps {
  id: string;
  isVisible: boolean;
  onConnectionStateChange?: (id: string, state: TerminalConnectionState) => void;
}

export const TerminalInstance = forwardRef<TerminalInstanceHandle, TerminalInstanceProps>(function TerminalInstance({ id, isVisible, onConnectionStateChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isVisibleRef = useRef(isVisible);
  const connectionStateRef = useRef<TerminalConnectionState>("initializing");
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gaveUpRef = useRef(false);
  const firstConnectRef = useRef(true);
  const { resolvedTheme } = useTheme();

  function setConnectionState(state: TerminalConnectionState) {
    connectionStateRef.current = state;
    onConnectionStateChange?.(id, state);
  }

  useImperativeHandle(ref, () => ({
    killSession() {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "kill" }));
      }
    },
  }));

  // Keep ref in sync so ResizeObserver closure always has current value
  isVisibleRef.current = isVisible;

  // Build xterm theme from app theme
  const xtermTheme = useMemo(() => {
    const bg = hslToHex(resolvedTheme.colors.background);
    const fg = hslToHex(resolvedTheme.colors.foreground);
    const sel = hslToHex(resolvedTheme.colors.accent);
    const ansi = resolvedTheme.variant === "dark" ? DARK_ANSI : LIGHT_ANSI;
    return { background: bg, foreground: fg, cursor: fg, selectionBackground: sel, ...ansi };
  }, [resolvedTheme]);

  // Keep a ref so the creation effect always gets the latest theme
  const xtermThemeRef = useRef(xtermTheme);
  xtermThemeRef.current = xtermTheme;

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      theme: xtermThemeRef.current,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Reset state for new terminal id
    connectionStateRef.current = "initializing";
    reconnectAttemptRef.current = 0;
    gaveUpRef.current = false;
    firstConnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    let disconnectStartTime: number | null = null;

    function connect() {
      setConnectionState("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?id=${id}&cols=${terminal.cols}&rows=${terminal.rows}&mode=attach`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        disconnectStartTime = null; // Reset timeout window on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "created":
              setConnectionState("connected");
              firstConnectRef.current = false;
              break;
            case "attached":
              // Clear terminal before replay to avoid duplicating history
              terminal.clear();
              terminal.reset();
              setConnectionState("connected");
              if (!firstConnectRef.current) {
                terminal.write("\x1b[32m[Reconnected]\x1b[0m\r\n");
              }
              firstConnectRef.current = false;
              break;
            case "buffer-replay":
              terminal.write(msg.data);
              break;
            case "buffer-replay-done":
              // no-op — live output follows naturally
              break;
            case "expired":
              setConnectionState("expired");
              terminal.write("\r\n\x1b[90m[Session expired \u2014 press any key to start new terminal]\x1b[0m\r\n");
              break;
            case "output":
              terminal.write(msg.data);
              break;
            case "exit":
              terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (gaveUpRef.current) return;

        // Don't reconnect from expired state
        if (connectionStateRef.current === "expired") return;

        setConnectionState("disconnected");
        terminal.write("\r\n\x1b[33m[Disconnected \u2014 reconnecting...]\x1b[0m\r\n");

        // Track when disconnection started for total timeout
        if (disconnectStartTime === null) {
          disconnectStartTime = Date.now();
        }

        // Check if we've exceeded the total reconnect timeout
        if (Date.now() - disconnectStartTime >= RECONNECT_TIMEOUT_MS) {
          gaveUpRef.current = true;
          setConnectionState("expired");
          terminal.write("\r\n\x1b[90m[Session expired \u2014 press any key to start new terminal]\x1b[0m\r\n");
          return;
        }

        const backoff = Math.min(
          RECONNECT_INITIAL_MS * Math.pow(2, reconnectAttemptRef.current),
          RECONNECT_MAX_MS
        );
        reconnectAttemptRef.current += 1;

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, backoff);
      };

      ws.onerror = () => {
        // Let the close handler deal with it
      };

      wsRef.current = ws;
    }

    terminal.onData((data) => {
      if (connectionStateRef.current === "expired") {
        gaveUpRef.current = false;
        reconnectAttemptRef.current = 0;
        firstConnectRef.current = true;
        connect();
        return;
      }

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize — uses ref so closure always reads current visibility
    const resizeObserver = new ResizeObserver(() => {
      if (isVisibleRef.current) {
        fitAddon.fit();
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Start initial connection
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [id]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = xtermTheme;
    }
  }, [xtermTheme]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 0);
    }
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isVisible ? "block" : "none" }}
    />
  );
});
