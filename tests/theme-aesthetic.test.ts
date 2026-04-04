import { describe, it, expect } from "vitest";
import { themes } from "../client/src/themes";

describe("Theme aesthetic profiles", () => {
  it("every theme has an aesthetic property", () => {
    for (const theme of themes) {
      expect(theme.aesthetic, `${theme.id} missing aesthetic`).toBeDefined();
    }
  });

  it("every aesthetic has required properties", () => {
    const required = [
      "glowIntensity",
      "borderRadius",
      "cardElevation",
      "gradientMeshOpacity",
      "animationScale",
    ];
    for (const theme of themes) {
      for (const key of required) {
        expect(
          theme.aesthetic,
          `${theme.id} missing aesthetic.${key}`
        ).toHaveProperty(key);
      }
    }
  });

  it("glowIntensity is between 0 and 1", () => {
    for (const theme of themes) {
      expect(theme.aesthetic!.glowIntensity).toBeGreaterThanOrEqual(0);
      expect(theme.aesthetic!.glowIntensity).toBeLessThanOrEqual(1);
    }
  });

  it("gradientMeshOpacity is between 0 and 0.1", () => {
    for (const theme of themes) {
      expect(theme.aesthetic!.gradientMeshOpacity).toBeGreaterThanOrEqual(0);
      expect(theme.aesthetic!.gradientMeshOpacity).toBeLessThanOrEqual(0.1);
    }
  });

  it("borderRadius is a valid preset", () => {
    const valid = ["sharp", "medium", "soft"];
    for (const theme of themes) {
      expect(valid).toContain(theme.aesthetic!.borderRadius);
    }
  });

  it("cardElevation is a valid preset", () => {
    const valid = ["flat", "shadow", "glow"];
    for (const theme of themes) {
      expect(valid).toContain(theme.aesthetic!.cardElevation);
    }
  });

  it("animationScale is a valid preset", () => {
    const valid = ["minimal", "full"];
    for (const theme of themes) {
      expect(valid).toContain(theme.aesthetic!.animationScale);
    }
  });
});
