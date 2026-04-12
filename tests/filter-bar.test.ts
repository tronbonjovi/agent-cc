// tests/filter-bar.test.ts
//
// Tests for the Messages tab FilterBar component
// (messages-redesign task005).
//
// Matches the project convention: pure helpers exported from the component
// module are tested directly with TypeScript imports, and React structure
// is verified through file-text / regex guardrails (vitest excludes
// `client/` from its run, so no jsdom / RTL).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/FilterBar.tsx",
);

// ---------------------------------------------------------------------------
// File-structure guardrails
// ---------------------------------------------------------------------------

describe("FilterBar — source structure", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a FilterBar component", () => {
    expect(src).toMatch(/export\s+function\s+FilterBar/);
  });

  it("imports FilterState from the ConversationViewer module", () => {
    // Guardrail: the contract requires using the existing FilterState
    // exported from ConversationViewer rather than defining a new one.
    expect(src).toMatch(/FilterState/);
    expect(src).toMatch(/ConversationViewer/);
  });

  it("renders six toggle pills with the contract labels", () => {
    // Each label appears as plain text in the JSX. Order is the contract
    // order: Conversation, Thinking, Tools, System, Sidechains, Errors Only.
    expect(src).toMatch(/Conversation/);
    expect(src).toMatch(/Thinking/);
    expect(src).toMatch(/Tools/);
    expect(src).toMatch(/System/);
    expect(src).toMatch(/Sidechains/);
    expect(src).toMatch(/Errors Only/);
  });

  it("renders the three mode preset buttons", () => {
    // We look for the canonical preset ids in the source. The component
    // builds a `<button data-preset={preset.id}>` per entry; the ids live
    // in the PRESETS table where we guardrail against typos / renames.
    expect(src).toMatch(/id:\s*["']conversation["']/);
    expect(src).toMatch(/id:\s*["']full["']/);
    expect(src).toMatch(/id:\s*["']errors["']/);
    expect(src).toMatch(/data-preset=/);
  });

  it("does not use bounce/scale animations (safety rule)", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/hover:scale-/);
    expect(src).not.toMatch(/active:scale-/);
  });

  it("does not use text gradients on the pills (safety rule)", () => {
    // Decorative gradients are explicitly out per project safety rules.
    expect(src).not.toMatch(/bg-gradient-to-/);
    expect(src).not.toMatch(/text-transparent/);
  });

  it("uses solid Tailwind palette tokens for the active pill background", () => {
    // Look for at least one bg-<color>-500/600 class — the project uses
    // these as the canonical solid-color tokens.
    expect(src).toMatch(/bg-(blue|purple|emerald|amber|cyan|red|orange|sky|indigo|pink|teal|green|rose|violet|fuchsia)-(400|500|600)/);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — preset application
// ---------------------------------------------------------------------------

describe("FilterBar — applyPreset helper", () => {
  it("exports applyPreset", async () => {
    const mod = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    expect(typeof mod.applyPreset).toBe("function");
  });

  it("'conversation' preset shows only user/assistant text", async () => {
    const { applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const next = applyPreset("conversation");
    expect(next.userText).toBe(true);
    expect(next.assistantText).toBe(true);
    expect(next.thinking).toBe(false);
    expect(next.toolCalls).toBe(false);
    expect(next.toolResults).toBe(false);
    expect(next.systemEvents).toBe(false);
    expect(next.skillInvocations).toBe(false);
    expect(next.sidechains).toBe(true);
    expect(next.errorsOnly).toBe(false);
  });

  it("'full' preset turns every type on", async () => {
    const { applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const next = applyPreset("full");
    expect(next.userText).toBe(true);
    expect(next.assistantText).toBe(true);
    expect(next.thinking).toBe(true);
    expect(next.toolCalls).toBe(true);
    expect(next.toolResults).toBe(true);
    expect(next.systemEvents).toBe(true);
    expect(next.skillInvocations).toBe(true);
    expect(next.sidechains).toBe(true);
    expect(next.errorsOnly).toBe(false);
  });

  it("'errors' preset enables errors-only and tool results", async () => {
    const { applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const next = applyPreset("errors");
    // Errors Only is the headline of the preset.
    expect(next.errorsOnly).toBe(true);
    // Tool results must be enabled or there's nothing to filter for errors.
    expect(next.toolResults).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pill grouping — togglePillGroup helper
// ---------------------------------------------------------------------------

describe("FilterBar — togglePillGroup helper", () => {
  it("exports togglePillGroup", async () => {
    const mod = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    expect(typeof mod.togglePillGroup).toBe("function");
  });

  it("toggling 'conversation' flips both userText and assistantText together", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    // Start from full so both fields are ON.
    const start = applyPreset("full");
    const off = togglePillGroup(start, "conversation");
    expect(off.userText).toBe(false);
    expect(off.assistantText).toBe(false);
    // Toggling again should flip them both back ON.
    const on = togglePillGroup(off, "conversation");
    expect(on.userText).toBe(true);
    expect(on.assistantText).toBe(true);
  });

  it("toggling 'tools' flips both toolCalls and toolResults together", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const start = applyPreset("full");
    const off = togglePillGroup(start, "tools");
    expect(off.toolCalls).toBe(false);
    expect(off.toolResults).toBe(false);
  });

  it("toggling 'system' flips both systemEvents and skillInvocations together", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const start = applyPreset("full");
    const off = togglePillGroup(start, "system");
    expect(off.systemEvents).toBe(false);
    expect(off.skillInvocations).toBe(false);
  });

  it("toggling 'thinking' flips only thinking", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const start = applyPreset("full");
    const off = togglePillGroup(start, "thinking");
    expect(off.thinking).toBe(false);
    // Other fields untouched.
    expect(off.userText).toBe(true);
    expect(off.assistantText).toBe(true);
  });

  it("toggling 'sidechains' flips only the sidechains flag", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const start = applyPreset("full");
    const off = togglePillGroup(start, "sidechains");
    expect(off.sidechains).toBe(false);
    // Type fields untouched.
    expect(off.thinking).toBe(true);
  });

  it("toggling 'errorsOnly' flips only the errorsOnly flag", async () => {
    const { togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const start = applyPreset("full");
    const on = togglePillGroup(start, "errorsOnly");
    expect(on.errorsOnly).toBe(true);
    // Type fields untouched.
    expect(on.thinking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pill state derivation — isPillActive helper
// ---------------------------------------------------------------------------

describe("FilterBar — isPillActive helper", () => {
  it("exports isPillActive", async () => {
    const mod = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    expect(typeof mod.isPillActive).toBe("function");
  });

  it("'conversation' is active when both userText and assistantText are on", async () => {
    const { isPillActive, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const full = applyPreset("full");
    expect(isPillActive(full, "conversation")).toBe(true);
  });

  it("'conversation' is inactive when both userText and assistantText are off", async () => {
    const { isPillActive, togglePillGroup, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const full = applyPreset("full");
    const off = togglePillGroup(full, "conversation");
    expect(isPillActive(off, "conversation")).toBe(false);
  });

  it("'tools' is active when either tool field is on (compound OR)", async () => {
    const { isPillActive, applyPreset } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    // We treat compound pills as ACTIVE if any constituent is on.
    const full = applyPreset("full");
    expect(isPillActive(full, "tools")).toBe(true);
  });

  it("'thinking' tracks the single thinking key", async () => {
    const { isPillActive, applyPreset, togglePillGroup } = await import(
      "../client/src/components/analytics/messages/FilterBar"
    );
    const full = applyPreset("full");
    expect(isPillActive(full, "thinking")).toBe(true);
    const off = togglePillGroup(full, "thinking");
    expect(isPillActive(off, "thinking")).toBe(false);
  });
});
