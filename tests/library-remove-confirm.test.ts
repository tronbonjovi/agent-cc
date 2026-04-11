import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("library-remove-confirm", () => {
  const root = path.resolve(__dirname, "..");
  const tabs = ["skills-tab.tsx", "plugins-tab.tsx", "agents-tab.tsx"];

  it("remove action requires confirmation before deleting", () => {
    for (const tab of tabs) {
      const src = fs.readFileSync(
        path.join(root, `client/src/components/library/${tab}`),
        "utf-8"
      );
      // Each tab must have a handleRemove function with window.confirm
      expect(src).toContain("handleRemove");
      expect(src).toContain("window.confirm");
      // Confirmation message must warn that it cannot be undone
      expect(src).toContain("cannot be undone");
    }
  });

  it("remove buttons call handleRemove instead of removeItem.mutate directly", () => {
    for (const tab of tabs) {
      const src = fs.readFileSync(
        path.join(root, `client/src/components/library/${tab}`),
        "utf-8"
      );
      // The Remove button onClick should call handleRemove, not removeItem.mutate directly
      // Find all lines with label: "Remove" and check that the next onClick uses handleRemove
      const removeButtonPattern = /label:\s*"Remove"[\s\S]*?onClick:\s*\(\)\s*=>\s*handleRemove/;
      expect(removeButtonPattern.test(src)).toBe(true);
    }
  });
});
