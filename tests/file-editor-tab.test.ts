// tests/file-editor-tab.test.ts
// Tests for the Info tab (formerly File Editor) in the Library page
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FILE_EDITOR_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/file-editor-tab.tsx");
const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const MARKDOWN_EDIT_PATH = path.resolve(__dirname, "../client/src/pages/markdown-edit.tsx");

describe("file-editor-tab component exists", () => {
  it("file-editor-tab.tsx exists", () => {
    expect(fs.existsSync(FILE_EDITOR_TAB_PATH)).toBe(true);
  });
});

describe("Info tab (formerly file-editor-tab) component structure", () => {
  const src = fs.readFileSync(FILE_EDITOR_TAB_PATH, "utf-8");

  it("exports a FileEditorTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+FileEditorTab/);
  });

  it("uses the useMarkdownFiles hook", () => {
    expect(src).toMatch(/useMarkdownFiles/);
  });

  it("includes context summary panel", () => {
    expect(src).toMatch(/ContextSummaryPanel|useContextSummary/);
  });

  it("includes memory health analysis", () => {
    expect(src).toMatch(/analyzeMemoryHealth|MemoryHealth/);
  });

  it("includes file dependency graph", () => {
    expect(src).toMatch(/FileDependencyGraph/);
  });

  it("includes memory budget meter", () => {
    expect(src).toMatch(/MemoryBudgetMeter/);
  });

  it("includes memory learn guide", () => {
    expect(src).toMatch(/MemoryLearnGuide/);
  });

  it("includes fix-it modal", () => {
    expect(src).toMatch(/FixItModal/);
  });

  it("does not include file listing features (removed)", () => {
    expect(src).not.toMatch(/renderFileCard/);
    expect(src).not.toMatch(/QuickEditDrawer/);
    expect(src).not.toMatch(/CreateFileWizard/);
    expect(src).not.toMatch(/BulkToolbar/);
    expect(src).not.toMatch(/ContentSearchResults/);
  });
});

describe("library page renders FileEditorTab", () => {
  const src = fs.readFileSync(LIBRARY_PATH, "utf-8");

  it("imports FileEditorTab", () => {
    expect(src).toMatch(/import.*FileEditorTab.*from/);
  });

  it("renders FileEditorTab component for editor tab", () => {
    expect(src).toMatch(/<FileEditorTab/);
  });
});

describe("original page files", () => {
  it("markdown-edit.tsx still exists", () => {
    expect(fs.existsSync(MARKDOWN_EDIT_PATH)).toBe(true);
  });
});
