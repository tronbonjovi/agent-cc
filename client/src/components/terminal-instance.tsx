import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";

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

  // Keep ref in sync so ResizeObserver closure always has current value
  isVisibleRef.current = isVisible;

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      theme: {
        background: "#111111",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        selectionBackground: "#3a3a3a",
        black: "#1a1a1a",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#e5c07b",
        blue: "#82aaff",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#e0e0e0",
      },
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
