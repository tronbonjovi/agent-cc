/**
 * Shared utility for running `claude -p` as a subprocess.
 * Used by: session-summarizer, nl-query, decision-extractor, ai-suggest, pipeline workers
 */
import { spawn } from "child_process";

interface RunClaudeOpts {
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
  cwd?: string;
  onOutput?: (chunk: string) => void;
}

/** Build the argument array for claude CLI */
export function buildClaudeArgs(opts: Pick<RunClaudeOpts, "model" | "maxTurns">): string[] {
  const { model = "haiku", maxTurns = 1 } = opts;
  return ["-p", "--model", model, "--max-turns", String(maxTurns), "--no-session-persistence"];
}

/** Build a clean environment for claude subprocess */
export function buildClaudeEnv(): Record<string, string | undefined> {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.CLAUDECODE;
  return env;
}

/** Run claude -p with a prompt, return the stdout */
export function runClaude(prompt: string, opts: RunClaudeOpts = {}): Promise<string> {
  const { timeoutMs = 60000, cwd, onOutput } = opts;

  return new Promise((resolve, reject) => {
    const env = buildClaudeEnv();
    const args = buildClaudeArgs(opts);
    const child = spawn("claude", args, {
      env,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onOutput) onOutput(chunk);
    });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Parse JSON from Claude output (handles markdown fences) */
export function parseClaudeJson(raw: string): Record<string, unknown> | unknown[] | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence !== -1) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
