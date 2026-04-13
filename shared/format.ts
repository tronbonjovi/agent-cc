/**
 * Canonical display formatters — shared by client and server.
 *
 * This is the single source of truth for formatted numeric/date display
 * across Agent CC. Do not redefine these in individual pages; import from
 * `@shared/format` (server) or `@/lib/format` (client).
 */

/**
 * Tiered USD formatter — scales decimal places with magnitude so tiny
 * values stay legible while large values stay compact.
 *
 *   >= $0.01      → 2 decimals   ($1.50, $0.05)
 *   >= $0.0001    → 4 decimals   ($0.0005)
 *   >  0          → "<$0.0001"   (sub-cent sentinel)
 *   0             → "$0.00"
 */
export function formatUsd(value: number): string {
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  if (value > 0) return "<$0.0001";
  return "$0.00";
}

/**
 * Simple USD formatter — always 2 decimals.
 * Use for tabular columns that need stable alignment, not for scaled display.
 */
export function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Token count with M/K abbreviation.
 *
 *   >= 1_000_000 → "1.5M"
 *   >= 1_000     → "2.5K"
 *   <  1_000     → raw integer "500"
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

/**
 * Format a date (ISO string or Date) as "MMM DD" (e.g. "Apr 13").
 * Uses locale-aware formatting; exact output depends on system timezone.
 */
export function formatDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
