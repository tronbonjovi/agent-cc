// server/pipeline/git-ops.ts
import { execSync } from "child_process";
import path from "path";
import os from "os";

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8", timeout: 30000 }).trim();
}

interface WorktreeResult {
  worktreePath: string;
  branchName: string;
}

/**
 * Create an isolated git worktree for a pipeline task.
 * Branches from the specified base branch.
 */
export async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseBranch: string
): Promise<WorktreeResult> {
  const branchName = `pipeline/${taskId}`;
  const worktreePath = path.join(os.tmpdir(), `agent-cc-pipeline`, taskId);

  // Clean up any stale worktree at this path
  try {
    git(`worktree remove "${worktreePath}" --force`, repoPath);
  } catch {
    // Not an error — worktree may not exist
  }

  // Delete branch if it exists from a previous run
  try {
    git(`branch -D ${branchName}`, repoPath);
  } catch {
    // Branch may not exist
  }

  git(`worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, repoPath);

  return { worktreePath, branchName };
}

/**
 * Remove a worktree and its branch.
 */
export function removeWorktree(repoPath: string, worktreePath: string): void {
  try {
    git(`worktree remove "${worktreePath}" --force`, repoPath);
  } catch {
    // Best effort cleanup
  }
}

/**
 * Tag the current state of the worktree as a clean snapshot for retry isolation.
 * Returns the ref name.
 */
export async function createCleanSnapshot(worktreePath: string, taskId: string): Promise<string> {
  const refName = `refs/pipeline-snapshot/${taskId}`;
  const head = git("rev-parse HEAD", worktreePath);
  git(`update-ref ${refName} ${head}`, worktreePath);
  return refName;
}

/**
 * Reset the worktree to a clean snapshot. Used before retries.
 */
export async function resetToSnapshot(worktreePath: string, snapshotRef: string): Promise<void> {
  git(`reset --hard ${snapshotRef}`, worktreePath);
  git("clean -fd", worktreePath);
}

/**
 * Preserve the current attempt's changes as a ref for debugging.
 */
export async function preserveAttempt(
  worktreePath: string,
  taskId: string,
  attemptNumber: number
): Promise<string> {
  const refName = `refs/pipeline-attempt/${taskId}/attempt-${attemptNumber}`;
  const head = git("rev-parse HEAD", worktreePath);
  git(`update-ref ${refName} ${head}`, worktreePath);
  return refName;
}

/**
 * Get list of files changed on this branch relative to a base.
 */
export async function getChangedFiles(worktreePath: string, baseBranch: string): Promise<string[]> {
  const output = git(`diff --name-only ${baseBranch}...HEAD`, worktreePath);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

/**
 * Rebase the current branch onto the latest base branch.
 * Returns true on success, false on conflict.
 */
export async function rebaseOnto(worktreePath: string, baseBranch: string): Promise<boolean> {
  try {
    git(`rebase ${baseBranch}`, worktreePath);
    return true;
  } catch {
    // Abort the failed rebase to leave the worktree clean
    try {
      git("rebase --abort", worktreePath);
    } catch {
      // Already clean
    }
    return false;
  }
}

/**
 * Check if two sets of changed files overlap.
 */
export function hasOverlappingFiles(filesA: string[], filesB: string[]): string[] {
  const setA = new Set(filesA);
  return filesB.filter((f) => setA.has(f));
}
