import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { SessionData, SessionStats, AgentDefinition, AgentExecution, AgentStats } from "@shared/types";

// --- Mock scanner modules before importing routers ---

const mockSessions: SessionData[] = [
  {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    slug: "test-session",
    firstMessage: "Hello world",
    firstTs: "2025-01-01T00:00:00Z",
    lastTs: "2025-01-01T01:00:00Z",
    messageCount: 5,
    sizeBytes: 1024,
    isEmpty: false,
    isActive: false,
    filePath: "/tmp/test.jsonl",
    projectKey: "test-project",
    cwd: "/tmp",
    version: "1.0",
    gitBranch: "main",
  },
];

const mockStats: SessionStats = {
  totalCount: 1,
  totalSize: 1024,
  activeCount: 0,
  emptyCount: 0,
};

const mockDefinitions: AgentDefinition[] = [
  {
    id: "def-abc123",
    name: "Test Agent",
    description: "A test agent",
    model: "claude-3",
    color: "#ff0000",
    tools: ["Read"],
    source: "user",
    filePath: "/tmp/test-agent.md",
    content: "Test content",
    writable: true,
  },
];

const mockExecutions: AgentExecution[] = [
  {
    agentId: "exec-001",
    slug: "test-execution",
    sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    projectKey: "test-project",
    agentType: "Test Agent",
    model: "claude-3",
    firstMessage: "Do something",
    firstTs: "2025-01-01T00:00:00Z",
    lastTs: "2025-01-01T00:05:00Z",
    messageCount: 3,
    sizeBytes: 512,
    filePath: "/tmp/test-exec.jsonl",
  },
];

const mockAgentStats: AgentStats = {
  totalExecutions: 1,
  totalDefinitions: 1,
  sessionsWithAgents: 1,
  byType: { "Test Agent": 1 },
  byModel: { "claude-3": 1 },
};

// Mock session scanner
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => mockSessions,
  getCachedStats: () => mockStats,
  removeCachedSession: vi.fn(),
  restoreCachedSession: vi.fn(),
}));

// Mock agent scanner
vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedDefinitions: () => mockDefinitions,
  getCachedExecutions: () => mockExecutions,
  getCachedAgentStats: () => mockAgentStats,
  scanAgentDefinitions: vi.fn(() => []),
  scanAgentExecutions: vi.fn(() => ({ executions: [], stats: mockAgentStats })),
}));

// Mock scanner utils
vi.mock("../server/scanner/utils", () => ({
  CLAUDE_DIR: "/tmp/.claude",
  entityId: (p: string) => p.replace(/[^a-z0-9]/gi, "").slice(0, 16).padEnd(16, "0"),
  normPath: (...args: string[]) => args.join("/"),
  decodeProjectKey: (k: string) => k,
  dirExists: () => true,
  fileExists: () => false,
  readMessageTimeline: () => [],
  extractMessageText: () => "",
  extractToolNames: () => [],
  readHead: () => "",
  readTailTs: () => null,
  extractText: () => "",
}));

// Mock deep-search
vi.mock("../server/scanner/deep-search", () => ({
  deepSearch: vi.fn(async () => ({ results: [], totalMatches: 0, scannedSessions: 0, timings: {} })),
}));

// Mock session-analytics
vi.mock("../server/scanner/session-analytics", () => ({
  getCostAnalytics: vi.fn(() => ({})),
  getFileHeatmap: vi.fn(() => []),
  getHealthAnalytics: vi.fn(() => ({})),
  getSessionCost: vi.fn(() => ({})),
  getStaleAnalytics: vi.fn(() => ({})),
}));

// Mock commit-linker
vi.mock("../server/scanner/commit-linker", () => ({
  getSessionCommits: vi.fn(() => []),
}));

// Mock project-dashboard
vi.mock("../server/scanner/project-dashboard", () => ({
  getProjectDashboards: vi.fn(() => []),
}));

// Mock session-diffs
vi.mock("../server/scanner/session-diffs", () => ({
  getSessionDiffs: vi.fn(() => []),
}));

// Mock weekly-digest
vi.mock("../server/scanner/weekly-digest", () => ({
  generateWeeklyDigest: vi.fn(),
}));

// Mock auto-workflows
vi.mock("../server/scanner/auto-workflows", () => ({
  runAutoWorkflows: vi.fn(),
}));

// Mock file-timeline
vi.mock("../server/scanner/file-timeline", () => ({
  getFileTimeline: vi.fn(() => []),
}));

// Mock nl-query
vi.mock("../server/scanner/nl-query", () => ({
  runNLQuery: vi.fn(),
}));

// Mock continuation-detector
vi.mock("../server/scanner/continuation-detector", () => ({
  getContinuationBrief: vi.fn(() => null),
}));

// Mock bash-knowledge
vi.mock("../server/scanner/bash-knowledge", () => ({
  getBashKnowledgeBase: vi.fn(() => ({ commands: [], stats: {} })),
  searchBashCommands: vi.fn(() => []),
}));

// Mock nerve-center
vi.mock("../server/scanner/nerve-center", () => ({
  getNerveCenterData: vi.fn(() => ({ services: [] })),
}));

// Mock storage
vi.mock("../server/storage", () => ({
  storage: {
    getSummaries: () => ({}),
    getPinnedSessions: () => [],
    getNotes: () => ({}),
    getNote: () => null,
    getEntities: () => [],
    getEntity: () => null,
    getDashboardStats: () => ({ sessions: mockStats, agents: mockAgentStats }),
  },
}));

// Mock db (used by storage)
vi.mock("../server/db", () => ({
  getDB: () => ({ entities: {}, relationships: [], backups: [], scanStatus: {}, settings: {} }),
  save: vi.fn(),
}));

// Mock gray-matter for agents
vi.mock("gray-matter", () => ({
  default: Object.assign(
    (raw: string) => ({ content: raw, data: {} }),
    { stringify: (content: string, _data: unknown) => content }
  ),
}));

// Now import the routers
import agentsRouter from "../server/routes/agents";
import sessionsRouter from "../server/routes/sessions";

// --- Test setup ---

let app: express.Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(agentsRouter);
  app.use(sessionsRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
});

// --- Helper ---
async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, opts);
}

// ===== Agent Definition Tests =====

describe("GET /api/agents/definitions", () => {
  it("returns 200 with array", async () => {
    const res = await api("GET", "/api/agents/definitions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe("Test Agent");
  });
});

describe("GET /api/agents/definitions/:id", () => {
  it("returns 404 for non-existent definition", async () => {
    const res = await api("GET", "/api/agents/definitions/nonexistent-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Definition not found");
  });
});

describe("PUT /api/agents/definitions/:id", () => {
  it("returns 404 for non-existent definition", async () => {
    const res = await api("PUT", "/api/agents/definitions/nonexistent-id", { content: "new content" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Definition not found");
  });

  it("returns 400 for missing content", async () => {
    const res = await api("PUT", `/api/agents/definitions/${mockDefinitions[0].id}`, {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("content required");
  });
});

describe("POST /api/agents/definitions", () => {
  it("returns 400 for missing name", async () => {
    const res = await api("POST", "/api/agents/definitions", { description: "no name" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("name required");
  });

  it("returns 400 for name too long", async () => {
    const res = await api("POST", "/api/agents/definitions", { name: "x".repeat(101) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("name too long (max 100)");
  });
});

// ===== Agent Execution Tests =====

describe("GET /api/agents/executions", () => {
  it("returns 200 with array", async () => {
    const res = await api("GET", "/api/agents/executions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("rejects invalid limit", async () => {
    const res = await api("GET", "/api/agents/executions?limit=5000");
    expect(res.status).toBe(400);
  });
});

// ===== Agent Stats Tests =====

describe("GET /api/agents/stats", () => {
  it("returns 200 with stats object", async () => {
    const res = await api("GET", "/api/agents/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totalExecutions");
    expect(body).toHaveProperty("totalDefinitions");
    expect(body).toHaveProperty("sessionsWithAgents");
    expect(body).toHaveProperty("byType");
    expect(body).toHaveProperty("byModel");
  });
});

// ===== Session Tests =====

describe("GET /api/sessions", () => {
  it("returns 200 with expected shape", async () => {
    const res = await api("GET", "/api/sessions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sessions");
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("pagination");
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it("rejects invalid sort field", async () => {
    const res = await api("GET", "/api/sessions?sort=invalid");
    expect(res.status).toBe(400);
  });

  it("rejects limit > 200", async () => {
    const res = await api("GET", "/api/sessions?limit=500");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sessions/search", () => {
  it("returns 400 when q is missing", async () => {
    const res = await api("GET", "/api/sessions/search");
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid search", async () => {
    const res = await api("GET", "/api/sessions/search?q=hello");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns 400 for invalid UUID", async () => {
    const res = await api("GET", "/api/sessions/not-a-valid-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid session ID format");
  });

  it("returns 404 for valid UUID that doesn't exist", async () => {
    const res = await api("GET", "/api/sessions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });
});

// === Removed routes — dead UI elements cleanup ===

describe("removed delegation routes", () => {
  it("POST /api/sessions/delegate returns 404 (route removed)", async () => {
    const res = await api("POST", "/api/sessions/delegate", { sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", target: "terminal" });
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/:id/context returns 404 (route removed)", async () => {
    const res = await api("GET", "/api/sessions/a1b2c3d4-e5f6-7890-abcd-ef1234567890/context");
    expect(res.status).toBe(404);
  });
});

describe("removed summarize routes", () => {
  it("POST /api/sessions/:id/summarize returns 404 (route removed)", async () => {
    const res = await api("POST", "/api/sessions/a1b2c3d4-e5f6-7890-abcd-ef1234567890/summarize");
    expect(res.status).toBe(404);
  });

  it("POST /api/sessions/summarize-batch returns 404 (route removed)", async () => {
    const res = await api("POST", "/api/sessions/summarize-batch");
    expect(res.status).toBe(404);
  });
});

describe("removed decisions routes", () => {
  it("POST /api/sessions/decisions/extract/:id returns 404 (route removed)", async () => {
    const res = await api("POST", "/api/sessions/decisions/extract/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/decisions has no dedicated route (falls through to :id handler)", async () => {
    const res = await api("GET", "/api/sessions/decisions");
    // "decisions" is not a valid session UUID, so the :id handler returns 400
    expect(res.status).toBe(400);
  });
});
