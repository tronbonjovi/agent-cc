import { spawn } from "child_process";
import type { SessionData, NLQueryResult } from "@shared/types";
import { getCostAnalytics, getFileHeatmap, getHealthAnalytics, getStaleAnalytics } from "./session-analytics";
import { storage } from "../storage";

/** Build a context string from analytics data for the LLM to answer questions */
function buildContext(sessions: SessionData[]): string {
  const costs = getCostAnalytics(sessions);
  const files = getFileHeatmap(sessions);
  const health = getHealthAnalytics(sessions);
  const stale = getStaleAnalytics(sessions);
  const summaries = storage.getSummaries();

  const parts: string[] = [];

  // Cost summary
  parts.push(`COST ANALYTICS:`);
  parts.push(`Total: $${costs.totalCostUsd.toFixed(2)}, ${costs.totalSessions} sessions`);
  parts.push(`Input tokens: ${costs.totalInputTokens}, Output tokens: ${costs.totalOutputTokens}`);
  parts.push(`By model: ${Object.entries(costs.byModel).map(([m, d]) => `${m}: $${d.cost.toFixed(2)}`).join(", ")}`);
  parts.push(`By project: ${Object.entries(costs.byProject).map(([p, d]) => `${p}: $${d.cost.toFixed(2)} (${d.sessions}s)`).join(", ")}`);
  parts.push(`Last 7 days: ${costs.byDay.slice(-7).map(d => `${d.date}: $${d.cost.toFixed(2)}`).join(", ")}`);
  parts.push(`Top 5 expensive: ${costs.topSessions.slice(0, 5).map(s => `"${s.firstMessage.slice(0, 40)}": $${s.cost.toFixed(2)}`).join(", ")}`);

  // Health
  parts.push(`\nHEALTH: ${health.goodCount} good, ${health.fairCount} fair, ${health.poorCount} poor`);
  parts.push(`Avg errors: ${health.avgToolErrors}, Avg retries: ${health.avgRetries}`);

  // Files (top 10)
  parts.push(`\nTOP FILES: ${files.files.slice(0, 10).map(f => `${f.fileName} (${f.touchCount}x, ${f.sessionCount}s)`).join(", ")}`);

  // Stale
  parts.push(`\nSTALE: ${stale.totalEmpty} empty, ${stale.totalStale} stale, ${stale.reclaimableBytes} bytes reclaimable`);

  // Recent sessions with summaries
  const recentWithSummary = sessions
    .filter(s => !s.isEmpty)
    .sort((a, b) => (b.lastTs || "").localeCompare(a.lastTs || ""))
    .slice(0, 20);

  parts.push(`\nRECENT SESSIONS:`);
  for (const s of recentWithSummary) {
    const summary = summaries[s.id];
    const line = `- ${(s.firstMessage || s.slug || "").slice(0, 60)} | ${s.lastTs?.slice(0, 10) || "?"} | ${s.messageCount} msgs | project: ${s.projectKey}`;
    if (summary) {
      parts.push(`${line} | ${summary.outcome} | topics: ${summary.topics.join(", ")}`);
    } else {
      parts.push(line);
    }
  }

  return parts.join("\n");
}

/** Run a natural language query against analytics data using claude -p */
export async function runNLQuery(question: string, sessions: SessionData[]): Promise<NLQueryResult> {
  const start = performance.now();
  const context = buildContext(sessions);

  const prompt = `You are answering questions about a Claude Code Command Center's session analytics data.

DATA:
${context}

QUESTION: ${question}

Answer concisely and directly. Use specific numbers from the data. If the data doesn't contain enough information to answer, say so. Do not make up data.`;

  const answer = await new Promise<string>((resolve, reject) => {
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.CLAUDECODE;

    const child = spawn("claude", ["-p", "--model", "haiku", "--max-turns", "1", "--no-session-persistence"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });

    const timeout = setTimeout(() => { child.kill(); reject(new Error("Timeout")); }, 60000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Exit ${code}`));
      else resolve(stdout.trim());
    });
    child.on("error", (err) => { clearTimeout(timeout); reject(err); });

    child.stdin.write(prompt);
    child.stdin.end();
  });

  return {
    answer,
    context: `${sessions.length} sessions, ${Object.keys(storage.getSummaries()).length} summaries`,
    durationMs: Math.round(performance.now() - start),
  };
}
