import { useEffect, useRef, useMemo } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useTheme } from "@/hooks/use-theme";
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

interface TerminalInstanceProps {
  id: string;
  isVisible: boolean;
}

export function TerminalInstance({ id, isVisible }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isVisibleRef = useRef(isVisible);
  const { resolvedTheme } = useTheme();

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

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?id=${id}&cols=${terminal.cols}&rows=${terminal.rows}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          terminal.write(msg.data);
        } else if (msg.type === "exit") {
          terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      terminal.write("\r\n\x1b[90m[Disconnected]\x1b[0m\r\n");
    };

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    wsRef.current = ws;

    // Handle resize — uses ref so closure always reads current visibility
    const resizeObserver = new ResizeObserver(() => {
      if (isVisibleRef.current) {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
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

    return () => {
      resizeObserver.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
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
}
