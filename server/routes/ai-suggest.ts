import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import type { CustomNode, CustomEdge, CustomNodeSubType } from "@shared/types";
import crypto from "crypto";

const router = Router();

/** Gather context about the current ecosystem for the AI */
function gatherContext(): string {
  const entities = storage.getEntities();
  const relationships = storage.getAllRelationships();
  const customNodes = storage.getCustomNodes();

  const sections: string[] = [];

  // Entities summary
  const byType: Record<string, string[]> = {};
  for (const e of entities) {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(`  - ${e.name}: ${e.description || "(no description)"}`);
  }
  for (const [type, items] of Object.entries(byType)) {
    sections.push(`## ${type.toUpperCase()} (${items.length})\n${items.join("\n")}`);
  }

  // Existing relationships
  if (relationships.length > 0) {
    const relLines = relationships.slice(0, 50).map((r) => {
      const src = entities.find((e) => e.id === r.sourceId);
      const tgt = entities.find((e) => e.id === r.targetId);
      return `  - ${src?.name || r.sourceId} --[${r.relation}]--> ${tgt?.name || r.targetId}`;
    });
    sections.push(`## Existing Relationships (${relationships.length})\n${relLines.join("\n")}`);
  }

  // Custom nodes already in graph
  if (customNodes.length > 0) {
    const nodeLines = customNodes.map((n) => `  - ${n.label} (${n.subType}, source: ${n.source})`);
    sections.push(`## Custom Nodes Already Present (${customNodes.length})\n${nodeLines.join("\n")}`);
  }

  // CLAUDE.md content (if available)
  const home = os.homedir().replace(/\\/g, "/");
  const claudeMdPath = path.join(home, "CLAUDE.md");
  try {
    if (fs.statSync(claudeMdPath).isFile()) {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      // Truncate to 3000 chars to keep prompt manageable
      sections.push(`## CLAUDE.md (home directory)\n${content.slice(0, 3000)}`);
    }
  } catch {}

  // MCP configs with env vars (for service detection)
  const mcps = entities.filter((e) => e.type === "mcp");
  if (mcps.length > 0) {
    const mcpDetails = mcps.map((m) => {
      const env = m.data.env as Record<string, string> | undefined;
      const envKeys = env ? Object.keys(env).join(", ") : "none";
      return `  - ${m.name}: ${m.data.transport || "stdio"}, env: [${envKeys}]`;
    });
    sections.push(`## MCP Details\n${mcpDetails.join("\n")}`);
  }

  return sections.join("\n\n");
}

router.post("/api/graph/ai-suggest", async (req: Request, res: Response) => {
  const context = gatherContext();

  const prompt = `You are analyzing a developer's Claude Code ecosystem to suggest additional nodes and edges for their dependency graph.

Here is their current ecosystem:

${context}

Based on this information, suggest:
1. Infrastructure nodes that should be in the graph (databases, external APIs, CI/CD pipelines, deployment targets, message queues, caches)
2. Edges connecting these new nodes to existing entities
3. Missing edges between existing entities that you can infer

IMPORTANT: Only suggest things you can reasonably infer from the data. Don't make wild guesses.

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "nodes": [
    {
      "id": "unique-id",
      "subType": "database|api|service|cicd|deploy|queue|cache|other",
      "label": "Human readable name",
      "description": "Brief description",
      "color": "#hex color"
    }
  ],
  "edges": [
    {
      "source": "existing entity name or new node id",
      "target": "existing entity name or new node id",
      "label": "relationship_type"
    }
  ],
  "reasoning": ["Brief explanation for each suggestion"]
}`;

  try {
    // Use claude -p subprocess — pipe prompt via stdin to avoid Windows command line length limits
    const env = { ...process.env };
    delete env.CLAUDECODE; // Prevent nesting error

    const child = spawn("claude", ["-p"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write prompt via stdin to avoid Windows command line length limits
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
    }, 120000); // 120s timeout

    child.on("close", (code: number | null) => {
      clearTimeout(timeout);

      console.log(`[ai-suggest] claude -p exited with code ${code}, stdout length: ${stdout.length}`);

      // If we got output, try to parse it regardless of exit code
      // (claude -p may exit with null when killed but still have complete output)
      if (!stdout.trim()) {
        if (code !== 0) {
          console.error("[ai-suggest] claude -p failed with no output:", stderr.slice(0, 500));
          return res.status(500).json({ message: "AI suggestion failed", error: stderr.slice(0, 200) || `Exit code: ${code}` });
        }
        return res.status(500).json({ message: "AI returned empty response" });
      }

      try {
        // Extract JSON from response (might be wrapped in markdown code blocks)
        let jsonStr = stdout.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        const suggestions = JSON.parse(jsonStr);

        // Validate and normalize
        const nodes: CustomNode[] = (suggestions.nodes || []).map((n: any) => ({
          id: `ai-${n.id || crypto.randomBytes(4).toString("hex")}`,
          subType: (["database", "api", "service", "cicd", "deploy", "queue", "cache", "other"].includes(n.subType) ? n.subType : "other") as CustomNodeSubType,
          label: String(n.label || "Unknown"),
          description: n.description ? String(n.description) : undefined,
          color: n.color ? String(n.color) : undefined,
          source: "ai-suggested" as const,
        }));

        const edges: CustomEdge[] = (suggestions.edges || []).map((e: any) => ({
          id: `ai-edge-${crypto.randomBytes(4).toString("hex")}`,
          source: String(e.source || ""),
          target: String(e.target || ""),
          label: String(e.label || "connects_to"),
          source_origin: "ai-suggested" as const,
        })).filter((e: CustomEdge) => e.source && e.target);

        res.json({
          nodes,
          edges,
          reasoning: suggestions.reasoning || [],
        });
      } catch (parseErr) {
        console.error("[ai-suggest] Failed to parse AI response:", stdout.slice(0, 500));
        res.status(500).json({ message: "Failed to parse AI suggestions", raw: stdout.slice(0, 500) });
      }
    });
  } catch (err) {
    console.error("[ai-suggest] Error:", err);
    res.status(500).json({ message: "AI suggestion failed" });
  }
});

/** Accept selected AI suggestions and persist them */
router.post("/api/graph/ai-suggest/accept", (req: Request, res: Response) => {
  const { nodes, edges } = req.body as { nodes?: any[]; edges?: any[] };
  const validSubTypes = new Set(["service", "database", "api", "cicd", "deploy", "queue", "cache", "other"]);

  let acceptedNodes = 0;
  let acceptedEdges = 0;

  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      if (!n || typeof n.label !== "string" || !n.label) continue;
      const node: CustomNode = {
        id: (typeof n.id === "string" && n.id) ? n.id : `ai-${crypto.randomBytes(6).toString("hex")}`,
        subType: validSubTypes.has(n.subType) ? n.subType : "other",
        label: String(n.label).slice(0, 200),
        description: typeof n.description === "string" ? n.description.slice(0, 1000) : undefined,
        color: typeof n.color === "string" ? n.color.slice(0, 50) : undefined,
        source: "ai-suggested",
      };
      storage.upsertCustomNode(node);
      acceptedNodes++;
    }
  }

  if (Array.isArray(edges)) {
    for (const e of edges) {
      if (!e || typeof e.source !== "string" || typeof e.target !== "string" || typeof e.label !== "string") continue;
      const edge: CustomEdge = {
        id: `ai-edge-${crypto.randomBytes(6).toString("hex")}`,
        source: String(e.source).slice(0, 200),
        target: String(e.target).slice(0, 200),
        label: String(e.label).slice(0, 200),
        source_origin: "ai-suggested",
      };
      storage.upsertCustomEdge(edge);
      acceptedEdges++;
    }
  }

  res.json({ accepted: { nodes: acceptedNodes, edges: acceptedEdges } });
});

export default router;
