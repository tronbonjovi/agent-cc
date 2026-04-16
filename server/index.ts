import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runFullScan } from "./scanner/index";
import { startWatcher } from "./scanner/watcher";
import { storage } from "./storage";
import { attachTerminalWebSocket } from "./terminal";
import { shutdownChatStreams } from "./routes/chat";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// CLI mode: handle --report and --audit without starting the server
const cliArgs = process.argv.slice(2);
if (cliArgs.includes("--report")) {
  const jsonMode = cliArgs.includes("--json");
  import("./cli/report").then(m => m.runReport(jsonMode)).catch(err => { console.error(err.message); process.exit(1); });
} else if (cliArgs.includes("--audit")) {
  const jsonMode = cliArgs.includes("--json");
  import("./cli/audit").then(m => m.runAudit(jsonMode)).catch(err => { console.error(err.message); process.exit(1); });
} else {
  // Server mode — start the web dashboard
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));

  // CORS — allow requests from the dashboard's own origin and configured proxies.
  const port = parseInt(process.env.PORT || "5100", 10);
  const host = process.env.HOST || "127.0.0.1";
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://${host}:${port}`,
  ]);
  // Add configured proxy origins (e.g. ALLOWED_ORIGINS=https://acc.devbox,https://other.host)
  const extraOrigins = process.env.ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const o of extraOrigins.split(",")) {
      const trimmed = o.trim();
      if (trimmed) allowedOrigins.add(trimmed);
    }
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
    }
    // Block API requests from unknown origins
    if (origin && !allowedOrigins.has(origin) && req.path.startsWith("/api")) {
      return res.status(403).json({ message: "Forbidden: origin not allowed" });
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (reqPath.startsWith("/api")) {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse && !reqPath.includes("content")) {
          const str = JSON.stringify(capturedJsonResponse);
          logLine += ` :: ${str.length > 200 ? str.slice(0, 200) + "..." : str}`;
        }
        log(logLine);
      }
    });

    next();
  });

  (async () => {
    await registerRoutes(httpServer, app);

    const terminalManager = attachTerminalWebSocket(httpServer, allowedOrigins);

    // Graceful shutdown. Open SSE subscribers (each with a 15s keepalive
    // interval) used to pin the event loop past `httpServer.close`, so
    // `systemctl stop agent-cc` sat in `deactivating (stop-sigterm)` for
    // 90s until TimeoutStopSec fired SIGKILL — adding a 90s penalty to
    // every deploy. Order: tear down chat SSE subscribers, terminal WS
    // connections, and close the HTTP server, then schedule a hard exit
    // as a safety net. The timer is `.unref()`ed so it doesn't itself
    // keep the loop alive during a clean drain.
    const shuttingDown = { value: false };
    const gracefulShutdown = (signal: string) => {
      if (shuttingDown.value) return;
      shuttingDown.value = true;
      log(`received ${signal}, shutting down`);
      shutdownChatStreams();
      terminalManager.shutdown();
      httpServer.close(() => process.exit(0));
      const safetyTimer = setTimeout(() => {
        log("graceful shutdown timeout — forcing exit");
        process.exit(0);
      }, 5000);
      safetyTimer.unref();
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    const port = parseInt(process.env.PORT || "5100", 10);
    const host = process.env.HOST || "127.0.0.1";
    httpServer.listen({ port, host }, () => {
      log(`${storage.getAppSettings().appName} serving on port ${port}`);
    });

    // Run initial scan in background — don't block the server from handling requests
    runFullScan()
      .then(() => {
        log("Initial scan complete");
        startWatcher();
      })
      .catch((err) => {
        console.error("Initial scan failed:", err);
        startWatcher(); // start watcher anyway so future changes are tracked
      });

  })();
}
