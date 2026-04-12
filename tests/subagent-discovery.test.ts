import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  discoverSubagents,
  type DiscoveredSubagent,
} from '../server/scanner/subagent-discovery';

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-subagent-discovery-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/**
 * Build a parent-session JSONL path inside the temp dir. The file itself does
 * not need to exist for discovery — discovery only inspects the sibling
 * `<basename>/subagents/` directory derived from the path.
 */
function sessionPath(name = 'parent-session'): string {
  return path.join(workDir, `${name}.jsonl`);
}

function subagentsDir(parentSessionPath: string): string {
  const dir = path.dirname(parentSessionPath);
  const base = path.basename(parentSessionPath, '.jsonl');
  return path.join(dir, base, 'subagents');
}

function makeSubagentDir(parentSessionPath: string): string {
  const dir = subagentsDir(parentSessionPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSubagentJsonl(dir: string, agentId: string, content = '{}'): string {
  const fp = path.join(dir, `agent-${agentId}.jsonl`);
  fs.writeFileSync(fp, content);
  return fp;
}

function writeMeta(
  dir: string,
  agentId: string,
  meta: { agentType: string; description: string } | string,
): string {
  const fp = path.join(dir, `agent-${agentId}.meta.json`);
  fs.writeFileSync(fp, typeof meta === 'string' ? meta : JSON.stringify(meta));
  return fp;
}

describe('discoverSubagents', () => {
  it('returns [] when no subagents directory exists', () => {
    const parent = sessionPath();
    const result = discoverSubagents(parent);
    expect(result).toEqual([]);
  });

  it('returns [] when the subagents directory exists but is empty', () => {
    const parent = sessionPath();
    makeSubagentDir(parent);
    const result = discoverSubagents(parent);
    expect(result).toEqual([]);
  });

  it('returns one entry for a subagent with valid .meta.json', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    const jsonlPath = writeSubagentJsonl(dir, 'abc123');
    const metaPath = writeMeta(dir, 'abc123', { agentType: 'Explore', description: 'test' });

    const result = discoverSubagents(parent);

    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.agentId).toBe('abc123');
    expect(path.isAbsolute(entry.filePath)).toBe(true);
    expect(path.isAbsolute(entry.metaFilePath)).toBe(true);
    expect(entry.filePath).toBe(jsonlPath);
    expect(entry.metaFilePath).toBe(metaPath);
    expect(entry.meta).toEqual({ agentType: 'Explore', description: 'test' });
  });

  it('returns one entry with meta: null when .meta.json is missing', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    writeSubagentJsonl(dir, 'abc123');

    const result = discoverSubagents(parent);

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('abc123');
    expect(result[0].meta).toBeNull();
  });

  it('returns meta: null and does not throw when .meta.json is malformed', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    writeSubagentJsonl(dir, 'abc123');
    writeMeta(dir, 'abc123', '{ not valid json');

    let result: DiscoveredSubagent[] = [];
    expect(() => {
      result = discoverSubagents(parent);
    }).not.toThrow();

    expect(result).toHaveLength(1);
    expect(result[0].meta).toBeNull();
  });

  it('ignores files that do not match the agent-<hex>.jsonl pattern', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    writeSubagentJsonl(dir, 'abc123');
    fs.writeFileSync(path.join(dir, 'README.md'), '# notes');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'random');
    fs.writeFileSync(path.join(dir, 'subagent-xyz.jsonl'), '{}');

    const result = discoverSubagents(parent);

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('abc123');
  });

  it('returns subagents in stable filename-sorted order regardless of fs enumeration', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    // Create out of alphabetical order on purpose
    writeSubagentJsonl(dir, 'ccc');
    writeMeta(dir, 'ccc', { agentType: 'Plan', description: 'c' });
    writeSubagentJsonl(dir, 'aaa');
    writeMeta(dir, 'aaa', { agentType: 'Explore', description: 'a' });
    writeSubagentJsonl(dir, 'bbb');
    writeMeta(dir, 'bbb', { agentType: 'Explore', description: 'b' });

    const result = discoverSubagents(parent);

    expect(result.map((e) => e.agentId)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('handles multiple subagents with mixed meta presence', () => {
    const parent = sessionPath();
    const dir = makeSubagentDir(parent);
    writeSubagentJsonl(dir, 'aaa');
    writeMeta(dir, 'aaa', { agentType: 'Explore', description: 'a' });
    writeSubagentJsonl(dir, 'bbb');
    // no meta for bbb
    writeSubagentJsonl(dir, 'ccc');
    writeMeta(dir, 'ccc', { agentType: 'Plan', description: 'c' });

    const result = discoverSubagents(parent);

    expect(result).toHaveLength(3);
    const byId = new Map(result.map((e) => [e.agentId, e]));
    expect(byId.get('aaa')!.meta).toEqual({ agentType: 'Explore', description: 'a' });
    expect(byId.get('bbb')!.meta).toBeNull();
    expect(byId.get('ccc')!.meta).toEqual({ agentType: 'Plan', description: 'c' });
  });
});
