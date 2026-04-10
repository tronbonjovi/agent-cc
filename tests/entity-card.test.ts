// tests/entity-card.test.ts
import { describe, it, expect } from "vitest";
import {
  statusBadgeClass,
  statusBadgeLabel,
  healthDotClass,
  type EntityCardStatus,
  type EntityCardHealth,
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
