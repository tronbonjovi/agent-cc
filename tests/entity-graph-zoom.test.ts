import { describe, it, expect } from "vitest";
import {
  computeZoomTransform,
  ZOOM_MIN,
  ZOOM_MAX,
  type Transform,
} from "../client/src/components/analytics/entity-graph/zoom-math";

const identity: Transform = { x: 0, y: 0, scale: 1 };

// Round-trip: the canvas point under the cursor before zoom should land
// back under the cursor after zoom.
function canvasUnder(t: Transform, cursorX: number, cursorY: number) {
  return {
    x: (cursorX - t.x) / t.scale,
    y: (cursorY - t.y) / t.scale,
  };
}

describe("computeZoomTransform", () => {
  it("keeps the canvas point under the cursor fixed when zooming in at origin", () => {
    const before = canvasUnder(identity, 100, 100);
    const next = computeZoomTransform(identity, 100, 100, -1);
    const after = canvasUnder(next, 100, 100);
    expect(next.scale).toBeCloseTo(1.1, 5);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it("keeps the canvas point fixed when zooming after a pan", () => {
    const panned: Transform = { x: 50, y: -20, scale: 1.5 };
    const cursor = { x: 240, y: 130 };
    const before = canvasUnder(panned, cursor.x, cursor.y);
    const next = computeZoomTransform(panned, cursor.x, cursor.y, -1);
    const after = canvasUnder(next, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it("returns prev unchanged when zooming past the max clamp", () => {
    const atMax: Transform = { x: 10, y: 20, scale: ZOOM_MAX };
    const next = computeZoomTransform(atMax, 300, 400, -1);
    expect(next).toBe(atMax);
  });

  it("returns prev unchanged when zooming past the min clamp", () => {
    const atMin: Transform = { x: 10, y: 20, scale: ZOOM_MIN };
    const next = computeZoomTransform(atMin, 300, 400, 1);
    expect(next).toBe(atMin);
  });

  it("clamps scale when moving toward but not past the bounds", () => {
    const nearMax: Transform = { x: 0, y: 0, scale: 2.9 };
    const next = computeZoomTransform(nearMax, 100, 100, -1);
    expect(next.scale).toBeLessThanOrEqual(ZOOM_MAX);
    expect(next.scale).toBeGreaterThan(nearMax.scale);
  });

  it("leaves the cursor-anchored canvas point fixed across many successive zooms", () => {
    let t: Transform = { x: 30, y: 12, scale: 0.8 };
    const cursor = { x: 420, y: 260 };
    const start = canvasUnder(t, cursor.x, cursor.y);
    for (let i = 0; i < 10; i++) {
      t = computeZoomTransform(t, cursor.x, cursor.y, -1);
    }
    const end = canvasUnder(t, cursor.x, cursor.y);
    expect(end.x).toBeCloseTo(start.x, 4);
    expect(end.y).toBeCloseTo(start.y, 4);
  });
});
