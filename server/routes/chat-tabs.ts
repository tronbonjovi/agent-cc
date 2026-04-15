/**
 * Chat tab persistence routes — part of the chat-workflows-tabs milestone.
 *
 * Lives in its own file rather than extending `routes/chat.ts` because chat.ts
 * is focused on the SSE / prompt flow and has already accumulated
 * interaction-repo coupling. Tab state is pure UI preference and rides on the
 * JSON DB — keeping it isolated keeps `chat.ts` auditable.
 *
 *   GET  /api/chat/tabs  -> current `chatUIState` from the JSON DB
 *   PUT  /api/chat/tabs  -> replaces `chatUIState` with the request body
 *
 * The PUT handler validates the shape before writing so a malformed client
 * payload can never corrupt the persisted state. Writes go through the shared
 * `save()` debounced atomic writer in `server/db.ts` — no new IO path.
 */
import { Router, type Request, type Response } from "express";
import { getDB, save } from "../db";
import type { ChatTabState } from "../../shared/types";

const router = Router();

/** Migration-safe default. Matches `defaultData().chatUIState`. */
function defaultChatTabState(): ChatTabState {
  return { openTabs: [], activeTabId: null, tabOrder: [] };
}

/**
 * Validate an untrusted body against the ChatTabState shape. Returns the
 * validated value on success, or an Error-shaped failure we can map to 400.
 * Kept simple on purpose — no zod dependency for one route.
 */
function validateChatTabState(body: unknown): ChatTabState | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.openTabs)) {
    return { error: "openTabs must be an array" };
  }
  for (const entry of b.openTabs) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as any).conversationId !== "string" ||
      typeof (entry as any).title !== "string"
    ) {
      return {
        error:
          "each openTabs entry must be { conversationId: string, title: string }",
      };
    }
  }

  if (b.activeTabId !== null && typeof b.activeTabId !== "string") {
    return { error: "activeTabId must be a string or null" };
  }

  if (!Array.isArray(b.tabOrder)) {
    return { error: "tabOrder must be an array" };
  }
  for (const id of b.tabOrder) {
    if (typeof id !== "string") {
      return { error: "tabOrder must contain only strings" };
    }
  }

  return {
    openTabs: b.openTabs as ChatTabState["openTabs"],
    activeTabId: b.activeTabId as ChatTabState["activeTabId"],
    tabOrder: b.tabOrder as ChatTabState["tabOrder"],
  };
}

router.get("/tabs", (_req: Request, res: Response) => {
  const db = getDB();
  // Graceful degradation — return the default even if a legacy DB record
  // is missing the field. The db loader already back-fills it on startup,
  // but tests / mocks may not.
  const state = db?.chatUIState ?? defaultChatTabState();
  res.json(state);
});

router.put("/tabs", (req: Request, res: Response) => {
  const result = validateChatTabState(req.body);
  if ("error" in result) {
    return res.status(400).json({ error: result.error });
  }
  const db = getDB();
  db.chatUIState = result;
  save();
  res.json({ ok: true });
});

export default router;
