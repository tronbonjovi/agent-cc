import { Router } from "express";
import { getCachedSessions } from "../scanner/session-scanner";
import { getCachedAgentStats } from "../scanner/agent-scanner";

const router = Router();

router.get("/api/stats/overview", (_req, res) => {
  const sessions = getCachedSessions();
  const agentStats = getCachedAgentStats();

  // sessionsPerDay: last 14 days grouped by firstTs date
  const now = new Date();
  const dayMap: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const s of sessions) {
    const ts = s.firstTs;
    if (!ts) continue;
    const date = ts.slice(0, 10);
    if (date in dayMap) {
      dayMap[date]++;
    }
  }
  const sessionsPerDay = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // topProjects: top 5 by session count
  const projectMap: Record<string, { sessions: number; size: number }> = {};
  for (const s of sessions) {
    const key = s.projectKey;
    if (!key) continue;
    if (!projectMap[key]) projectMap[key] = { sessions: 0, size: 0 };
    projectMap[key].sessions++;
    projectMap[key].size += s.sizeBytes;
  }
  const topProjects = Object.entries(projectMap)
    .map(([name, v]) => ({ name, sessions: v.sessions, size: v.size }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);

  // agentTypeDistribution + modelDistribution from cached agent stats
  const agentTypeDistribution: Record<string, number> = { ...agentStats.byType };
  const modelDistribution: Record<string, number> = { ...agentStats.byModel };

  // totalTokensEstimate: sum of session file sizes as rough proxy
  const totalTokensEstimate = sessions.reduce((sum, s) => sum + s.sizeBytes, 0);

  // totalSessions
  const totalSessions = sessions.length;

  // totalAgentExecutions
  const totalAgentExecutions = agentStats.totalExecutions;

  // averageSessionSize
  const averageSessionSize = totalSessions > 0
    ? Math.round(totalTokensEstimate / totalSessions)
    : 0;

  res.json({
    sessionsPerDay,
    topProjects,
    agentTypeDistribution,
    modelDistribution,
    totalTokensEstimate,
    totalSessions,
    totalAgentExecutions,
    averageSessionSize,
  });
});

export default router;
