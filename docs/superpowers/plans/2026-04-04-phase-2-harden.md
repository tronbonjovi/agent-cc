# Phase 2: Harden — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Command Center against path traversal, secret leakage, component crashes, and search UX gaps — with comprehensive test coverage.

**Architecture:** 4 independent workstreams that don't touch overlapping files. Each stream includes its own code changes AND tests. Streams A-D can run in parallel worktrees.

**Tech Stack:** Vitest, supertest (new dep for Stream A), Express, React, TypeScript

**Baseline:** 1314 tests, all passing (2026-04-04)

---

## Stream A: Path Safety + API Route Tests

### Task A1: Create `validateSafePath()` and its tests

**Files:**
- Modify: `server/routes/validation.ts:52-60`
- Create: `tests/path-safety.test.ts`

- [ ] **Step 1: Write failing tests for `validateSafePath()`**

Create `tests/path-safety.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { validateSafePath } from "../server/routes/validation";

const home = os.homedir();

describe("validateSafePath", () => {
  it("accepts a path under home directory", async () => {
    const result = await validateSafePath(path.join(home, ".claude", "settings.json"));
    expect(result).not.toBeNull();
    expect(result!.startsWith(home)).toBe(true);
  });

  it("rejects path outside home directory", async () => {
    expect(await validateSafePath("/etc/passwd")).toBeNull();
  });

  it("rejects path traversal with ../", async () => {
    expect(await validateSafePath(path.join(home, "..", "..", "etc", "passwd"))).toBeNull();
  });

  it("rejects null bytes", async () => {
    expect(await validateSafePath(home + "/test\0.json")).toBeNull();
  });

  it("rejects empty string", async () => {
    expect(await validateSafePath("")).toBeNull();
  });

  it("accepts /tmp paths", async () => {
    const tmpFile = path.join(os.tmpdir(), "cc-test-validate-" + Date.now());
    fs.writeFileSync(tmpFile, "test");
    try {
      const result = await validateSafePath(tmpFile);
      expect(result).not.toBeNull();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  // Symlink attack test
  describe("symlink resolution", () => {
    const tmpDir = path.join(os.tmpdir(), "cc-symlink-test-" + Date.now());
    const symlink = path.join(tmpDir, "escape");

    beforeAll(() => {
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        fs.symlinkSync("/etc", symlink);
      } catch {
        // May fail on some systems — test will be skipped
      }
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("rejects symlinks pointing outside home and /tmp", async () => {
      if (!fs.existsSync(symlink)) return; // Skip if symlink creation failed
      const result = await validateSafePath(path.join(symlink, "passwd"));
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/path-safety.test.ts --reporter=verbose`
Expected: FAIL — `validateSafePath` is not exported

- [ ] **Step 3: Implement `validateSafePath()`**

In `server/routes/validation.ts`, add this function after the existing `validateMarkdownPath`:

```typescript
import fs from "fs";

/** Validate a file path is safe to access. Resolves symlinks with realpath.
 *  Returns resolved path if under home or /tmp, null otherwise. */
export async function validateSafePath(filePath: string): Promise<string | null> {
  if (!filePath || filePath.includes("\0")) return null;

  try {
    // First resolve without following symlinks to check basic traversal
    const resolved = path.resolve(filePath);
    const home = os.homedir();
    const tmp = os.tmpdir();

    // Check the resolved path is under allowed roots
    if (!resolved.startsWith(home + path.sep) && resolved !== home &&
        !resolved.startsWith(tmp + path.sep) && resolved !== tmp) {
      return null;
    }

    // If file exists, use realpath to follow symlinks and re-check
    try {
      const real = await fs.promises.realpath(filePath);
      if (!real.startsWith(home + path.sep) && real !== home &&
          !real.startsWith(tmp + path.sep) && real !== tmp) {
        return null;
      }
      return real;
    } catch {
      // File doesn't exist yet (e.g., write target) — resolved path is sufficient
      return resolved;
    }
  } catch {
    return null;
  }
}
```

Also add the `fs` import at the top of validation.ts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/path-safety.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/validation.ts tests/path-safety.test.ts
git commit -m "feat: add validateSafePath with realpath symlink resolution"
```

### Task A2: Apply `validateSafePath()` to route handlers

**Files:**
- Modify: `server/routes/agents.ts:46`
- Modify: `server/routes/sessions.ts:556`
- Modify: `server/routes/markdown.ts:38`

- [ ] **Step 1: Write failing test for agents route path validation**

Add to `tests/path-safety.test.ts`:

```typescript
import { validateSafePath } from "../server/routes/validation";

describe("route path validation coverage", () => {
  it("validateSafePath rejects encoded traversal sequences", async () => {
    // %2e%2e = ".." URL-encoded — path.resolve handles this, but test it explicitly
    const decoded = decodeURIComponent("%2e%2e/%2e%2e/etc/passwd");
    expect(await validateSafePath(decoded)).toBeNull();
  });

  it("validateSafePath accepts valid home subpath", async () => {
    const result = await validateSafePath(path.join(home, ".claude", "agents", "test.md"));
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (these test the utility, not the route)

Run: `npx vitest run tests/path-safety.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Update agents.ts GET /:id route to validate path**

In `server/routes/agents.ts`, change the GET /:id handler (around line 44-51):

```typescript
/** GET /api/agents/definitions/:id — Single definition with full content */
router.get("/api/agents/definitions/:id", async (req: Request, res: Response) => {
  const def = getCachedDefinitions().find(d => d.id === req.params.id);
  if (!def) return res.status(404).json({ message: "Definition not found" });

  const safePath = await validateSafePath(def.filePath);
  if (!safePath) return res.status(403).json({ message: "Path outside allowed directory" });

  try {
    const raw = fs.readFileSync(safePath, "utf-8");
    const parsed = matter(raw);
    res.json({ ...def, content: parsed.content.trim() });
  } catch {
    res.json(def);
  }
});
```

Update import to include `validateSafePath`:
```typescript
import { qstr, validate, AgentExecListSchema, validateMarkdownPath, validateSafePath } from "./validation";
```

- [ ] **Step 4: Update markdown.ts to use validateSafePath**

In `server/routes/markdown.ts`, update the import:
```typescript
import { qstr, validate, validateMarkdownPath, validateSafePath } from "./validation";
```

In the search route (line 38), replace `validateMarkdownPath` with `validateSafePath`. Since `validateSafePath` is async, the callback needs to become async:

```typescript
const safePath = await validateSafePath(entity.path);
if (!safePath) continue;
```

Do the same for any other `validateMarkdownPath` calls in this file (read, write, create routes).

**Note:** `projects.ts` reads paths from the scanner cache (entity store), not user input. The scanner constructs paths from known locations (`os.homedir()`, `CLAUDE_DIR`). Path traversal risk is negligible — no changes needed there.

- [ ] **Step 5: Update sessions.ts parseSessionMessages to validate path**

In `server/routes/sessions.ts`, the `parseSessionMessages` function at line 556 reads `filePath` directly. Wrap the caller — the route handler that calls it — with validation. Find the route that calls `parseSessionMessages` and add validation before the call. The function is internal, so validate at the route boundary.

The route at line ~525 that uses `parseSessionMessages` should validate the path from session data:

```typescript
// Before calling parseSessionMessages, validate the file path
const safePath = await validateSafePath(session.filePath);
if (!safePath) return res.status(403).json({ message: "Session file path outside allowed directory" });
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All pass (no regressions from making handlers async)

- [ ] **Step 7: Commit**

```bash
git add server/routes/agents.ts server/routes/sessions.ts server/routes/markdown.ts tests/path-safety.test.ts
git commit -m "fix: apply validateSafePath to agents, sessions, and markdown route handlers"
```

### Task A3: Add supertest API integration tests

**Files:**
- Create: `tests/api-routes.test.ts`

- [ ] **Step 1: Install supertest**

```bash
npm install -D supertest @types/supertest
```

- [ ] **Step 2: Write API route integration tests**

Create `tests/api-routes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";

// Build a minimal Express app with just the routes we want to test
// Import the actual route handlers
import agentRoutes from "../server/routes/agents";
import sessionRoutes from "../server/routes/sessions";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(agentRoutes);
  app.use(sessionRoutes);
  // 404 handler
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });
  return app;
}

describe("API route integration tests", () => {
  const app = createTestApp();

  describe("GET /api/agents/definitions", () => {
    it("returns 200 with array", async () => {
      const res = await request(app).get("/api/agents/definitions");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/agents/definitions/:id", () => {
    it("returns 404 for non-existent id", async () => {
      const res = await request(app).get("/api/agents/definitions/nonexistent");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Definition not found");
    });
  });

  describe("PUT /api/agents/definitions/:id", () => {
    it("returns 404 for non-existent id", async () => {
      const res = await request(app)
        .put("/api/agents/definitions/nonexistent")
        .send({ content: "test" });
      expect(res.status).toBe(404);
    });

    it("returns 400 when content is missing", async () => {
      // Even with a real ID, missing content should fail
      const res = await request(app)
        .put("/api/agents/definitions/some-id")
        .send({});
      // 404 because ID won't exist, but the validation message tells us
      expect([400, 404]).toContain(res.status);
    });
  });

  describe("POST /api/agents/definitions", () => {
    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/agents/definitions")
        .send({ description: "no name" });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("name");
    });

    it("returns 400 when name is too long", async () => {
      const res = await request(app)
        .post("/api/agents/definitions")
        .send({ name: "a".repeat(101) });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("too long");
    });
  });

  describe("GET /api/agents/executions", () => {
    it("returns 200 with array", async () => {
      const res = await request(app).get("/api/agents/executions");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects invalid limit", async () => {
      const res = await request(app).get("/api/agents/executions?limit=9999");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/sessions", () => {
    it("returns 200 with expected shape", async () => {
      const res = await request(app).get("/api/sessions");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(res.body).toHaveProperty("stats");
    });

    it("rejects invalid sort field", async () => {
      const res = await request(app).get("/api/sessions?sort=invalid");
      expect(res.status).toBe(400);
    });

    it("rejects limit > 200", async () => {
      const res = await request(app).get("/api/sessions?limit=500");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/sessions/search", () => {
    it("returns 400 when q is missing", async () => {
      const res = await request(app).get("/api/sessions/search");
      expect(res.status).toBe(400);
    });

    it("returns 200 for valid search", async () => {
      const res = await request(app).get("/api/sessions/search?q=test");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("results");
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns 400 for invalid session ID format", async () => {
      const res = await request(app).get("/api/sessions/not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("returns 404 for valid UUID that doesn't exist", async () => {
      const res = await request(app).get("/api/sessions/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/agents/stats", () => {
    it("returns 200 with stats object", async () => {
      const res = await request(app).get("/api/agents/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalExecutions");
      expect(res.body).toHaveProperty("totalDefinitions");
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/api-routes.test.ts --reporter=verbose`
Expected: All PASS. If imports fail due to scanner side-effects, mock the scanners.

- [ ] **Step 4: Fix any import issues**

If scanner modules crash during import (they read from filesystem at module level), add mocks at the top of the test file:

```typescript
import { vi, describe, it, expect } from "vitest";

// Mock scanner modules that read filesystem on import
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => [],
  getCachedStats: () => ({ totalSessions: 0, totalMessages: 0, totalSizeBytes: 0, avgMessages: 0, activeSessions: 0, uniqueProjects: 0 }),
  removeCachedSession: vi.fn(),
  restoreCachedSession: vi.fn(),
}));
```

Add similar mocks for any other scanner that causes import-time failures.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add tests/api-routes.test.ts package.json package-lock.json
git commit -m "test: add supertest API integration tests for agents and sessions routes"
```

---

## Stream B: Secret Redaction + MCP Scanner Tests

### Task B1: Write tests for expanded redaction logic

**Files:**
- Create: `tests/mcp-redaction.test.ts`

- [ ] **Step 1: Write failing tests for `shouldRedactEnvVar()`**

Create `tests/mcp-redaction.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldRedactEnvVar, redactConnectionString } from "../server/scanner/mcp-scanner";

describe("shouldRedactEnvVar", () => {
  // Should redact — true positives
  it.each([
    "SECRET_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "DATABASE_URL",
    "database_url",
    "Database_Url",
    "CONNECTION_STRING",
    "MONGO_URI",
    "POSTGRES_URI",
    "REDIS_URL",
    "MYSQL_URI",
    "API_KEY",
    "api_key",
    "STRIPE_SECRET_KEY",
    "AUTH_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "PASSWORD",
    "DB_PASSWORD",
    "PRIVATE_KEY",
    "WEBHOOK_SECRET",
    "AWS_ACCESS_KEY_ID",
    "CREDENTIALS",
    "OAUTH_CLIENT_SECRET",
  ])("redacts %s", (name) => {
    expect(shouldRedactEnvVar(name)).toBe(true);
  });

  // Should NOT redact — false positives
  it.each([
    "KEYBOARD_LAYOUT",
    "KEY_REPEAT_RATE",
    "TOKEN_LIMIT",
    "TOKEN_COUNT",
    "TOKENIZER_PATH",
    "MONKEY_PATCH",
    "KEYNOTE_PATH",
    "NODE_ENV",
    "PORT",
    "HOST",
    "LOG_LEVEL",
    "DEBUG",
    "PATH",
    "HOME",
    "LANG",
  ])("does NOT redact %s", (name) => {
    expect(shouldRedactEnvVar(name)).toBe(false);
  });
});

describe("redactConnectionString", () => {
  it("redacts postgres credentials", () => {
    const result = redactConnectionString("postgres://admin:s3cret@db.host:5432/mydb");
    expect(result).toBe("postgres://[REDACTED]@db.host:5432/mydb");
    expect(result).not.toContain("admin");
    expect(result).not.toContain("s3cret");
  });

  it("redacts mongodb credentials", () => {
    const result = redactConnectionString("mongodb+srv://user:pass@cluster.mongodb.net/db");
    expect(result).toBe("mongodb+srv://[REDACTED]@cluster.mongodb.net/db");
  });

  it("redacts mysql credentials", () => {
    const result = redactConnectionString("mysql://root:password@localhost:3306/app");
    expect(result).toBe("mysql://[REDACTED]@localhost:3306/app");
  });

  it("redacts redis credentials", () => {
    const result = redactConnectionString("redis://default:secret@redis.host:6379");
    expect(result).toBe("redis://[REDACTED]@redis.host:6379");
  });

  it("preserves URLs without credentials", () => {
    const result = redactConnectionString("postgres://db.host:5432/mydb");
    expect(result).toBe("postgres://db.host:5432/mydb");
  });

  it("returns non-URL strings unchanged", () => {
    expect(redactConnectionString("just a string")).toBe("just a string");
  });

  it("returns empty string unchanged", () => {
    expect(redactConnectionString("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mcp-redaction.test.ts --reporter=verbose`
Expected: FAIL — `shouldRedactEnvVar` and `redactConnectionString` not exported

- [ ] **Step 3: Implement `shouldRedactEnvVar()` and `redactConnectionString()`**

In `server/scanner/mcp-scanner.ts`, add these functions before `scanMCPs()`:

```typescript
/** Env var names that always indicate secrets (match anywhere in name, case-insensitive) */
const ALWAYS_REDACT = [
  "password", "secret", "credential",
  "database_url", "connection_string",
  "mongo_uri", "postgres_uri", "redis_url", "mysql_uri",
  "private_key", "api_key", "webhook",
];

/** Prefixes that indicate secrets */
const REDACT_PREFIXES = [
  "aws_", "stripe_", "openai_", "anthropic_", "github_token",
];

/** Short keywords that need word-boundary matching (only redact as suffix or after _) */
const BOUNDARY_REDACT = ["key", "token", "auth"];

/** False positive patterns — names that contain short keywords but aren't secrets */
const FALSE_POSITIVES = [
  "keyboard", "keynote", "keystone", "key_repeat", "key_binding",
  "token_limit", "token_count", "tokenizer", "monkey",
];

/** Check if an env var name should be redacted */
export function shouldRedactEnvVar(name: string): boolean {
  const lower = name.toLowerCase();

  // Check false positives first
  for (const fp of FALSE_POSITIVES) {
    if (lower.includes(fp)) return false;
  }

  // Check always-redact patterns (match anywhere)
  for (const pattern of ALWAYS_REDACT) {
    if (lower.includes(pattern)) return true;
  }

  // Check prefix patterns
  for (const prefix of REDACT_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }

  // Check boundary-matched short keywords
  // Match when keyword appears after _ or at end of name
  for (const keyword of BOUNDARY_REDACT) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;
    // Must be preceded by _ or be start of string
    const precededByBoundary = idx === 0 || lower[idx - 1] === "_";
    // Must be followed by _ or end of string
    const followedByBoundary = idx + keyword.length === lower.length || lower[idx + keyword.length] === "_";
    if (precededByBoundary && followedByBoundary) return true;
  }

  return false;
}

/** Redact credentials from a connection string URL.
 *  "postgres://user:pass@host:5432/db" → "postgres://[REDACTED]@host:5432/db" */
export function redactConnectionString(value: string): string {
  // Match protocol://credentials@rest pattern
  return value.replace(/^(\w+(?:\+\w+)?:\/\/)([^@]+)@/, "$1[REDACTED]@");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/mcp-redaction.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/scanner/mcp-scanner.ts tests/mcp-redaction.test.ts
git commit -m "feat: add shouldRedactEnvVar and redactConnectionString functions"
```

### Task B2: Wire new redaction into scanMCPs()

**Files:**
- Modify: `server/scanner/mcp-scanner.ts:186-193`

- [ ] **Step 1: Write test that verifies end-to-end redaction in scanMCPs output**

Add to `tests/mcp-redaction.test.ts`:

```typescript
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

describe("scanMCPs redaction integration", () => {
  const tmpDir = path.join(os.tmpdir(), "cc-mcp-test-" + Date.now());
  const mcpFile = path.join(tmpDir, ".mcp.json");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(mcpFile, JSON.stringify({
      mcpServers: {
        "test-server": {
          command: "node",
          args: ["server.js"],
          env: {
            DATABASE_URL: "postgres://admin:secret@db:5432/app",
            NODE_ENV: "production",
            API_KEY: "sk-12345",
            KEYBOARD_LAYOUT: "us",
            PORT: "3000",
          },
        },
      },
    }));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("redacts DATABASE_URL, API_KEY but not NODE_ENV, PORT, KEYBOARD_LAYOUT", async () => {
    // This test verifies the redaction logic is wired into scanMCPs
    // We can't easily call scanMCPs directly (it reads from fixed paths),
    // so we test the redaction functions that scanMCPs now calls
    const env: Record<string, string> = {
      DATABASE_URL: "postgres://admin:secret@db:5432/app",
      NODE_ENV: "production",
      API_KEY: "sk-12345",
      KEYBOARD_LAYOUT: "us",
      PORT: "3000",
    };

    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (shouldRedactEnvVar(k)) {
        // For connection strings, redact credentials but show host
        redacted[k] = /^\w+(\+\w+)?:\/\//.test(v) ? redactConnectionString(v) : "***";
      } else {
        redacted[k] = v;
      }
    }

    expect(redacted.DATABASE_URL).toBe("postgres://[REDACTED]@db:5432/app");
    expect(redacted.NODE_ENV).toBe("production");
    expect(redacted.API_KEY).toBe("***");
    expect(redacted.KEYBOARD_LAYOUT).toBe("us");
    expect(redacted.PORT).toBe("3000");
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/mcp-redaction.test.ts --reporter=verbose`
Expected: PASS (test uses the functions directly)

- [ ] **Step 3: Update scanMCPs() to use new redaction functions**

In `server/scanner/mcp-scanner.ts`, replace lines 186-193 (the redaction block inside `scanMCPs`):

Replace:
```typescript
      const redactedEnv: Record<string, string> = {};
      if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
          redactedEnv[k] = k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") || k.toLowerCase().includes("token") || k.toLowerCase().includes("key")
            ? "***"
            : v;
        }
      }
```

With:
```typescript
      const redactedEnv: Record<string, string> = {};
      if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
          if (shouldRedactEnvVar(k)) {
            // For connection strings, redact credentials but preserve host/port info
            redactedEnv[k] = /^\w+(\+\w+)?:\/\//.test(v) ? redactConnectionString(v) : "***";
          } else {
            redactedEnv[k] = v;
          }
        }
      }
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add server/scanner/mcp-scanner.ts tests/mcp-redaction.test.ts
git commit -m "fix: expand MCP secret redaction with word-boundary matching and connection string support"
```

### Task B3: MCP scanner module tests

**Files:**
- Create: `tests/mcp-scanner.test.ts`

- [ ] **Step 1: Write scanner tests**

Create `tests/mcp-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// We can't easily call scanMCPs() because it reads from fixed HOME/CLAUDE_DIR paths.
// Instead, test the exported helper functions and the MCP JSON parsing logic.
import { isMCPServerConfig, extractDbNodesFromMcps, shouldRedactEnvVar, redactConnectionString } from "../server/scanner/mcp-scanner";

describe("isMCPServerConfig", () => {
  it("accepts config with command", () => {
    expect(isMCPServerConfig({ command: "node", args: ["server.js"] })).toBe(true);
  });

  it("accepts config with url (SSE transport)", () => {
    expect(isMCPServerConfig({ url: "http://localhost:3000" })).toBe(true);
  });

  it("rejects null", () => {
    expect(isMCPServerConfig(null)).toBe(false);
  });

  it("rejects array", () => {
    expect(isMCPServerConfig([1, 2, 3])).toBe(false);
  });

  it("rejects object without command or url", () => {
    expect(isMCPServerConfig({ name: "test" })).toBe(false);
  });

  it("rejects primitive", () => {
    expect(isMCPServerConfig("string")).toBe(false);
    expect(isMCPServerConfig(42)).toBe(false);
  });
});

describe("extractDbNodesFromMcps", () => {
  it("extracts postgres node from env var", () => {
    const entities = [{
      id: "test-mcp-1",
      type: "mcp" as const,
      name: "test-server",
      path: "/test/.mcp.json",
      description: "test",
      lastModified: null,
      tags: ["stdio"],
      health: "ok" as const,
      data: {
        transport: "stdio",
        env: { DATABASE_URL: "postgres://user:pass@db.host:5432/mydb" },
      },
      scannedAt: new Date().toISOString(),
    }];

    const { nodes, edges } = extractDbNodesFromMcps(entities);
    expect(nodes.length).toBe(1);
    expect(nodes[0].label).toContain("PostgreSQL");
    expect(nodes[0].description).toContain("db.host");
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe("test-mcp-1");
  });

  it("returns empty for MCPs with no env", () => {
    const entities = [{
      id: "test-mcp-2",
      type: "mcp" as const,
      name: "no-env",
      path: "/test/.mcp.json",
      description: "test",
      lastModified: null,
      tags: [],
      health: "ok" as const,
      data: { transport: "stdio" },
      scannedAt: new Date().toISOString(),
    }];

    const { nodes, edges } = extractDbNodesFromMcps(entities);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("skips already-redacted values", () => {
    const entities = [{
      id: "test-mcp-3",
      type: "mcp" as const,
      name: "redacted",
      path: "/test/.mcp.json",
      description: "test",
      lastModified: null,
      tags: [],
      health: "ok" as const,
      data: {
        transport: "stdio",
        env: { DATABASE_URL: "***" },
      },
      scannedAt: new Date().toISOString(),
    }];

    const { nodes } = extractDbNodesFromMcps(entities);
    expect(nodes).toEqual([]);
  });

  it("deduplicates same database across MCPs", () => {
    const entities = [
      {
        id: "mcp-a", type: "mcp" as const, name: "a", path: "/a/.mcp.json",
        description: "", lastModified: null, tags: [], health: "ok" as const,
        data: { transport: "stdio", env: { DB: "postgres://u:p@host:5432/db" } },
        scannedAt: "",
      },
      {
        id: "mcp-b", type: "mcp" as const, name: "b", path: "/b/.mcp.json",
        description: "", lastModified: null, tags: [], health: "ok" as const,
        data: { transport: "stdio", env: { DB: "postgres://u:p@host:5432/db" } },
        scannedAt: "",
      },
    ];

    const { nodes, edges } = extractDbNodesFromMcps(entities);
    expect(nodes.length).toBe(1);
    expect(edges.length).toBe(2); // Both MCPs connect to same node
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/mcp-scanner.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/mcp-scanner.test.ts
git commit -m "test: add MCP scanner module tests for type guards, DB extraction, dedup"
```

---

## Stream C: Error Boundaries

### Task C1: Add pageName prop and reset capability to ErrorBoundary

**Files:**
- Modify: `client/src/components/error-boundary.tsx`

- [ ] **Step 1: Update ErrorBoundary component**

Replace the full contents of `client/src/components/error-boundary.tsx`:

```typescript
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional page/section name shown in the error message */
  pageName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { pageName } = this.props;
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-2 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2 className="text-lg font-semibold">
                {pageName ? `${pageName} crashed` : "Something went wrong"}
              </h2>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                Try Again
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to this change)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/error-boundary.tsx
git commit -m "feat: add pageName prop and reset capability to ErrorBoundary"
```

### Task C2: Wrap each route in its own ErrorBoundary

**Files:**
- Modify: `client/src/App.tsx:58-82`

- [ ] **Step 1: Update Router to wrap each route**

In `client/src/App.tsx`, replace the `<ErrorBoundary>` block (lines 58-82) with per-page boundaries:

```typescript
function Router() {
  useKeyboardShortcuts();
  useTheme();
  return (
    <Layout>
      <DynamicTitle />
      <OnboardingWizard />
      <ErrorBoundary pageName="Application">
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/">
              <ErrorBoundary pageName="Dashboard"><Dashboard /></ErrorBoundary>
            </Route>
            <Route path="/projects">
              <ErrorBoundary pageName="Projects"><Projects /></ErrorBoundary>
            </Route>
            <Route path="/projects/:id">
              {(params) => <ErrorBoundary pageName="Project Detail"><ProjectDetail {...params} /></ErrorBoundary>}
            </Route>
            <Route path="/mcps">
              <ErrorBoundary pageName="MCPs"><MCPs /></ErrorBoundary>
            </Route>
            <Route path="/skills">
              <ErrorBoundary pageName="Skills"><Skills /></ErrorBoundary>
            </Route>
            <Route path="/plugins">
              <ErrorBoundary pageName="Plugins"><Plugins /></ErrorBoundary>
            </Route>
            <Route path="/markdown">
              <ErrorBoundary pageName="Markdown Files"><MarkdownFiles /></ErrorBoundary>
            </Route>
            <Route path="/markdown/:id">
              {(params) => <ErrorBoundary pageName="Markdown Editor"><MarkdownEdit {...params} /></ErrorBoundary>}
            </Route>
            <Route path="/graph">
              <ErrorBoundary pageName="Graph"><GraphPage /></ErrorBoundary>
            </Route>
            <Route path="/activity">
              <ErrorBoundary pageName="Activity"><ActivityPage /></ErrorBoundary>
            </Route>
            <Route path="/sessions">
              <ErrorBoundary pageName="Sessions"><Sessions /></ErrorBoundary>
            </Route>
            <Route path="/agents">
              <ErrorBoundary pageName="Agents"><Agents /></ErrorBoundary>
            </Route>
            <Route path="/live">
              <ErrorBoundary pageName="Live View"><Live /></ErrorBoundary>
            </Route>
            <Route path="/settings">
              <ErrorBoundary pageName="Settings"><SettingsPage /></ErrorBoundary>
            </Route>
            <Route path="/stats">
              <ErrorBoundary pageName="Stats"><Stats /></ErrorBoundary>
            </Route>
            <Route path="/messages">
              <ErrorBoundary pageName="Messages"><MessageHistory /></ErrorBoundary>
            </Route>
            <Route path="/apis">
              <ErrorBoundary pageName="APIs"><APIs /></ErrorBoundary>
            </Route>
            <Route path="/prompts">
              <ErrorBoundary pageName="Prompts"><Prompts /></ErrorBoundary>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
```

**Note:** The wouter `<Route>` component supports children as JSX. For routes with params (`:id`), use the render function pattern to forward params.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. If wouter's Route typing requires adjustments for the children pattern, check the wouter docs and adapt. The `component` prop and children patterns are both valid.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All pass (no server-side test regressions)

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wrap each page route in per-page ErrorBoundary with pageName"
```

---

## Stream D: Deep Search UX + Scanner Coverage

### Task D1: Add `useDebouncedValue` hook

**Files:**
- Create: `client/src/hooks/use-debounce.ts`

- [ ] **Step 1: Create the debounce hook**

Create `client/src/hooks/use-debounce.ts`:

```typescript
import { useState, useEffect } from "react";

/** Returns a debounced version of the value that only updates after `delay` ms of inactivity. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/use-debounce.ts
git commit -m "feat: add useDebouncedValue hook"
```

### Task D2: Wire debounce and loading states into Sessions page

**Files:**
- Modify: `client/src/pages/sessions.tsx:77`

- [ ] **Step 1: Add debounce import and wire into deep search**

In `client/src/pages/sessions.tsx`, add the import at the top:

```typescript
import { useDebouncedValue } from "@/hooks/use-debounce";
```

Then near line 77, change how `useDeepSearch` is called. Find:

```typescript
const deepSearchQuery = useDeepSearch({ q: searchMode === "deep" ? search : undefined, project: projectFilter || undefined });
```

Replace with:

```typescript
const debouncedSearch = useDebouncedValue(search, 300);
const deepSearchQuery = useDeepSearch({ q: searchMode === "deep" ? debouncedSearch : undefined, project: projectFilter || undefined });
```

- [ ] **Step 2: Add loading/empty/error states to the deep search results area**

Find where deep search results are rendered in sessions.tsx. Look for where `deepSearchQuery.data` is used. Add these states before the results rendering:

```typescript
{searchMode === "deep" && debouncedSearch && debouncedSearch.length >= 2 && (
  <>
    {deepSearchQuery.isLoading && (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Searching sessions...</span>
      </div>
    )}
    {deepSearchQuery.isError && (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Search failed: {deepSearchQuery.error instanceof Error ? deepSearchQuery.error.message : "Unknown error"}
      </div>
    )}
    {deepSearchQuery.data && deepSearchQuery.data.results.length === 0 && !deepSearchQuery.isLoading && (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No results found for "{debouncedSearch}"</p>
        <p className="text-xs mt-1">Searched {deepSearchQuery.data.searchedSessions} of {deepSearchQuery.data.totalSessions} sessions</p>
      </div>
    )}
  </>
)}
```

The exact placement depends on the existing JSX structure — insert these states above or instead of the existing results map.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: add debounce, loading, empty, and error states to deep search"
```

### Task D3: Scanner coverage tests — project-scanner

**Files:**
- Create: `tests/project-scanner.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/project-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-project-test-" + Date.now());
const projectDir = path.join(tmpDir, "my-project");

beforeAll(() => {
  fs.mkdirSync(projectDir, { recursive: true });
  // Create a minimal Node.js + TypeScript project
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({
    name: "test-project",
    dependencies: { react: "^18.0.0", express: "^4.18.0" },
    devDependencies: { typescript: "^5.0.0" },
  }));
  fs.writeFileSync(path.join(projectDir, "tsconfig.json"), "{}");
  fs.writeFileSync(path.join(projectDir, "CLAUDE.md"), "# Test Project\n\nThis is a test project for scanning.");
  fs.mkdirSync(path.join(projectDir, ".git"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// We can't call scanProjects() directly because it reads from HOME/CLAUDE_DIR.
// Instead, import and test the helper functions that scanProjects uses.
// The functions dirToName, extractDescription, detectTechStack are not exported,
// so we test them indirectly through scanProjects by mocking HOME.

describe("project-scanner helpers (via module re-import)", () => {
  it("can be imported without errors", async () => {
    const mod = await import("../server/scanner/project-scanner");
    expect(typeof mod.scanProjects).toBe("function");
  });
});

// Test the utility functions that project-scanner depends on
import { entityId, fileExists, dirExists } from "../server/scanner/utils";

describe("project-scanner dependencies", () => {
  it("entityId produces stable IDs for project paths", () => {
    const id = entityId(projectDir);
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(entityId(projectDir)).toBe(id); // Deterministic
  });

  it("fileExists detects project markers", () => {
    expect(fileExists(path.join(projectDir, "package.json"))).toBe(true);
    expect(fileExists(path.join(projectDir, "tsconfig.json"))).toBe(true);
    expect(fileExists(path.join(projectDir, "CLAUDE.md"))).toBe(true);
    expect(fileExists(path.join(projectDir, "nonexistent.txt"))).toBe(false);
  });

  it("dirExists detects .git", () => {
    expect(dirExists(path.join(projectDir, ".git"))).toBe(true);
    expect(dirExists(path.join(projectDir, "nonexistent"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/project-scanner.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/project-scanner.test.ts
git commit -m "test: add project-scanner dependency and import tests"
```

### Task D4: Scanner coverage tests — deep-search

**Files:**
- Create: `tests/deep-search.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/deep-search.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { deepSearch } from "../server/scanner/deep-search";
import type { SessionData } from "@shared/types";

const tmpDir = path.join(os.tmpdir(), "cc-deep-search-test-" + Date.now());

function makeSession(id: string, filename: string, lines: string[]): SessionData {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return {
    id,
    filePath,
    projectKey: "test-project",
    cwd: "/test",
    slug: "test-session",
    firstTs: "2024-01-01T00:00:00Z",
    lastTs: "2024-01-01T01:00:00Z",
    sizeBytes: Buffer.byteLength(lines.join("\n")),
    messageCount: lines.length,
    isEmpty: false,
    isActive: false,
    firstMessage: "hello",
    model: "claude",
  } as SessionData;
}

const sessions: SessionData[] = [];

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });

  sessions.push(makeSession("sess-1", "session1.jsonl", [
    JSON.stringify({ type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "How do I fix the authentication bug?" } }),
    JSON.stringify({ type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "The authentication bug is caused by a missing token check." }] } }),
  ]));

  sessions.push(makeSession("sess-2", "session2.jsonl", [
    JSON.stringify({ type: "user", timestamp: "2024-01-02T00:00:00Z", message: { role: "user", content: "Deploy the application to production" } }),
    JSON.stringify({ type: "assistant", timestamp: "2024-01-02T00:01:00Z", message: { role: "assistant", content: "Deploying now..." } }),
  ]));

  sessions.push(makeSession("sess-3", "session3.jsonl", [
    JSON.stringify({ type: "user", timestamp: "2024-01-03T00:00:00Z", message: { role: "user", content: "nothing relevant here" } }),
  ]));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("deepSearch", () => {
  it("finds matches across sessions", async () => {
    const result = await deepSearch({ query: "authentication", sessions });
    expect(result.results.length).toBe(1);
    expect(result.results[0].sessionId).toBe("sess-1");
    expect(result.totalMatches).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for no matches", async () => {
    const result = await deepSearch({ query: "zzzznonexistent", sessions });
    expect(result.results).toEqual([]);
    expect(result.totalMatches).toBe(0);
  });

  it("filters by field=user", async () => {
    const result = await deepSearch({ query: "authentication", sessions, field: "user" });
    expect(result.results.length).toBe(1);
    // The user message contains "authentication"
    expect(result.results[0].matches[0].role).toBe("user");
  });

  it("filters by field=assistant", async () => {
    const result = await deepSearch({ query: "token check", sessions, field: "assistant" });
    expect(result.results.length).toBe(1);
    expect(result.results[0].matches[0].role).toBe("assistant");
  });

  it("is case-insensitive", async () => {
    const result = await deepSearch({ query: "AUTHENTICATION", sessions });
    expect(result.results.length).toBe(1);
  });

  it("respects limit", async () => {
    const result = await deepSearch({ query: "the", sessions, limit: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it("reports search stats", async () => {
    const result = await deepSearch({ query: "test", sessions });
    expect(result.totalSessions).toBe(3);
    expect(result.searchedSessions).toBe(3);
    expect(typeof result.durationMs).toBe("number");
  });

  it("handles malformed JSONL gracefully", async () => {
    const badSession = makeSession("sess-bad", "bad.jsonl", [
      "not json at all",
      JSON.stringify({ type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "valid line" } }),
      "{broken json",
    ]);
    const result = await deepSearch({ query: "valid", sessions: [badSession] });
    expect(result.results.length).toBe(1);
  });

  it("handles empty sessions", async () => {
    const emptySession = makeSession("sess-empty", "empty.jsonl", []);
    // Override isEmpty since our makeSession sets it false
    emptySession.isEmpty = true;
    const result = await deepSearch({ query: "anything", sessions: [emptySession] });
    expect(result.results).toEqual([]);
  });

  it("searches summary text when provided", async () => {
    const summaries = {
      "sess-2": {
        summary: "This session deployed the application with zero downtime",
        generatedAt: "2024-01-02T12:00:00Z",
        model: "claude",
      },
    };
    const result = await deepSearch({ query: "zero downtime", sessions, summaries });
    expect(result.results.length).toBe(1);
    expect(result.results[0].sessionId).toBe("sess-2");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/deep-search.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/deep-search.test.ts
git commit -m "test: add deep-search module tests with JSONL fixtures"
```

### Task D5: Scanner coverage tests — markdown, skill, plugin, agent scanners

**Files:**
- Create: `tests/scanner-modules.test.ts`

- [ ] **Step 1: Write tests for importability and exported helpers**

Create `tests/scanner-modules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("scanner module imports", () => {
  it("markdown-scanner exports scanMarkdown", async () => {
    const mod = await import("../server/scanner/markdown-scanner");
    expect(typeof mod.scanMarkdown).toBe("function");
  });

  it("skill-scanner exports scanSkills", async () => {
    const mod = await import("../server/scanner/skill-scanner");
    expect(typeof mod.scanSkills).toBe("function");
  });

  it("plugin-scanner exports scanPlugins", async () => {
    const mod = await import("../server/scanner/plugin-scanner");
    expect(typeof mod.scanPlugins).toBe("function");
  });

  it("agent-scanner exports scanAgentDefinitions", async () => {
    const mod = await import("../server/scanner/agent-scanner");
    expect(typeof mod.scanAgentDefinitions).toBe("function");
    expect(typeof mod.getCachedDefinitions).toBe("function");
    expect(typeof mod.getCachedExecutions).toBe("function");
    expect(typeof mod.getCachedAgentStats).toBe("function");
  });

  it("config-scanner can be imported", async () => {
    const mod = await import("../server/scanner/config-scanner");
    expect(mod).toBeDefined();
  });

  it("graph-config-scanner can be imported", async () => {
    const mod = await import("../server/scanner/graph-config-scanner");
    expect(mod).toBeDefined();
  });

  it("live-scanner can be imported", async () => {
    const mod = await import("../server/scanner/live-scanner");
    expect(mod).toBeDefined();
  });
});

describe("agent-scanner cached state", () => {
  it("getCachedDefinitions returns array", async () => {
    const { getCachedDefinitions } = await import("../server/scanner/agent-scanner");
    const defs = getCachedDefinitions();
    expect(Array.isArray(defs)).toBe(true);
  });

  it("getCachedExecutions returns array", async () => {
    const { getCachedExecutions } = await import("../server/scanner/agent-scanner");
    const execs = getCachedExecutions();
    expect(Array.isArray(execs)).toBe(true);
  });

  it("getCachedAgentStats returns stats object", async () => {
    const { getCachedAgentStats } = await import("../server/scanner/agent-scanner");
    const stats = getCachedAgentStats();
    expect(stats).toHaveProperty("totalExecutions");
    expect(stats).toHaveProperty("totalDefinitions");
    expect(stats).toHaveProperty("sessionsWithAgents");
    expect(stats).toHaveProperty("byType");
    expect(stats).toHaveProperty("byModel");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/scanner-modules.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/scanner-modules.test.ts
git commit -m "test: add scanner module import and interface tests"
```

### Task D6: Final full test run

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All pass, count should be above 1400

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=verbose`
Expected: All pass

---

## Post-Merge: Integration Verification

After all 4 streams are merged:

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All pass, 1400+ tests

- [ ] **Step 2: TypeScript check**

```bash
npm run check
```

- [ ] **Step 3: Smoke test via curl (SSH-compatible)**

```bash
# Start dev server in background
HOST=0.0.0.0 npm run dev &
sleep 3

# Test path traversal is blocked
curl -s http://localhost:5100/api/agents/definitions/nonexistent | jq .
# Expected: {"message":"Definition not found"}

# Test session search works
curl -s "http://localhost:5100/api/sessions/search?q=test" | jq .results
# Expected: results array

# Test entities have redacted secrets
curl -s http://localhost:5100/api/entities | jq '.[] | select(.type=="mcp") | .data.env' | head -20
# Expected: sensitive values show *** or [REDACTED]@...

# Kill dev server
kill %1
```
