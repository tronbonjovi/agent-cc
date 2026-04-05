import { Router } from "express";
import { getCostSummary, getSessionCostDetail } from "../scanner/cost-indexer";

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

export default router;
