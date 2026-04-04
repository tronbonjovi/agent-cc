/**
 * Claude Code Receipt — `npx agent-cc --report`
 * Prints a terminal-formatted cost/usage receipt from ~/.claude/ session data.
 * No server needed. Supports both subscription and pay-as-you-go billing.
 */
import { scanAllSessions } from "../scanner/session-scanner";
import { getCostAnalytics, getHealthAnalytics } from "../scanner/session-analytics";
import { storage } from "../storage";
import type { BillingMode } from "@shared/types";

/** Resolve billing mode: "auto" defaults to "subscription" (most Claude Code users) */
function resolveBillingMode(): "subscription" | "pay-as-you-go" {
  const mode = storage.getAppSettings().billingMode || "auto";
  if (mode === "pay-as-you-go") return "pay-as-you-go";
  if (mode === "subscription") return "subscription";
  // Auto-detect: default to subscription since Claude Code CLI users are typically on Pro/Max plans
  return "subscription";
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pad(s: string, len: number, right = false): string {
  return right ? s.padEnd(len) : s.padStart(len);
}

function line(w: number): string {
  return "─".repeat(w);
}

export async function runReport(json = false): Promise<void> {
  // Scan sessions
  const { sessions, stats } = await scanAllSessions();

  if (sessions.length === 0) {
    console.log("No Claude Code sessions found in ~/.claude/projects/");
    console.log("Run some Claude Code sessions first, then try again.");
    process.exit(0);
  }

  const costs = getCostAnalytics(sessions);
  const health = getHealthAnalytics(sessions);

  const billing = resolveBillingMode();
  const isSubscription = billing === "subscription";

  if (json) {
    console.log(JSON.stringify({ billing, costs, health: { good: health.goodCount, fair: health.fairCount, poor: health.poorCount }, sessions: stats }, null, 2));
    process.exit(0);
  }

  const W = 52;

  // Calculate efficiency score
  const totalRetries = health.avgRetries * costs.totalSessions;
  const retryWastePct = costs.totalSessions > 0 ? Math.min(100, Math.round(totalRetries / Math.max(1, costs.totalSessions) * 5)) : 0;
  const healthPct = costs.totalSessions > 0 ? Math.round(health.goodCount / costs.totalSessions * 100) : 100;
  const efficiencyScore = Math.max(0, Math.min(100, Math.round((healthPct * 0.6) + ((100 - retryWastePct) * 0.4))));

  console.log();
  console.log(`┌${line(W)}┐`);
  const title = isSubscription ? "CLAUDE CODE USAGE REPORT" : "CLAUDE CODE RECEIPT";
  console.log(`│${pad(title, W / 2 + 12)}${pad("", W / 2 - 12)}│`);
  console.log(`│${pad(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W / 2 + 10)}${pad("", W / 2 - 10)}│`);
  if (isSubscription) {
    console.log(`│${pad("Subscription Plan", W / 2 + 10)}${pad("", W / 2 - 10)}│`);
  }
  console.log(`├${line(W)}┤`);

  // Total
  console.log(`│                                                    │`);
  if (!isSubscription) {
    console.log(`│  TOTAL SPEND              ${pad(formatUsd(costs.totalCostUsd), 22)}  │`);
  }
  console.log(`│  Sessions                 ${pad(String(costs.totalSessions), 22)}  │`);
  console.log(`│  Input Tokens             ${pad(formatTokens(costs.totalInputTokens), 22)}  │`);
  console.log(`│  Output Tokens            ${pad(formatTokens(costs.totalOutputTokens), 22)}  │`);
  console.log(`│  Total Tokens             ${pad(formatTokens(costs.totalInputTokens + costs.totalOutputTokens), 22)}  │`);
  console.log(`│                                                    │`);
  console.log(`├${line(W)}┤`);

  // By model
  console.log(`│  BY MODEL                                          │`);
  const models = Object.entries(costs.byModel).sort((a, b) => b[1].cost - a[1].cost);
  for (const [model, data] of models) {
    const name = model.replace("claude-", "").slice(0, 20);
    const value = isSubscription ? formatTokens(data.tokens) : formatUsd(data.cost);
    console.log(`│  ${pad(name, 22, true)} ${pad(`${data.sessions}s`, 6)} ${pad(value, 18)}  │`);
  }
  console.log(`│                                                    │`);
  console.log(`├${line(W)}┤`);

  // By project
  console.log(`│  BY PROJECT                                        │`);
  const projects = Object.entries(costs.byProject).sort((a, b) => b[1].cost - a[1].cost).slice(0, 6);
  for (const [proj, data] of projects) {
    const name = proj.split("-").pop()?.slice(0, 20) || proj.slice(0, 20);
    const value = isSubscription ? formatTokens(data.tokens) : formatUsd(data.cost);
    console.log(`│  ${pad(name, 22, true)} ${pad(`${data.sessions}s`, 6)} ${pad(value, 18)}  │`);
  }
  console.log(`│                                                    │`);
  console.log(`├${line(W)}┤`);

  // Health
  console.log(`│  SESSION HEALTH                                    │`);
  console.log(`│  Good                     ${pad(String(health.goodCount), 22)}  │`);
  console.log(`│  Fair                     ${pad(String(health.fairCount), 22)}  │`);
  console.log(`│  Poor                     ${pad(String(health.poorCount), 22)}  │`);
  console.log(`│  Avg errors/session       ${pad(String(health.avgToolErrors), 22)}  │`);
  console.log(`│  Avg retries/session      ${pad(String(health.avgRetries), 22)}  │`);
  console.log(`│                                                    │`);
  console.log(`├${line(W)}┤`);

  // Top sessions
  if (costs.topSessions.length > 0) {
    const label = isSubscription ? "MOST ACTIVE SESSIONS" : "MOST EXPENSIVE SESSIONS";
    console.log(`│  ${pad(label, W - 4, true)}│`);
    for (const s of costs.topSessions.slice(0, 5)) {
      const msg = (s.firstMessage || "").slice(0, 28);
      const value = isSubscription ? formatTokens(s.tokens) : formatUsd(s.cost);
      console.log(`│  ${pad(msg, 30, true)} ${pad(value, 18)}  │`);
    }
    console.log(`│                                                    │`);
    console.log(`├${line(W)}┤`);
  }

  // Efficiency score
  const scoreBar = "█".repeat(Math.round(efficiencyScore / 5)) + "░".repeat(20 - Math.round(efficiencyScore / 5));
  const scoreLabel = efficiencyScore >= 80 ? "Excellent" : efficiencyScore >= 60 ? "Good" : efficiencyScore >= 40 ? "Fair" : "Needs work";
  console.log(`│                                                    │`);
  console.log(`│  EFFICIENCY SCORE         ${pad(`${efficiencyScore}/100 ${scoreLabel}`, 22)}  │`);
  console.log(`│  ${scoreBar}                          │`);
  console.log(`│                                                    │`);
  console.log(`├${line(W)}┤`);
  console.log(`│  Scanned in ${pad(`${costs.durationMs}ms`, 6)} │ agent-cc               │`);
  console.log(`└${line(W)}┘`);
  console.log();
}
