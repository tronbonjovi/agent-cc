import { Router, Request, Response } from "express";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { runFullScan } from "../scanner/index";
import { getSourcesForType } from "../discover/sources";

interface DiscoverResult {
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

/**
 * Create the library directory for a given type and item name.
 * Uses os.homedir() at call time so tests can override HOME.
 */
export function ensureLibraryDir(type: string, itemName: string): string {
  const dir = path.join(os.homedir(), ".claude", "library", type, itemName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const router = Router();

router.get("/api/discover/:type/sources", (req, res) => {
  const { type } = req.params;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}. Must be one of: skills, agents, plugins` });
  }
  const sources = getSourcesForType(type as "skills" | "agents" | "plugins");
  res.json(sources);
});

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

// POST /api/library/:type/save — download from GitHub to library
router.post("/api/library/:type/save", async (req: Request, res: Response) => {
  const type = req.params.type as string;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}. Must be one of: skills, agents, plugins` });
  }

  const { repoUrl, path: repoPath, name } = req.body as {
    repoUrl: string;
    path?: string;
    name: string;
  };

  if (!repoUrl || !name) {
    return res.status(400).json({ message: "repoUrl and name are required" });
  }

  try {
    const targetDir = ensureLibraryDir(type, name);

    if (repoPath) {
      // Download specific directory/file from repo
      const repoSlug = repoUrl.replace("https://github.com/", "");
      const cmd = `gh api repos/${repoSlug}/contents/${repoPath} --jq '.[].download_url // .download_url'`;
      const urls = execSync(cmd, { timeout: 15_000, encoding: "utf-8" })
        .trim()
        .split("\n")
        .filter(Boolean);

      for (const url of urls) {
        const fileName = path.basename(url);
        const content = execSync(`curl -sL "${url}"`, { timeout: 15_000, encoding: "utf-8" });
        fs.writeFileSync(path.join(targetDir, fileName), content);
      }
    } else {
      // Clone full repo into library dir
      const repoSlug = repoUrl.replace("https://github.com/", "");
      execSync(`gh repo clone ${repoSlug} "${targetDir}" -- --depth 1`, {
        timeout: 30_000,
      });
      // Remove .git directory — no version tracking needed in library
      fs.rmSync(path.join(targetDir, ".git"), { recursive: true, force: true });
    }

    runFullScan().catch(() => {});
    res.json({ message: `Saved "${name}" to library` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Download failed";
    res.status(500).json({ message: msg });
  }
});

export default router;
