/**
 * Pricing helpers — the pricing table itself lives in `shared/pricing.ts`
 * so the client can derive its own rough-estimate view from the same source
 * of truth. This module wraps that record with server-side helpers:
 * `getPricing`, `computeCost`, `getMaxTokens`, `getModelFamily`.
 *
 * Used by: session-analytics, cost-analytics, live-scanner
 */

import { MODEL_PRICING, type ModelPricing } from "../../shared/pricing";

export type { ModelPricing };

/** Get pricing for a model by matching version-specific keys first, then family.
 *  Order matters: specific versions ("opus-4-6") checked before generic ("opus"). */
export function getPricing(model: string): ModelPricing {
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key)) return pricing;
  }
  return MODEL_PRICING.sonnet; // default
}

/** Calculate cost in USD from token counts */
export function computeCost(
  pricing: ModelPricing,
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreation = 0,
): number {
  return (
    (input * pricing.input) +
    (output * pricing.output) +
    (cacheRead * pricing.cacheRead) +
    (cacheCreation * pricing.cacheCreation)
  ) / 1_000_000;
}

/** Max context window by model family */
export function getMaxTokens(model: string): number {
  if (model.includes("opus")) return 1_000_000;
  return 200_000;
}

/** Extract model family key from a model string.
 *  "claude-opus-4-6" → "opus-4-6", "claude-sonnet-4-20250514" → "sonnet" */
export function getModelFamily(model: string): string {
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.includes(key)) return key;
  }
  return "sonnet";
}
