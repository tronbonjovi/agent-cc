// tests/entity-card.test.ts
import { describe, it, expect } from "vitest";
import {
  statusBadgeClass,
  statusBadgeLabel,
  healthDotClass,
  cardVariantClasses,
  type EntityCardStatus,
  type EntityCardHealth,
  type EntityCardVariant,
} from "../client/src/components/library/entity-card";

describe("entity-card status badge", () => {
  it("returns correct class for installed status", () => {
    expect(statusBadgeClass("installed")).toBe(
      "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    );
  });

  it("returns correct class for saved status", () => {
    expect(statusBadgeClass("saved")).toBe(
      "bg-blue-500/10 text-blue-500 border-blue-500/20"
    );
  });

  it("returns correct class for available status", () => {
    expect(statusBadgeClass("available")).toBe(
      "bg-slate-500/10 text-slate-400 border-slate-500/20"
    );
  });

  it("returns correct label for each status", () => {
    expect(statusBadgeLabel("installed")).toBe("Installed");
    expect(statusBadgeLabel("saved")).toBe("Saved");
    expect(statusBadgeLabel("available")).toBe("Available");
  });
});

describe("entity-card health dot", () => {
  it("returns green class for healthy", () => {
    expect(healthDotClass("healthy")).toBe("bg-emerald-500");
  });

  it("returns amber class for degraded", () => {
    expect(healthDotClass("degraded")).toBe("bg-amber-500");
  });

  it("returns red class for error", () => {
    expect(healthDotClass("error")).toBe("bg-red-500");
  });

  it("returns null when health is undefined", () => {
    expect(healthDotClass(undefined)).toBeNull();
  });
});

describe("entity-card prop types", () => {
  it("status type accepts only valid values", () => {
    const validStatuses: EntityCardStatus[] = ["installed", "saved", "available"];
    validStatuses.forEach((s) => {
      expect(statusBadgeClass(s)).toBeTruthy();
    });
  });

  it("health type accepts only valid values", () => {
    const validHealth: EntityCardHealth[] = ["healthy", "degraded", "error"];
    validHealth.forEach((h) => {
      expect(healthDotClass(h)).toBeTruthy();
    });
  });
});

describe("entity-card variant classes", () => {
  it("returns card variant classes by default", () => {
    const classes = cardVariantClasses(undefined);
    expect(classes.container).toContain("p-2");
    expect(classes.container).toContain("rounded-md");
    expect(classes.description).toContain("line-clamp-1");
  });

  it("returns card variant classes when explicitly set", () => {
    const classes = cardVariantClasses("card");
    expect(classes.container).toContain("p-2");
    expect(classes.description).toContain("line-clamp-1");
  });

  it("returns row variant classes", () => {
    const classes = cardVariantClasses("row");
    expect(classes.container).toContain("px-2");
    expect(classes.container).toContain("py-1.5");
    expect(classes.container).toContain("rounded-sm");
    // Row variant should not have description class (description hidden)
    expect(classes.description).toBe("");
  });

  it("card variant includes vertical layout markers", () => {
    const classes = cardVariantClasses("card");
    expect(classes.layout).toContain("flex-col");
  });

  it("row variant includes horizontal layout markers", () => {
    const classes = cardVariantClasses("row");
    expect(classes.layout).toContain("flex-row");
    expect(classes.layout).toContain("items-center");
  });

  it("variant type accepts only valid values", () => {
    const validVariants: EntityCardVariant[] = ["card", "row"];
    validVariants.forEach((v) => {
      const classes = cardVariantClasses(v);
      expect(classes.container).toBeTruthy();
      expect(classes.layout).toBeTruthy();
    });
  });
});
