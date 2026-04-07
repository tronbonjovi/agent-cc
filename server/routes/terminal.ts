import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getTerminalManager } from "../terminal";
import { validate } from "./validation";

const TerminalTabSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
});

const PanelPatchSchema = z.object({
  height: z.number().min(100).max(2000).optional(),
  collapsed: z.boolean().optional(),
  tabs: z.array(TerminalTabSchema).optional(),
  activeTabId: z.string().nullable().optional(),
  splitTabId: z.string().nullable().optional(),
});

const router = Router();

router.get("/api/terminal/panel", (_req, res) => {
  res.json(storage.getTerminalPanel());
});

router.patch("/api/terminal/panel", (req, res) => {
  const parsed = validate(PanelPatchSchema, req.body, res);
  if (!parsed) return;
  const updated = storage.updateTerminalPanel(parsed);
  res.json(updated);
});

// Kill a terminal session by ID — used when closing a tab while disconnected
router.delete("/api/terminal/sessions/:id", (req, res) => {
  const manager = getTerminalManager();
  if (!manager) {
    res.status(503).json({ error: "Terminal manager not initialized" });
    return;
  }
  manager.kill(req.params.id);
  res.json({ ok: true });
});

export default router;
