import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("library-subtabs", () => {
  const root = path.resolve(__dirname, "..");

  it("skills tab uses Installed/Library/Discover labels", () => {
    const src = fs.readFileSync(path.join(root, "client/src/components/library/skills-tab.tsx"), "utf-8");
    // SubTab type must include the new values
    expect(src).toContain('"installed" | "library" | "discover"');
    // Button labels must be the new names
    expect(src).toContain('"Installed"');
    expect(src).toContain('"Library"');
    expect(src).toContain('"Discover"');
    // Old labels must be gone
    expect(src).not.toContain('"Saved"');
    expect(src).not.toContain('"Marketplace"');
  });

  it("plugins tab uses Installed/Library/Discover labels", () => {
    const src = fs.readFileSync(path.join(root, "client/src/components/library/plugins-tab.tsx"), "utf-8");
    expect(src).toContain('"installed" | "library" | "discover"');
    expect(src).toContain('"Installed"');
    expect(src).toContain('"Library"');
    expect(src).toContain('"Discover"');
    expect(src).not.toContain('"Saved"');
    expect(src).not.toContain('"Marketplace"');
  });

  it("agents tab uses Installed/Library/Discover labels", () => {
    const src = fs.readFileSync(path.join(root, "client/src/components/library/agents-tab.tsx"), "utf-8");
    expect(src).toContain('"installed" | "library" | "discover"');
    expect(src).toContain('"Installed"');
    expect(src).toContain('"Library"');
    expect(src).toContain('"Discover"');
    expect(src).not.toContain('"Saved"');
    expect(src).not.toContain('"Marketplace"');
  });

  it("library hook exports all required functions", () => {
    const src = fs.readFileSync(path.join(root, "client/src/hooks/use-library.ts"), "utf-8");
    expect(src).toContain("export function useLibraryItems");
    expect(src).toContain("export function useInstallItem");
    expect(src).toContain("export function useUninstallItem");
    expect(src).toContain("export function useRemoveItem");
    expect(src).toContain("export function useDiscoverSearch");
    expect(src).toContain("export function useSaveToLibrary");
  });

  it("all tabs import and use library hooks", () => {
    for (const tab of ["skills-tab.tsx", "plugins-tab.tsx", "agents-tab.tsx"]) {
      const src = fs.readFileSync(path.join(root, `client/src/components/library/${tab}`), "utf-8");
      expect(src).toContain("use-library");
      expect(src).toContain("useInstallItem");
      expect(src).toContain("useUninstallItem");
      expect(src).toContain("useRemoveItem");
    }
  });
});
