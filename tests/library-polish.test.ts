// tests/library-polish.test.ts
// Tests for library-polish-task003: Info tab rename + neon removal

import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("Info tab rename", () => {
  it("library-tabs.ts labels the editor tab as 'Info'", () => {
    const src = fs.readFileSync("client/src/lib/library-tabs.ts", "utf-8");
    expect(src).toContain('"Info"');
    expect(src).not.toContain('"File Editor"');
  });

  it("library.tsx uses Info icon instead of FileEdit", () => {
    const src = fs.readFileSync("client/src/pages/library.tsx", "utf-8");
    expect(src).toContain("Info");
    // FileEdit icon should be replaced with Info — FileEditorTab component name is fine
    expect(src).not.toMatch(/\bFileEdit\b(?!or)/);  // match "FileEdit" but not "FileEditor"
  });
});

describe("Info tab file listing removal", () => {
  it("file-editor-tab.tsx does not render file cards grid", () => {
    const src = fs.readFileSync("client/src/components/library/file-editor-tab.tsx", "utf-8");
    expect(src).not.toContain("renderFileCard");
    expect(src).not.toContain("QuickEditDrawer");
    expect(src).not.toContain("CreateFileWizard");
    expect(src).not.toContain("BulkToolbar");
    expect(src).not.toContain("ContentSearchResults");
  });

  it("file-editor-tab.tsx still renders insight modules", () => {
    const src = fs.readFileSync("client/src/components/library/file-editor-tab.tsx", "utf-8");
    expect(src).toContain("MemoryBudgetMeter");
    expect(src).toContain("FileDependencyGraph");
    expect(src).toContain("ContextSummaryPanel");
    expect(src).toContain("MemoryLearnGuide");
    expect(src).toContain("FixItModal");
    expect(src).toContain("analyzeMemoryHealth");
  });
});

describe("Neon/gradient removal", () => {
  it("index.css has no glow variables or neon-glow utilities", () => {
    const src = fs.readFileSync("client/src/index.css", "utf-8");
    expect(src).not.toContain("--glow-blue");
    expect(src).not.toContain("--glow-purple");
    expect(src).not.toContain("--glow-green");
    expect(src).not.toContain("--glow-amber");
    expect(src).not.toContain("--glow-cyan");
    expect(src).not.toContain("--glow-intensity");
    expect(src).not.toContain(".neon-glow-blue");
    expect(src).not.toContain(".neon-glow-green");
    expect(src).not.toContain(".neon-glow-purple");
    expect(src).not.toContain(".neon-glow-amber");
    expect(src).not.toContain(".neon-glow-primary");
  });

  it("index.css has no gradient-border pseudo-element", () => {
    const src = fs.readFileSync("client/src/index.css", "utf-8");
    expect(src).not.toContain(".gradient-border::before");
    expect(src).not.toContain(".gradient-border:hover::before");
  });

  it("stat-card.tsx has no gradient-border class", () => {
    const src = fs.readFileSync("client/src/components/stat-card.tsx", "utf-8");
    expect(src).not.toContain("gradient-border");
    expect(src).not.toContain("shadow-[0_0_16px");
  });

  it("agents-tab.tsx has no gradient-border or gradient progress bars", () => {
    const src = fs.readFileSync("client/src/components/library/agents-tab.tsx", "utf-8");
    expect(src).not.toContain("gradient-border");
    expect(src).not.toContain("bg-gradient-to-r");
    expect(src).not.toContain("shadow-[0_0_6px");
  });

  it("stats.tsx has no gradient-border", () => {
    const src = fs.readFileSync("client/src/pages/stats.tsx", "utf-8");
    expect(src).not.toContain("gradient-border");
  });

  it("dashboard.tsx has no neon-glow or drop-shadow glow effects", () => {
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    expect(src).not.toContain("neon-glow");
    expect(src).not.toContain("drop-shadow-[0_0_4px");
    expect(src).not.toContain("shadow-[0_0_20px");
  });

  it("apis.tsx has no glow shadow on hover", () => {
    const src = fs.readFileSync("client/src/pages/apis.tsx", "utf-8");
    expect(src).not.toContain("shadow-[0_0_12px");
  });
});
