import type { Express } from "express";
import type { Server } from "http";
import entitiesRouter from "./entities";
import projectsRouter from "./projects";
import markdownRouter from "./markdown";
import graphRouter from "./graph";
import discoveryRouter from "./discover-github";
import configRouter from "./config";
import scannerRouter from "./scanner";
import sessionsRouter from "./sessions";
import agentsRouter from "./agents";
import liveRouter from "./live";
import updateRouter from "./update";
import settingsRouter from "./settings";
import customGraphRouter from "./custom-graph";
import aiSuggestRouter from "./ai-suggest";
import statsRouter from "./stats";
import exportRouter from "./export";
import costAnalyticsRouter from "./cost-analytics";
import chartAnalyticsRouter from "./chart-analytics";
import apisRouter from "./apis";
import discoverRouter from "./discover";
import libraryRouter from "./library";
import chatRouter from "./chat";
import chatTabsRouter from "./chat-tabs";
import chatWorkflowsRouter from "./chat-workflows";

import terminalRouter from "./terminal";
import { createBoardRouter } from "./board";
import { boardEvents } from "../board/events";
import { spawn } from "child_process";
import { platform } from "os";
import path from "path";
import os from "os";
import { getRecentChanges } from "../scanner/watcher";

function openPath(p: string): void {
  // Validate path is under home directory to prevent opening arbitrary locations
  const resolved = path.resolve(p);
  const home = os.homedir();
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    console.warn(`[openPath] Blocked path outside home: ${p}`);
    return;
  }
  const plat = platform();
  let child;
  if (plat === "win32") {
    child = spawn("explorer", [resolved.replace(/\//g, "\\")], { detached: true, stdio: "ignore" });
  } else if (plat === "darwin") {
    child = spawn("open", [resolved], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [resolved], { detached: true, stdio: "ignore" });
  }
  child.on("error", () => {}); // prevent unhandled error event crash
  child.unref();
}

export async function registerRoutes(_server: Server, app: Express): Promise<void> {
  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Watcher change log
  app.get("/api/watcher/changes", (_req, res) => {
    res.json(getRecentChanges());
  });

  // Register all route modules
  app.use(entitiesRouter);
  app.use(projectsRouter);
  app.use(markdownRouter);
  app.use(graphRouter);
  app.use(discoveryRouter);
  app.use(configRouter);
  app.use(scannerRouter);
  app.use(sessionsRouter);
  app.use(agentsRouter);
  app.use(liveRouter);
  app.use(updateRouter);
  app.use(settingsRouter);
  app.use(customGraphRouter);
  app.use(aiSuggestRouter);
  app.use(statsRouter);
  app.use(exportRouter);
  app.use(costAnalyticsRouter);
  app.use(chartAnalyticsRouter);
  app.use(apisRouter);
  app.use(discoverRouter);
  app.use(libraryRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/chat", chatTabsRouter);
  app.use("/api/chat", chatWorkflowsRouter);

  app.use(terminalRouter);
  app.use(createBoardRouter(boardEvents));

  // Actions — open-folder and open-file share identical logic
  const handleOpen = (req: import("express").Request, res: import("express").Response) => {
    const { path: targetPath } = req.body;
    if (!targetPath || typeof targetPath !== "string") return res.status(400).json({ error: "path required" });
    openPath(targetPath);
    res.json({ message: "Opening" });
  };
  app.post("/api/actions/open-folder", handleOpen);
  app.post("/api/actions/open-file", handleOpen);

  // Catch-all for unmatched API routes — must be after all API routers
  // but before the SPA catch-all in static.ts/vite.ts
  app.use("/api/{*path}", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}
