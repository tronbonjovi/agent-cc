/**
 * Canonical model pricing — single source of truth for all cost calculations.
 *
 * USD per million tokens. Shared between server (`server/scanner/pricing.ts`
 * wraps this table with `getPricing`/`computeCost`/`getMaxTokens`/
 * `getModelFamily` helpers) and client (`APIEquivalentValue.tsx` derives a
 * 2-field estimate table from this record for its rough API-value chart).
 *
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Version-aware keys: Opus 4.5/4.6 had a major price cut vs 4.0/4.1, so
 * specific-version keys must be checked before the generic `opus` family.
 * Consumers that iterate this record for matching rely on insertion order
 * (`Object.entries` / `Object.keys` preserve definition order in modern JS).
 */

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
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
