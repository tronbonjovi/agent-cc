import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  createTaskWorktree,
  removeWorktree,
  createCleanSnapshot,
  resetToSnapshot,
  rebaseOnto,
  getChangedFiles,
} from "../server/pipeline/git-ops";

// Create a temp git repo for testing
let repoDir: string;
let worktreeDir: string;

function git(cmd: string, cwd?: string) {
  return execSync(`git ${cmd}`, { cwd: cwd ?? repoDir, encoding: "utf-8" }).trim();
}

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-git-test-"));
  worktreeDir = "";
  git("init");
  git("config user.email test@test.com");
  git("config user.name Test");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Test Repo\n");
  git("add .");
  git('commit -m "initial commit"');
  // Normalize branch name to "main" regardless of system default
  git("branch -m main");
});

afterEach(() => {
  if (worktreeDir && fs.existsSync(worktreeDir)) {
    removeWorktree(repoDir, worktreeDir);
  }
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe("createTaskWorktree", () => {
  it("creates a worktree with a new branch", async () => {
    const result = await createTaskWorktree(repoDir, "task-123", "main");
    worktreeDir = result.worktreePath;

    expect(fs.existsSync(result.worktreePath)).toBe(true);
    expect(result.branchName).toBe("pipeline/task-123");
    expect(fs.existsSync(path.join(result.worktreePath, "README.md"))).toBe(true);
  });

  it("uses the specified base branch", async () => {
    git("checkout -b develop");
    fs.writeFileSync(path.join(repoDir, "dev.txt"), "dev file\n");
    git("add .");
    git('commit -m "dev commit"');

    const result = await createTaskWorktree(repoDir, "task-456", "develop");
    worktreeDir = result.worktreePath;

    expect(fs.existsSync(path.join(result.worktreePath, "dev.txt"))).toBe(true);
  });
});

describe("createCleanSnapshot and resetToSnapshot", () => {
  it("can snapshot and reset the worktree", async () => {
    const result = await createTaskWorktree(repoDir, "task-snap", "main");
    worktreeDir = result.worktreePath;

    const snapshotRef = await createCleanSnapshot(result.worktreePath, "task-snap");

    // Make changes
    fs.writeFileSync(path.join(result.worktreePath, "new-file.txt"), "new content");
    git("add .", result.worktreePath);
    git('commit -m "some changes"', result.worktreePath);

    // Reset to snapshot
    await resetToSnapshot(result.worktreePath, snapshotRef);

    expect(fs.existsSync(path.join(result.worktreePath, "new-file.txt"))).toBe(false);
  });
});

describe("getChangedFiles", () => {
  it("returns list of files changed on the branch", async () => {
    const result = await createTaskWorktree(repoDir, "task-files", "main");
    worktreeDir = result.worktreePath;

    fs.writeFileSync(path.join(result.worktreePath, "file-a.txt"), "a");
    fs.writeFileSync(path.join(result.worktreePath, "file-b.txt"), "b");
    git("add .", result.worktreePath);
    git('commit -m "add files"', result.worktreePath);

    const files = await getChangedFiles(result.worktreePath, "main");
    expect(files).toContain("file-a.txt");
    expect(files).toContain("file-b.txt");
    expect(files).not.toContain("README.md");
  });
});

describe("rebaseOnto", () => {
  it("rebases task branch onto updated base", async () => {
    const result = await createTaskWorktree(repoDir, "task-rebase", "main");
    worktreeDir = result.worktreePath;

    // Make a change on the task branch
    fs.writeFileSync(path.join(result.worktreePath, "task-file.txt"), "task work");
    git("add .", result.worktreePath);
    git('commit -m "task work"', result.worktreePath);

    // Make a change on main (in the original repo)
    git("checkout main", repoDir);
    fs.writeFileSync(path.join(repoDir, "main-file.txt"), "main work");
    git("add .", repoDir);
    git('commit -m "main work"', repoDir);

    // Rebase task onto updated main
    const success = await rebaseOnto(result.worktreePath, "main");
    expect(success).toBe(true);

    // Task branch should have both files
    expect(fs.existsSync(path.join(result.worktreePath, "task-file.txt"))).toBe(true);
    expect(fs.existsSync(path.join(result.worktreePath, "main-file.txt"))).toBe(true);
  });

  it("returns false on conflict", async () => {
    const result = await createTaskWorktree(repoDir, "task-conflict", "main");
    worktreeDir = result.worktreePath;

    // Both branches modify README.md
    fs.writeFileSync(path.join(result.worktreePath, "README.md"), "task version");
    git("add .", result.worktreePath);
    git('commit -m "task change"', result.worktreePath);

    git("checkout main", repoDir);
    fs.writeFileSync(path.join(repoDir, "README.md"), "main version");
    git("add .", repoDir);
    git('commit -m "main change"', repoDir);

    const success = await rebaseOnto(result.worktreePath, "main");
    expect(success).toBe(false);
  });
});

describe("input validation", () => {
  it("rejects task IDs with shell metacharacters", async () => {
    await expect(createTaskWorktree(repoDir, "task; rm -rf /", "main")).rejects.toThrow("Invalid taskId");
  });

  it("rejects task IDs with backticks", async () => {
    await expect(createTaskWorktree(repoDir, "task`whoami`", "main")).rejects.toThrow("Invalid taskId");
  });

  it("rejects base branches with shell metacharacters", async () => {
    await expect(createTaskWorktree(repoDir, "safe-task", "main; echo pwned")).rejects.toThrow("Invalid baseBranch");
  });

  it("rejects task IDs starting with dash", async () => {
    await expect(createTaskWorktree(repoDir, "--delete", "main")).rejects.toThrow("Invalid taskId");
  });

  it("allows valid task IDs with alphanumeric and hyphens", async () => {
    const result = await createTaskWorktree(repoDir, "task-123-abc", "main");
    worktreeDir = result.worktreePath;
    expect(result.branchName).toBe("pipeline/task-123-abc");
  });
});
