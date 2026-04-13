import { describe, it, expect } from "vitest";
import {
  applySessionPreset,
  toggleSessionPill,
  isSessionPillActive,
  type SessionFilterBarState,
} from "@/components/analytics/sessions/SessionFilterBar";

describe("SessionFilterBar pure helpers", () => {
  it("applySessionPreset: default — Overview, Tools, Tokens, LinkedTask on, errorsOnly off", () => {
    const state = applySessionPreset("default");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(true);
    expect(state.linkedTask).toBe(true);
    expect(state.errorsOnly).toBe(false);
  });

  it("applySessionPreset: deep-dive — every pill on, errorsOnly off", () => {
    const state = applySessionPreset("deep-dive");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(true);
    expect(state.linkedTask).toBe(true);
    expect(state.errorsOnly).toBe(false);
  });

  it("applySessionPreset: errors — Overview + Tools on, errorsOnly on", () => {
    const state = applySessionPreset("errors");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(false);
    expect(state.linkedTask).toBe(false);
    expect(state.errorsOnly).toBe(true);
  });

  it("toggleSessionPill: flips a single pill", () => {
    const start = applySessionPreset("default");
    const next = toggleSessionPill(start, "tokens");
    expect(next.tokens).toBe(false);
    expect(next.overview).toBe(true); // unchanged
    const back = toggleSessionPill(next, "tokens");
    expect(back.tokens).toBe(true);
  });

  it("isSessionPillActive: reads the matching key", () => {
    const state: SessionFilterBarState = {
      overview: true, tools: false, tokens: true, linkedTask: false, errorsOnly: true,
    };
    expect(isSessionPillActive(state, "overview")).toBe(true);
    expect(isSessionPillActive(state, "tools")).toBe(false);
    expect(isSessionPillActive(state, "tokens")).toBe(true);
    expect(isSessionPillActive(state, "linkedTask")).toBe(false);
    expect(isSessionPillActive(state, "errorsOnly")).toBe(true);
  });

  it("preset visually activates the pills it contains", () => {
    // The render contract: after applying `deep-dive`, every pill key is true,
    // so `isSessionPillActive` returns true for each. This guarantees the JSX
    // pill buttons all render in their active style.
    const state = applySessionPreset("deep-dive");
    for (const pill of ["overview", "tools", "tokens", "linkedTask"] as const) {
      expect(isSessionPillActive(state, pill)).toBe(true);
    }
  });
});
