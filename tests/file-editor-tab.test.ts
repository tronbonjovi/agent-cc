// tests/file-editor-tab.test.ts
// Tests for the File Editor tab component in the Library page
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FILE_EDITOR_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/file-editor-tab.tsx");
const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const MARKDOWN_FILES_PATH = path.resolve(__dirname, "../client/src/pages/markdown-files.tsx");
const MARKDOWN_EDIT_PATH = path.resolve(__dirname, "../client/src/pages/markdown-edit.tsx");

describe("file-editor-tab component exists", () => {
  it("file-editor-tab.tsx exists", () => {
    expect(fs.existsSync(FILE_EDITOR_TAB_PATH)).toBe(true);
  });
});

describe("file-editor-tab component structure", () => {
  const src = fs.readFileSync(FILE_EDITOR_TAB_PATH, "utf-8");

  it("exports a FileEditorTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+FileEditorTab/);
  });

  it("uses the useMarkdownFiles hook", () => {
    expect(src).toMatch(/useMarkdownFiles/);
  });

  it("includes category filters", () => {
    expect(src).toMatch(/claude-md/);
    expect(src).toMatch(/memory/);
    expect(src).toMatch(/skill/);
    expect(src).toMatch(/readme/);
    expect(src).toMatch(/other/);
  });

  it("includes search functionality", () => {
    expect(src).toMatch(/search/i);
    expect(src).toMatch(/<Input/);
  });

  it("includes memory type badges", () => {
    expect(src).toMatch(/memoryTypeColors/);
  });

  it("includes content search with highlighting", () => {
    expect(src).toMatch(/ContentSearchResults|useContentSearch/);
  });

  it("includes context summary generation", () => {
    expect(src).toMatch(/ContextSummaryPanel|useContextSummary/);
  });

  it("includes file metadata display (lines, tokens, modified)", () => {
    expect(src).toMatch(/lineCount/);
    expect(src).toMatch(/tokenEstimate/);
  });

  it("navigates to /markdown/:id for editing", () => {
    expect(src).toMatch(/\/markdown\//);
    expect(src).toMatch(/setLocation/);
  });

  it("does not include page-level h1 heading", () => {
    expect(src).not.toMatch(/<h1[^>]*>Markdown Files<\/h1>/);
  });

  it("does not wrap in p-6 page padding", () => {
    // Should not have the outermost page wrapper with p-6 space-y-6
    expect(src).not.toMatch(/className="p-6 space-y-6">/);
  });

  it("includes memory health analysis", () => {
    expect(src).toMatch(/analyzeMemoryHealth|MemoryHealth/);
  });

  it("includes quick edit drawer", () => {
    expect(src).toMatch(/QuickEditDrawer/);
  });

  it("includes create file wizard", () => {
    expect(src).toMatch(/CreateFileWizard/);
  });

  it("includes file dependency graph", () => {
    expect(src).toMatch(/FileDependencyGraph/);
  });

  it("includes sort controls", () => {
    expect(src).toMatch(/sortKey/);
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

  it("no longer has the editor placeholder text", () => {
    expect(src).not.toMatch(/Editor tab coming in a future update/);
  });
});

describe("original page files (task006 — redirects replace standalone pages)", () => {
  it("markdown-files.tsx removed", () => {
    expect(fs.existsSync(MARKDOWN_FILES_PATH)).toBe(false);
  });

  it("markdown-edit.tsx still exists", () => {
    expect(fs.existsSync(MARKDOWN_EDIT_PATH)).toBe(true);
  });
});
