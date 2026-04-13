import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { validate, DiscoveryQuerySchema } from "./validation";

const router = Router();

router.get("/api/discovery/search", async (req: Request, res: Response) => {
  const params = validate(DiscoveryQuerySchema, { q: req.query.q }, res);
  if (!params) return;

  const { q } = params;

  // Check cache
  const cached = storage.getCachedDiscovery(q);
  if (cached) {
    try {
      res.json(JSON.parse(cached));
      return;
    } catch {
      // Cache corrupted, re-fetch from GitHub
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-cc",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=20&sort=stars&order=desc`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `GitHub API error: ${text}` });
      return;
    }

    const data = await response.json();
    const results = (data.items || []).map((repo: any) => {
      const text = `${repo.name} ${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();
      let category = "other";
      if (text.includes("mcp") || text.includes("model context protocol")) category = "mcp";
      else if (text.includes("plugin")) category = "plugin";
      else if (text.includes("skill")) category = "skill";

      return {
        id: repo.id,
        name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics || [],
        category,
        updatedAt: repo.updated_at,
      };
    });

    storage.setCachedDiscovery(q, JSON.stringify(results));
    res.json(results);
  } catch (err) {
    console.error("[routes/discovery/search]", err);
    res.status(502).json({ error: "Failed to reach GitHub API" });
  }
});

export default router;
