/**
 * Token anatomy — categorizes token usage by destination across sessions.
 *
 * Categories:
 * - System prompt: estimated from first-message input spike vs steady-state
 * - Conversation: user message input + assistant text output
 * - Tool execution: output tokens in messages with tool calls
 * - Thinking: output tokens in messages with thinking
 * - Cache overhead: cacheCreationTokens across all messages
 */

import type { ParsedSession, AssistantRecord } from "@shared/session-types";
import { getPricing, computeCost } from "./pricing";

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
 * Compute token anatomy across all provided parsed sessions.
 *
 * System prompt estimation: for each session with 2+ messages, the first message's
 * input tokens minus the average of subsequent messages' input tokens approximates
 * the system prompt size. Clamped at 0 (no negative estimates).
 *
 * Output token categorization per assistant message:
 * - Has tool calls → toolExecution
 * - Has thinking → thinking
 * - Otherwise → conversation
 *
 * Input tokens (minus system prompt estimate) go to conversation.
 * Cache creation tokens go to cacheOverhead.
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
    const msgs = session.assistantMessages;
    if (msgs.length === 0) continue;

    // Determine dominant model for cost calculation
    const model = msgs[0].model || "unknown";
    const pricing = getPricing(model);

    // Estimate system prompt tokens
    let systemPromptTokens = 0;
    if (msgs.length >= 2) {
      const firstInput = msgs[0].usage.inputTokens;
      const restInputs = msgs.slice(1).map(m => m.usage.inputTokens);
      const avgRest = restInputs.reduce((a, b) => a + b, 0) / restInputs.length;
      systemPromptTokens = Math.max(0, Math.round(firstInput - avgRest));
    }

    result.systemPrompt.tokens += systemPromptTokens;
    // System prompt cost: treat as input tokens
    result.systemPrompt.cost += computeCost(pricing, systemPromptTokens, 0);

    // Process each message
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const u = msg.usage;

      // Input tokens → conversation (minus system prompt already accounted for)
      let conversationInput = u.inputTokens;
      if (i === 0) {
        conversationInput = Math.max(0, u.inputTokens - systemPromptTokens);
      }
      result.conversation.tokens += conversationInput;
      result.conversation.cost += computeCost(pricing, conversationInput, 0);

      // Output tokens categorization
      const outputTokens = u.outputTokens;
      if (msg.toolCalls.length > 0) {
        result.toolExecution.tokens += outputTokens;
        result.toolExecution.cost += computeCost(pricing, 0, outputTokens);
      } else if (msg.hasThinking) {
        result.thinking.tokens += outputTokens;
        result.thinking.cost += computeCost(pricing, 0, outputTokens);
      } else {
        result.conversation.tokens += outputTokens;
        result.conversation.cost += computeCost(pricing, 0, outputTokens);
      }

      // Cache creation → overhead
      if (u.cacheCreationTokens > 0) {
        result.cacheOverhead.tokens += u.cacheCreationTokens;
        result.cacheOverhead.cost += computeCost(pricing, 0, 0, 0, u.cacheCreationTokens);
      }
    }
  }

  // Compute totals
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
