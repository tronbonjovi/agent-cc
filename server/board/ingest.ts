// server/board/ingest.ts

import matter from "gray-matter";

export interface ParsedMilestone {
  id: string;
  title: string;
  priority: string;
}

export interface ParsedTask {
  id: string;
  title: string;
  milestone?: string;
  priority: string;
  dependsOn: string[];
}

export interface ParsedRoadmap {
  project: string;
  milestones: ParsedMilestone[];
  tasks: ParsedTask[];
}

/**
 * Parse a roadmap markdown file into structured milestones and tasks.
 *
 * Expected format:
 * - YAML frontmatter with `project` field
 * - ### MILE-NNN: Title sections for milestones with Priority: line
 * - Task lines: `- TASK-NNN: Title [priority: x, depends: TASK-A, TASK-B]`
 */
export function parseRoadmapMarkdown(content: string): ParsedRoadmap {
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  try {
    const parsed = matter(content);
    frontmatter = parsed.data;
    body = parsed.content;
  } catch {
    // No valid frontmatter — use raw content
  }

  const project = (frontmatter.project as string) || "";
  const milestones: ParsedMilestone[] = [];
  const tasks: ParsedTask[] = [];

  let currentMilestone: string | undefined;
  let currentMilestonePriority = "medium";

  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match milestone headers: ### MILE-001: Core API
    const milestoneMatch = line.match(/^###?\s+(MILE-\d+):\s*(.+)/);
    if (milestoneMatch) {
      currentMilestone = milestoneMatch[1];
      const title = milestoneMatch[2].trim();
      currentMilestonePriority = "medium";

      // Look ahead for Priority: line
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && /^Priority:\s*/i.test(nextLine)) {
        currentMilestonePriority = nextLine.replace(/^Priority:\s*/i, "").trim().toLowerCase();
        i++; // Skip the priority line
      }

      milestones.push({ id: currentMilestone, title, priority: currentMilestonePriority });
      continue;
    }

    // Match task lines: - TASK-001: Title [priority: high, depends: TASK-000]
    const taskMatch = line.match(/^-\s+(TASK-\d+):\s*(.+)/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      let titleAndMeta = taskMatch[2];

      let priority = "medium";
      let dependsOn: string[] = [];

      // Extract bracket metadata: [priority: high, depends: TASK-001, TASK-002]
      const bracketMatch = titleAndMeta.match(/\[([^\]]+)\]\s*$/);
      if (bracketMatch) {
        titleAndMeta = titleAndMeta.slice(0, bracketMatch.index).trim();
        const meta = bracketMatch[1];

        const priorityMatch = meta.match(/priority:\s*(\w+)/i);
        if (priorityMatch) priority = priorityMatch[1].toLowerCase();

        const dependsMatch = meta.match(/depends?:\s*([\w\s,-]+)/i);
        if (dependsMatch) {
          dependsOn = dependsMatch[1]
            .split(/[,\s]+/)
            .map(s => s.trim())
            .filter(s => /^TASK-\d+$/.test(s));
        }
      }

      tasks.push({
        id: taskId,
        title: titleAndMeta,
        milestone: currentMilestone,
        priority,
        dependsOn,
      });
    }
  }

  return { project, milestones, tasks };
}
