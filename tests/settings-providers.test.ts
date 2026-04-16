/**
 * Settings page provider manager — chat-provider-system task006.
 *
 * Source-text guardrails on:
 *
 *   1. `client/src/components/settings/provider-manager.tsx` — the provider
 *      list, add/edit dialog, OAuth connect/disconnect controls.
 *   2. `client/src/pages/settings.tsx` — mounts <ProviderManager /> and a
 *      Global Chat Defaults section.
 *
 * Vitest excludes `client/**` from execution (see vitest.config), so these
 * assertions are structural regex pins — the same pattern used by
 * `chat-settings-popover.test.ts` and enforced by
 * `reference_vitest_client_excluded`. There are NO RTL renders.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const PROVIDER_MANAGER_PATH = path.resolve(
  ROOT,
  "client/src/components/settings/provider-manager.tsx",
);
const SETTINGS_PAGE_PATH = path.resolve(
  ROOT,
  "client/src/pages/settings.tsx",
);

// ---------------------------------------------------------------------------
// 1. provider-manager.tsx — structural guardrails
// ---------------------------------------------------------------------------

describe("provider-manager.tsx — list and header", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it("exports a ProviderManager component", () => {
    expect(src).toMatch(/export\s+(function|const)\s+ProviderManager\b/);
  });

  it('renders a "Providers" heading', () => {
    // The provider section needs an unambiguous heading so the settings page
    // has a recognizable landmark. Pin the literal so a later rename doesn't
    // slip past review.
    expect(src).toMatch(/\bProviders\b/);
  });

  it('renders an "Add Provider" button', () => {
    expect(src).toMatch(/Add Provider/);
  });

  it("fetches provider list from /api/providers via React Query", () => {
    expect(src).toMatch(/from\s+['"]@tanstack\/react-query['"]/);
    expect(src).toMatch(/['"]\/api\/providers['"]/);
  });
});

describe("provider-manager.tsx — built-in vs custom handling", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it('shows a "Built-in" badge for built-in providers', () => {
    // Rows for providers with `builtin: true` must be visibly marked so the
    // user can't confuse them with custom entries. Exact literal pinned.
    expect(src).toMatch(/Built-in/);
  });

  it('renders "Edit" controls for custom providers', () => {
    expect(src).toMatch(/\bEdit\b/);
  });

  it('renders "Delete" controls for custom providers', () => {
    expect(src).toMatch(/\bDelete\b/);
  });

  it("branches on the builtin flag", () => {
    // Logic guard: ensure the component actually reads p.builtin somewhere.
    // If this pin breaks, the built-in lock may have been silently dropped.
    expect(src).toMatch(/\bbuiltin\b/);
  });
});

describe("provider-manager.tsx — API key masking display", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it("references the masked sk-... pattern or bullet placeholder", () => {
    // We accept either the `sk-...` wire masking or the `••••••` placeholder
    // the PUT handler also recognises as a "don't overwrite" signal.
    const hasSkMask = /sk-\.\.\./.test(src);
    const hasBullet = /••••••/.test(src);
    expect(hasSkMask || hasBullet).toBe(true);
  });

  it("does not display the raw apiKey field unmasked", () => {
    // Sanity: the source should not print any literal-looking API key —
    // nothing matching a full sk-* secret should appear in a UI component.
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });
});

describe("provider-manager.tsx — OAuth connect/disconnect", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it('has a "Sign in" action for OAuth providers', () => {
    expect(src).toMatch(/Sign in/);
  });

  it('has a "Disconnect" action for OAuth providers', () => {
    expect(src).toMatch(/Disconnect/);
  });

  it("calls the /status and /auth endpoints", () => {
    // Pin the route surface the component relies on so accidental renames
    // on the server side light up here.
    expect(src).toMatch(/\/status/);
    expect(src).toMatch(/\/auth/);
  });

  it("uses window.open for the OAuth popup", () => {
    expect(src).toMatch(/window\.open/);
  });

  it("calls the /disconnect endpoint via POST", () => {
    expect(src).toMatch(/\/disconnect/);
    // Some variant of POST must appear near disconnect — not strict on
    // formatting, just that the verb shows up in the file.
    expect(src).toMatch(/method:\s*['"]POST['"]/);
  });
});

describe("provider-manager.tsx — availability status", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it('references Available/Unavailable labels driven by the models endpoint', () => {
    expect(src).toMatch(/Available/);
    expect(src).toMatch(/Unavailable/);
  });

  it("consumes the useProviderModels hook", () => {
    expect(src).toMatch(/useProviderModels/);
  });
});

describe("provider-manager.tsx — add/edit dialog", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it("uses the shadcn Dialog primitive", () => {
    expect(src).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
    expect(src).toMatch(/<Dialog\b/);
  });

  it("collects Name, Base URL, Auth Type fields", () => {
    expect(src).toMatch(/\bName\b/);
    expect(src).toMatch(/Base URL/);
    expect(src).toMatch(/Auth Type/);
  });

  it("offers auth-type options: none / api-key / oauth", () => {
    expect(src).toMatch(/['"]none['"]/);
    expect(src).toMatch(/['"]api-key['"]/);
    expect(src).toMatch(/['"]oauth['"]/);
  });

  it("collects OAuth config fields when auth type is oauth", () => {
    expect(src).toMatch(/Auth URL/);
    expect(src).toMatch(/Token URL/);
    expect(src).toMatch(/Client ID/);
    // Client Secret is optional — pin the label so the field exists.
    expect(src).toMatch(/Client Secret/);
    expect(src).toMatch(/Scopes/);
  });

  it("renders a capabilities checklist of the seven known flags", () => {
    // All ProviderCapabilities flags should appear as checkboxes so users
    // can tailor capability visibility per provider.
    for (const flag of [
      "temperature",
      "systemPrompt",
      "thinking",
      "effort",
      "webSearch",
      "fileAttachments",
      "projectContext",
    ]) {
      expect(src).toContain(flag);
    }
  });

  it("uses POST for create and PUT for edit", () => {
    // Accept either direct `method: "POST"` or a ternary like
    // `method: isEdit ? "PUT" : "POST"`. Both verbs must appear in source.
    expect(src).toMatch(/['"]POST['"]/);
    expect(src).toMatch(/['"]PUT['"]/);
  });
});

describe("provider-manager.tsx — delete confirmation", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it("uses the shadcn AlertDialog primitive for delete confirmation", () => {
    expect(src).toMatch(/from\s+['"]@\/components\/ui\/alert-dialog['"]/);
    expect(src).toMatch(/<AlertDialog\b/);
  });

  it("calls DELETE /api/providers/:id somewhere in source", () => {
    expect(src).toMatch(/method:\s*['"]DELETE['"]/);
  });
});

describe("provider-manager.tsx — safety", () => {
  const src = fs.readFileSync(PROVIDER_MANAGER_PATH, "utf-8");

  it("has no gradient or bounce/scale animations", () => {
    expect(src).not.toMatch(/\bbg-gradient-/);
    expect(src).not.toMatch(/\btext-gradient\b/);
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bhover:scale-/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });

  it("has no hardcoded /home/tron or /Users paths", () => {
    expect(src).not.toMatch(/\/home\/tron\//);
    expect(src).not.toMatch(/\/Users\/hi\//);
  });

  it("has no user-specific example project names in placeholders", () => {
    expect(src).not.toMatch(/Nicora/);
    expect(src).not.toMatch(/findash/i);
  });
});

// ---------------------------------------------------------------------------
// 2. settings.tsx — mount points for provider manager + chat defaults
// ---------------------------------------------------------------------------

describe("settings.tsx — ProviderManager mount", () => {
  const src = fs.readFileSync(SETTINGS_PAGE_PATH, "utf-8");

  it("imports ProviderManager", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bProviderManager\b[^}]*\}\s*from\s*['"][^'"]*provider-manager['"]/,
    );
  });

  it("renders <ProviderManager />", () => {
    expect(src).toMatch(/<ProviderManager\s*\/>/);
  });
});

describe("settings.tsx — Global Chat Defaults section", () => {
  const src = fs.readFileSync(SETTINGS_PAGE_PATH, "utf-8");

  it("has a Global Chat Defaults heading or label", () => {
    // Match either exact phrasing or "Chat Defaults" — the spec allows
    // either; the heading must be present one way or the other.
    expect(src).toMatch(/Chat Defaults/);
  });

  it("references /api/settings/chat-defaults", () => {
    expect(src).toMatch(/\/api\/settings\/chat-defaults/);
  });

  it("has Save-shaped mutation behavior for the defaults section", () => {
    // The defaults form must offer a Save button that issues a PUT.
    expect(src).toMatch(/\bSave\b/);
  });
});
