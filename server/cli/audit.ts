/**
 * Claude Code Health Check — `npx agent-cc --audit`
 * Scores your Claude Code setup out of 100 with actionable fixes.
 * No server needed.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { scanAllSessions } from "../scanner/session-scanner";
import { getStaleAnalytics, getHealthAnalytics } from "../scanner/session-analytics";

const HOME = os.homedir().replace(/\\/g, "/");
const CLAUDE_DIR = path.join(HOME, ".claude").replace(/\\/g, "/");

interface Check {
  name: string;
  score: number;      // 0-100 for this check
  weight: number;     // relative weight
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

function dirExists(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function fileExists(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function readText(p: string): string | null {
  try { return fs.readFileSync(p, "utf-8"); } catch { return null; }
}

function checkClaudeDir(): Check {
  if (dirExists(CLAUDE_DIR)) {
    return { name: "Claude Code installed", score: 100, weight: 1, status: "pass", message: `Found ${CLAUDE_DIR}` };
  }
  return { name: "Claude Code installed", score: 0, weight: 1, status: "fail", message: "~/.claude directory not found", fix: "Install Claude Code: npm install -g @anthropic-ai/claude-code" };
}

function checkSettings(): Check {
  const settingsPath = path.join(CLAUDE_DIR, "settings.json").replace(/\\/g, "/");
  const content = readText(settingsPath);
  if (!content) return { name: "Settings configured", score: 50, weight: 1, status: "warn", message: "No settings.json found", fix: "Run Claude Code once to generate default settings" };

  try {
    const settings = JSON.parse(content);
    const permissions = settings.permissions?.allow || [];
    if (permissions.some((p: string) => p === "*" || p === "Bash(*)")) {
      return { name: "Settings configured", score: 70, weight: 1, status: "warn", message: "Bypass mode enabled — convenient but risky", fix: "Consider using selective permissions instead of wildcard (*)" };
    }
    return { name: "Settings configured", score: 100, weight: 1, status: "pass", message: `Settings OK, ${permissions.length} permission rules` };
  } catch {
    return { name: "Settings configured", score: 30, weight: 1, status: "fail", message: "settings.json is malformed", fix: "Delete ~/.claude/settings.json and let Claude Code regenerate it" };
  }
}

function checkClaudeMd(): Check {
  // Find CLAUDE.md files in project dirs
  const projectsDir = path.join(CLAUDE_DIR, "projects").replace(/\\/g, "/");
  if (!dirExists(projectsDir)) return { name: "CLAUDE.md files", score: 0, weight: 3, status: "fail", message: "No projects directory found", fix: "Run Claude Code in a project to generate session data" };

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  let totalMd = 0;
  let goodMd = 0;
  let totalLines = 0;

  for (const dir of projectDirs) {
    // Decode project path and check for CLAUDE.md
    const dirName = dir.name;
    let projectPath: string;
    if (dirName.match(/^[A-Z]--/)) {
      projectPath = dirName.replace(/^([A-Z])--/, "$1:/").replace(/--/g, "/");
    } else {
      projectPath = "/" + dirName.replace(/--/g, "/");
    }

    const claudeMdPath = path.join(projectPath, "CLAUDE.md").replace(/\\/g, "/");
    if (fileExists(claudeMdPath)) {
      totalMd++;
      const content = readText(claudeMdPath) || "";
      const lines = content.split("\n").length;
      totalLines += lines;
      if (lines >= 50) goodMd++;
    }
  }

  if (totalMd === 0) {
    return { name: "CLAUDE.md files", score: 10, weight: 3, status: "fail", message: "No CLAUDE.md files found in any project", fix: "Create a CLAUDE.md in your project root with coding conventions, architecture overview, and key commands" };
  }

  const avgLines = Math.round(totalLines / totalMd);
  if (avgLines < 20) {
    return { name: "CLAUDE.md files", score: 30, weight: 3, status: "warn", message: `${totalMd} CLAUDE.md files, avg ${avgLines} lines (too short)`, fix: "Expand your CLAUDE.md files to 50+ lines. Include: project structure, key commands, coding conventions, and common patterns" };
  }
  if (avgLines < 50) {
    return { name: "CLAUDE.md files", score: 60, weight: 3, status: "warn", message: `${totalMd} CLAUDE.md files, avg ${avgLines} lines (could be better)`, fix: "Top users average 100+ lines. Add sections for: architecture, testing strategy, deployment, and common gotchas" };
  }

  return { name: "CLAUDE.md files", score: 90 + Math.min(10, Math.round(goodMd / totalMd * 10)), weight: 3, status: "pass", message: `${totalMd} CLAUDE.md files, avg ${avgLines} lines — well configured` };
}

function checkMcpConfigs(): Check {
  const mcpPath = path.join(HOME, ".mcp.json").replace(/\\/g, "/");
  const content = readText(mcpPath);
  if (!content) {
    return { name: "MCP servers", score: 40, weight: 2, status: "warn", message: "No ~/.mcp.json found", fix: "Configure MCP servers in ~/.mcp.json to extend Claude Code's capabilities" };
  }

  try {
    const config = JSON.parse(content);
    const servers = Object.keys(config.mcpServers || {});
    if (servers.length === 0) {
      return { name: "MCP servers", score: 40, weight: 2, status: "warn", message: ".mcp.json exists but no servers configured", fix: "Add MCP servers to extend Claude's capabilities (Playwright, database, etc.)" };
    }
    return { name: "MCP servers", score: 80 + Math.min(20, servers.length * 4), weight: 2, status: "pass", message: `${servers.length} MCP servers configured: ${servers.slice(0, 5).join(", ")}` };
  } catch {
    return { name: "MCP servers", score: 20, weight: 2, status: "fail", message: ".mcp.json is malformed JSON", fix: "Fix the JSON syntax in ~/.mcp.json" };
  }
}

async function checkSessions(): Promise<Check> {
  const { sessions } = await scanAllSessions();
  if (sessions.length === 0) {
    return { name: "Session hygiene", score: 50, weight: 2, status: "warn", message: "No sessions found" };
  }

  const stale = getStaleAnalytics(sessions);
  const totalStale = stale.totalEmpty + stale.totalStale;
  const stalePct = Math.round(totalStale / sessions.length * 100);

  if (stalePct > 50) {
    return { name: "Session hygiene", score: 20, weight: 2, status: "fail", message: `${totalStale} stale/empty sessions (${stalePct}% of ${sessions.length})`, fix: `Clean up: ${stale.totalEmpty} empty + ${stale.totalStale} stale sessions. Reclaimable: ${Math.round(stale.reclaimableBytes / 1024 / 1024)}MB` };
  }
  if (stalePct > 20) {
    return { name: "Session hygiene", score: 50, weight: 2, status: "warn", message: `${totalStale} stale/empty sessions (${stalePct}%)`, fix: `Consider cleaning ${stale.totalEmpty} empty sessions to free ${Math.round(stale.reclaimableBytes / 1024 / 1024)}MB` };
  }
  return { name: "Session hygiene", score: 90, weight: 2, status: "pass", message: `${sessions.length} sessions, only ${totalStale} stale (${stalePct}%)` };
}

async function checkHealth(): Promise<Check> {
  const { sessions } = await scanAllSessions();
  if (sessions.length === 0) return { name: "Session health", score: 50, weight: 2, status: "warn", message: "No sessions to analyze" };

  const health = getHealthAnalytics(sessions);
  const poorPct = Math.round(health.poorCount / (health.goodCount + health.fairCount + health.poorCount) * 100);

  if (poorPct > 30) {
    return { name: "Session health", score: 20, weight: 2, status: "fail", message: `${poorPct}% poor sessions (${health.poorCount} of ${health.goodCount + health.fairCount + health.poorCount})`, fix: "High error/retry rate. Check your CLAUDE.md for unclear instructions. Use /compact mode for simpler tasks." };
  }
  if (poorPct > 15) {
    return { name: "Session health", score: 50, weight: 2, status: "warn", message: `${poorPct}% poor sessions, avg ${health.avgToolErrors} errors/session`, fix: "Review poor sessions for common error patterns. Consider adding more context to your CLAUDE.md." };
  }
  return { name: "Session health", score: 85 + Math.min(15, Math.round((100 - poorPct) / 7)), weight: 2, status: "pass", message: `${health.goodCount} good, ${health.fairCount} fair, ${health.poorCount} poor — healthy` };
}

function checkCacheEfficiency(): Check {
  // Check if sessions directory structure suggests good cache usage
  const projectsDir = path.join(CLAUDE_DIR, "projects").replace(/\\/g, "/");
  if (!dirExists(projectsDir)) return { name: "Cache efficiency", score: 50, weight: 1, status: "warn", message: "No project data to analyze" };

  const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  // More project dirs = more context switching = lower cache efficiency
  if (dirs.length > 10) {
    return { name: "Cache efficiency", score: 50, weight: 1, status: "warn", message: `${dirs.length} project contexts — frequent switching reduces cache hits`, fix: "Focus sessions on fewer projects at a time to maximize prompt cache hit rate" };
  }
  return { name: "Cache efficiency", score: 80, weight: 1, status: "pass", message: `${dirs.length} project contexts — reasonable for cache efficiency` };
}

export async function runAudit(json = false): Promise<void> {
  const checks: Check[] = [];

  checks.push(checkClaudeDir());
  checks.push(checkSettings());
  checks.push(checkClaudeMd());
  checks.push(checkMcpConfigs());
  checks.push(await checkSessions());
  checks.push(await checkHealth());
  checks.push(checkCacheEfficiency());

  // Calculate weighted score
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const weightedScore = Math.round(checks.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);

  if (json) {
    console.log(JSON.stringify({ score: weightedScore, checks }, null, 2));
    process.exit(0);
  }

  const W = 56;
  const ln = (w: number) => "─".repeat(w);

  console.log();
  console.log(`┌${ln(W)}┐`);
  console.log(`│${" ".repeat(14)}CLAUDE CODE HEALTH CHECK${" ".repeat(18)}│`);
  console.log(`├${ln(W)}┤`);

  const icons = { pass: "✓", warn: "!", fail: "✗" };
  const colors = { pass: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m" };
  const reset = "\x1b[0m";

  for (const check of checks) {
    const icon = icons[check.status];
    const color = colors[check.status];
    console.log(`│  ${color}${icon}${reset} ${check.name.padEnd(22)} ${String(check.score).padStart(3)}/100  ${check.status.toUpperCase().padEnd(4)}  │`);
    console.log(`│    ${check.message.slice(0, W - 6).padEnd(W - 6)}│`);
    if (check.fix) {
      console.log(`│    ${colors.warn}→ ${check.fix.slice(0, W - 8)}${reset}${"".padEnd(Math.max(0, W - 8 - check.fix.length))}│`);
    }
    console.log(`│${" ".repeat(W)}│`);
  }

  console.log(`├${ln(W)}┤`);

  // Score bar
  const barLen = 30;
  const filled = Math.round(weightedScore / 100 * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const label = weightedScore >= 80 ? "Excellent" : weightedScore >= 60 ? "Good" : weightedScore >= 40 ? "Fair" : "Needs work";
  const scoreColor = weightedScore >= 80 ? colors.pass : weightedScore >= 60 ? colors.warn : colors.fail;

  console.log(`│${" ".repeat(W)}│`);
  console.log(`│  OVERALL SCORE:  ${scoreColor}${weightedScore}/100 — ${label}${reset}${"".padEnd(Math.max(0, W - 30 - label.length))}│`);
  console.log(`│  ${bar}${"".padEnd(W - barLen - 2)}│`);
  console.log(`│${" ".repeat(W)}│`);

  const fixCount = checks.filter(c => c.fix).length;
  if (fixCount > 0) {
    console.log(`│  ${fixCount} issue${fixCount > 1 ? "s" : ""} found. Fix them and re-run: npx agent-cc --audit │`);
  } else {
    console.log(`│  No issues found. Your setup is well configured!  │`);
  }

  console.log(`└${ln(W)}┘`);
  console.log();
}
