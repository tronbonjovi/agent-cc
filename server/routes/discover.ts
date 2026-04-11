import { Router } from "express";
import { execSync } from "child_process";

export interface DiscoverResult {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  source: string;
}

type EntityType = "skills" | "agents" | "plugins";

const VALID_TYPES = new Set<string>(["skills", "agents", "plugins"]);

/**
 * Build a GitHub search query string for the given entity type and search term.
 */
export function buildGitHubQuery(type: string, searchTerm: string): string {
  const term = searchTerm.trim();
  switch (type) {
    case "skills":
      return `SKILL.md in:path ${term} claude skill`.trim();
    case "agents":
      return `claude agent ${term} filename:*.md`.trim();
    case "plugins":
      return `claude plugin ${term} marketplace OR .claude-plugin`.trim();
    default:
      return "";
  }
}

/**
 * Execute a GitHub search via the `gh` CLI.
 * Returns empty array on any error (graceful degradation).
 */
function searchGitHub(query: string, limit: number = 20): DiscoverResult[] {
  try {
    const stdout = execSync(
      `gh search repos "${query.replace(/"/g, '\\"')}" --json name,description,url,stargazersCount --limit ${limit}`,
      { timeout: 15_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const raw = JSON.parse(stdout) as Array<{
      name: string;
      description: string | null;
      url: string;
      stargazersCount: number;
    }>;
    return raw.map((r) => ({
      name: r.name,
      description: r.description,
      url: r.url,
      stars: r.stargazersCount,
      source: "github",
    }));
  } catch {
    // gh not installed, not authenticated, timeout, etc.
    return [];
  }
}

const router = Router();

router.get("/api/discover/:type/search", (req, res) => {
  const { type } = req.params;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}. Must be one of: skills, agents, plugins` });
  }

  const q = (req.query.q as string) || "";
  if (!q.trim()) {
    return res.json([]);
  }

  const query = buildGitHubQuery(type, q);
  const results = searchGitHub(query);
  res.json(results);
});

export default router;
