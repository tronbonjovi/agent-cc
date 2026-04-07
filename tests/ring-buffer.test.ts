import { describe, it, expect } from "vitest";
import { RingBuffer } from "../server/ring-buffer";

describe("RingBuffer", () => {
  it("stores and retrieves chunks in order", () => {
    const buf = new RingBuffer(10);
    buf.push("hello");
    buf.push("world");
    expect(buf.getAll()).toEqual(["hello", "world"]);
  });

  it("returns empty array when empty", () => {
    const buf = new RingBuffer(10);
    expect(buf.getAll()).toEqual([]);
  });

  it("overwrites oldest when capacity exceeded", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    buf.push("d"); // overwrites "a"
    expect(buf.getAll()).toEqual(["b", "c", "d"]);
  });

  it("handles single capacity", () => {
    const buf = new RingBuffer(1);
    buf.push("first");
    buf.push("second");
    expect(buf.getAll()).toEqual(["second"]);
  });

  it("clears all data", () => {
    const buf = new RingBuffer(10);
    buf.push("a");
    buf.push("b");
    buf.clear();
    expect(buf.getAll()).toEqual([]);
  });

  it("works after clear and re-fill", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.clear();
    buf.push("x");
    buf.push("y");
    expect(buf.getAll()).toEqual(["x", "y"]);
  });

  it("handles exact capacity fill", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    expect(buf.getAll()).toEqual(["a", "b", "c"]);
  });

  it("handles many overwrites", () => {
    const buf = new RingBuffer(2);
    for (let i = 0; i < 100; i++) {
      buf.push(String(i));
    }
    expect(buf.getAll()).toEqual(["98", "99"]);
  });

  it("reports count correctly", () => {
    const buf = new RingBuffer(5);
    expect(buf.size).toBe(0);
    buf.push("a");
    expect(buf.size).toBe(1);
    buf.push("b");
    buf.push("c");
    expect(buf.size).toBe(3);
  });

  it("count does not exceed capacity", () => {
    const buf = new RingBuffer(2);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    expect(buf.size).toBe(2);
  });
});
