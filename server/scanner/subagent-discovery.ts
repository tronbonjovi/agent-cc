import fs from 'node:fs';
import path from 'node:path';

/**
 * One subagent JSONL file discovered next to a parent session, plus its
 * optional sidecar `.meta.json`. The JSONL itself is NOT parsed here — that
 * is the tree builder's job. This module is purely a directory enumerator.
 */
export interface DiscoveredSubagent {
  agentId: string;
  /** Absolute path to `agent-<agentId>.jsonl`. */
  filePath: string;
  /** Absolute path to `agent-<agentId>.meta.json` (may not exist on disk). */
  metaFilePath: string;
  /** Parsed sidecar metadata, or null if missing or malformed. */
  meta: { agentType: string; description: string } | null;
}

const AGENT_FILE_RE = /^agent-([a-z0-9]+)\.jsonl$/;

/**
 * List the subagent JSONL files belonging to the given parent session file.
 *
 * The subagents directory is derived as
 * `<dirname(sessionFilePath)>/<basename(sessionFilePath, ".jsonl")>/subagents/`.
 * If the directory does not exist (the common case — most sessions have no
 * subagents), returns an empty array. Filesystem and JSON-parse failures on
 * individual sidecar files degrade gracefully to `meta: null` so one corrupt
 * file never breaks discovery for the rest.
 */
export function discoverSubagents(sessionFilePath: string): DiscoveredSubagent[] {
  const parentDir = path.dirname(sessionFilePath);
  const baseName = path.basename(sessionFilePath, '.jsonl');
  const subDir = path.join(parentDir, baseName, 'subagents');

  let entries: string[];
  try {
    if (!fs.existsSync(subDir)) return [];
    entries = fs.readdirSync(subDir);
  } catch {
    return [];
  }

  const results: DiscoveredSubagent[] = [];
  for (const entry of entries) {
    const match = entry.match(AGENT_FILE_RE);
    if (!match) continue;

    const agentId = match[1];
    const filePath = path.join(subDir, entry);
    const metaFilePath = path.join(subDir, `agent-${agentId}.meta.json`);

    let meta: DiscoveredSubagent['meta'] = null;
    try {
      if (fs.existsSync(metaFilePath)) {
        const raw = fs.readFileSync(metaFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.agentType === 'string' &&
          typeof parsed.description === 'string'
        ) {
          meta = { agentType: parsed.agentType, description: parsed.description };
        }
      }
    } catch {
      meta = null;
    }

    results.push({ agentId, filePath, metaFilePath, meta });
  }

  results.sort((a, b) => path.basename(a.filePath).localeCompare(path.basename(b.filePath)));
  return results;
}
