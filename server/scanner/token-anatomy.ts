/**
 * Token anatomy — categorizes token usage by destination across sessions.
 *
 * Categories:
 * - System prompt: estimated from first-message input spike vs steady-state
 * - Conversation: user message input + assistant text output
 * - Tool execution: output tokens in messages with tool calls
 * - Thinking: output tokens in messages with thinking
 * - Cache overhead: cacheCreationTokens across all messages
 *
 * Tree path (flat-to-tree wave3): when the `SessionTree` is cached, each
 * session expands into one sub-session for the parent plus one per subagent.
 * Every sub-session runs the same first-message spike estimation + per-message
 * categorization, so subagent spend is attributed correctly. When no tree is
 * cached we warn once per session and fall back to the legacy parent-only
 * walk, preserving graceful degradation.
 */

import type { ParsedSession } from "@shared/session-types";
import { getPricing, computeCost } from "./pricing";
import { sessionParseCache } from "./session-cache";
import { turnSubSessions, type TurnSlim } from "./tree-turn-walker";

export interface TokenAnatomyCategory {
  tokens: number;
  cost: number;
}

export interface TokenAnatomyResult {
  systemPrompt: TokenAnatomyCategory;
  conversation: TokenAnatomyCategory;
  toolExecution: TokenAnatomyCategory;
  thinking: TokenAnatomyCategory;
  cacheOverhead: TokenAnatomyCategory;
  total: TokenAnatomyCategory;
}

function zeroCategory(): TokenAnatomyCategory {
  return { tokens: 0, cost: 0 };
}

/**
 * Fold one ordered list of turns (one parent or one subagent sub-session)
 * into the running anatomy totals. Factored out so tree and flat paths share
 * identical aggregation logic.
 */
function accumulateSubSession(turns: TurnSlim[], result: TokenAnatomyResult): void {
  if (turns.length === 0) return;

  const model = turns[0].model || "unknown";
  const pricing = getPricing(model);

  let systemPromptTokens = 0;
  if (turns.length >= 2) {
    const firstInput = turns[0].usage.inputTokens;
    const restInputs = turns.slice(1).map((t) => t.usage.inputTokens);
    const avgRest = restInputs.reduce((a, b) => a + b, 0) / restInputs.length;
    systemPromptTokens = Math.max(0, Math.round(firstInput - avgRest));
  }

  result.systemPrompt.tokens += systemPromptTokens;
  result.systemPrompt.cost += computeCost(pricing, systemPromptTokens, 0);

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const u = turn.usage;

    let conversationInput = u.inputTokens;
    if (i === 0) {
      conversationInput = Math.max(0, u.inputTokens - systemPromptTokens);
    }
    result.conversation.tokens += conversationInput;
    result.conversation.cost += computeCost(pricing, conversationInput, 0);

    const outputTokens = u.outputTokens;
    if (turn.hasToolCalls) {
      result.toolExecution.tokens += outputTokens;
      result.toolExecution.cost += computeCost(pricing, 0, outputTokens);
    } else if (turn.hasThinking) {
      result.thinking.tokens += outputTokens;
      result.thinking.cost += computeCost(pricing, 0, outputTokens);
    } else {
      result.conversation.tokens += outputTokens;
      result.conversation.cost += computeCost(pricing, 0, outputTokens);
    }

    if (u.cacheCreationTokens > 0) {
      result.cacheOverhead.tokens += u.cacheCreationTokens;
      result.cacheOverhead.cost += computeCost(pricing, 0, 0, 0, u.cacheCreationTokens);
    }
  }
}

/**
 * Compute token anatomy across all provided parsed sessions.
 *
 * System prompt estimation: for each sub-session with 2+ messages, the first
 * message's input tokens minus the average of subsequent messages' input
 * tokens approximates the system prompt size. Clamped at 0 (no negative
 * estimates). Applied per sub-session so subagents get their own estimate.
 */
export function computeTokenAnatomy(sessions: ParsedSession[]): TokenAnatomyResult {
  const result: TokenAnatomyResult = {
    systemPrompt: zeroCategory(),
    conversation: zeroCategory(),
    toolExecution: zeroCategory(),
    thinking: zeroCategory(),
    cacheOverhead: zeroCategory(),
    total: zeroCategory(),
  };

  for (const session of sessions) {
    const tree = sessionParseCache.getTreeById(session.meta.sessionId);
    if (!tree) {
      console.warn(
        "token-anatomy: tree missing, falling back to flat arrays",
        session.meta.sessionId,
      );
    }

    const subSessions = turnSubSessions(session, tree);
    for (const sub of subSessions) {
      accumulateSubSession(sub, result);
    }
  }

  result.total.tokens =
    result.systemPrompt.tokens +
    result.conversation.tokens +
    result.toolExecution.tokens +
    result.thinking.tokens +
    result.cacheOverhead.tokens;

  result.total.cost =
    result.systemPrompt.cost +
    result.conversation.cost +
    result.toolExecution.cost +
    result.thinking.cost +
    result.cacheOverhead.cost;

  return result;
}
