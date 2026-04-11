import { Router } from "express";
import { getCostSummary, getSessionCostDetail } from "../scanner/cost-indexer";
import { computeTokenAnatomy } from "../scanner/token-anatomy";
import { computeModelIntelligence } from "../scanner/model-intelligence";
import { computeCacheEfficiency } from "../scanner/cache-efficiency";
import { sessionParseCache } from "../scanner/session-cache";

const router = Router();

/** GET /api/analytics/costs?days=30 — Cost summary from indexed records */
router.get("/api/analytics/costs", (_req, res) => {
  try {
    const rawDays = parseInt(_req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const summary = getCostSummary(days);
    res.json(summary);
  } catch (err) {
    console.error("[cost-analytics] Failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to build cost analytics", error: (err as Error).message });
  }
});

/** GET /api/analytics/costs/session/:id — Detailed cost breakdown for one session */
router.get("/api/analytics/costs/session/:id", (req, res) => {
  try {
    const detail = getSessionCostDetail(req.params.id);
    if (!detail) return res.status(404).json({ message: "Session not found or has no cost data" });
    res.json(detail);
  } catch (err) {
    console.error("[cost-analytics] Session detail failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to get session cost detail", error: (err as Error).message });
  }
});

/** GET /api/analytics/costs/anatomy?days=30 — Token usage categorized by destination */
router.get("/api/analytics/costs/anatomy", (_req, res) => {
  try {
    const rawDays = parseInt(_req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const allSessions = sessionParseCache.getAll();
    const filtered = Array.from(allSessions.values()).filter(s => {
      const ts = s.meta.lastTs || s.meta.firstTs;
      return ts && ts >= cutoffStr;
    });

    const anatomy = computeTokenAnatomy(filtered);
    res.json(anatomy);
  } catch (err) {
    console.error("[cost-analytics] Anatomy failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to compute token anatomy", error: (err as Error).message });
  }
});

/** GET /api/analytics/costs/models?days=30 — Per-model token and cost breakdown */
router.get("/api/analytics/costs/models", (_req, res) => {
  try {
    const rawDays = parseInt(_req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const allSessions = sessionParseCache.getAll();
    const filtered = Array.from(allSessions.values()).filter(s => {
      const ts = s.meta.lastTs || s.meta.firstTs;
      return ts && ts >= cutoffStr;
    });

    const rows = computeModelIntelligence(filtered);
    res.json(rows);
  } catch (err) {
    console.error("[cost-analytics] Models failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to compute model intelligence", error: (err as Error).message });
  }
});

/** GET /api/analytics/costs/cache?days=30 — Cache efficiency metrics */
router.get("/api/analytics/costs/cache", (_req, res) => {
  try {
    const rawDays = parseInt(_req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const allSessions = sessionParseCache.getAll();
    const filtered = Array.from(allSessions.values()).filter(s => {
      const ts = s.meta.lastTs || s.meta.firstTs;
      return ts && ts >= cutoffStr;
    });

    const result = computeCacheEfficiency(filtered);
    res.json(result);
  } catch (err) {
    console.error("[cost-analytics] Cache efficiency failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to compute cache efficiency", error: (err as Error).message });
  }
});

export default router;
