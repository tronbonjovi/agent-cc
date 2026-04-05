/**
 * Unified model pricing — single source of truth for all cost calculations.
 * Used by: session-analytics, cost-analytics, live-scanner
 */

// USD per million tokens
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

// Version-aware pricing — Opus 4.5/4.6 had a major price cut vs 4.0/4.1
// Source: https://platform.claude.com/docs/en/about-claude/pricing
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4.5+ (includes 4.5 and 4.6) — $5/$25
  "opus-4-5":   { input: 5,    output: 25,  cacheRead: 0.50,  cacheCreation: 6.25 },
  "opus-4-6":   { input: 5,    output: 25,  cacheRead: 0.50,  cacheCreation: 6.25 },
  // Opus 4.0/4.1 — $15/$75
  "opus":       { input: 15,   output: 75,  cacheRead: 1.50,  cacheCreation: 18.75 },
  // Sonnet (all versions same price)
  "sonnet":     { input: 3,    output: 15,  cacheRead: 0.30,  cacheCreation: 3.75 },
  // Haiku 4.5 — $1/$5
  "haiku-4-5":  { input: 1,    output: 5,   cacheRead: 0.10,  cacheCreation: 1.25 },
  // Haiku 3.5 and older — $0.80/$4
  "haiku":      { input: 0.80, output: 4,   cacheRead: 0.08,  cacheCreation: 1 },
};

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
