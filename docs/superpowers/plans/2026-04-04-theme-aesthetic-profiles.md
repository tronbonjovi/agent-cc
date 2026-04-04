# Theme Aesthetic Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each theme feel native by controlling not just colors but the visual personality — glow intensity, border radius, card elevation style, gradient mesh, animation scale, and fonts.

**Architecture:** Add an `aesthetic` property to `ThemeDefinition` that holds non-color visual tokens (glow intensity, border radius, card elevation, gradient mesh opacity, animation scale). These map to CSS custom properties that the existing utility classes and index.css reference. The CSS responds to these tokens via `var()` with fallbacks, so no component JSX changes are needed — it's all CSS-level.

**Tech Stack:** CSS custom properties, Tailwind config, existing theme registry

---

## Context

The current theme system controls colors comprehensively (60+ CSS variable tokens), but the visual personality is hardcoded — every theme gets the same neon glows, gradient mesh, sharp corners, and card hover animations. This makes non-cyberpunk themes (Anthropic, Nord, Catppuccin) look like "the same app with different paint."

Research shows most well-regarded themes are "minimal" animation with flat or subtle shadow elevation. Only Dracula/Glass genuinely support the cyberpunk glow aesthetic. The current default is the outlier.

### Aesthetic Token Summary (from research)

| Theme | Glow | Radius | Elevation | Mesh Opacity | Animation |
|---|---|---|---|---|---|
| Dark (current default) | 0.6 | medium (6px) | glow | 0.035 | full |
| Light | 0 | medium (6px) | shadow | 0.02 | minimal |
| Glass | 0.8 | medium (6px) | glow+blur | 0.06 | full |
| Anthropic | 0 | soft (12px) | shadow (warm) | 0.02 | minimal |
| Catppuccin Mocha | 0.1 | medium (8px) | flat | 0.03 | minimal |
| Nord | 0 | sharp (4px) | flat | 0.01 | minimal |
| Dracula | 0.4 | medium (8px) | glow (accent) | 0.04 | full |
| Rose Pine | 0.05 | medium (8px) | shadow (warm) | 0.03 | minimal |
| Tokyo Night | 0.15 | medium (8px) | shadow (cool) | 0.03 | minimal |
| Solarized Dark | 0 | sharp (2px) | flat | 0.01 | minimal |
| Tomorrow Night | 0 | sharp (4px) | flat | 0.01 | minimal |
| Oceanic Next | 0.1 | medium (6px) | shadow (teal) | 0.03 | minimal |
| One Half Dark | 0 | medium (6px) | flat | 0.02 | minimal |

### File Structure

```
client/src/themes/
  types.ts              — MODIFY: Add ThemeAesthetic interface
  dark.ts               — MODIFY: Add aesthetic property
  light.ts              — MODIFY: Add aesthetic property
  glass.ts              — MODIFY: Add aesthetic property
  anthropic.ts          — MODIFY: Add aesthetic property (light variant rewrite)
  catppuccin-mocha.ts   — MODIFY: Add aesthetic property
  nord.ts               — MODIFY: Add aesthetic property
  dracula.ts            — MODIFY: Add aesthetic property
  tokyo-night.ts        — MODIFY: Add aesthetic property
  solarized-dark.ts     — MODIFY: Add aesthetic property
  rose-pine.ts          — CREATE: New theme
  tomorrow-night.ts     — CREATE: New theme
  oceanic-next.ts       — CREATE: New theme
  one-half-dark.ts      — CREATE: New theme
  index.ts              — MODIFY: Register new themes, inject aesthetic CSS

client/src/index.css    — MODIFY: Replace hardcoded values with var() references
tailwind.config.ts      — MODIFY: Border radius uses CSS vars
client/src/hooks/use-theme.ts — MODIFY: Apply aesthetic tokens to root element

tests/theme-aesthetic.test.ts — CREATE: Tests for aesthetic token completeness
```

---

### Task 1: Define ThemeAesthetic type and extend ThemeDefinition

**Files:**
- Modify: `client/src/themes/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/theme-aesthetic.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme-aesthetic.test.ts`
Expected: FAIL — `aesthetic` property does not exist on themes

- [ ] **Step 3: Add ThemeAesthetic type**

In `client/src/themes/types.ts`, add the `ThemeAesthetic` interface and make it required on `ThemeDefinition`:

```typescript
export type BorderRadius = "sharp" | "medium" | "soft";
export type CardElevation = "flat" | "shadow" | "glow";
export type AnimationScale = "minimal" | "full";

export interface ThemeAesthetic {
  glowIntensity: number;        // 0 (no glow) to 1 (full neon)
  borderRadius: BorderRadius;   // sharp=3px, medium=8px, soft=12px
  cardElevation: CardElevation; // flat=border only, shadow=box-shadow, glow=colored glow
  gradientMeshOpacity: number;  // 0 to 0.1 — #root::before mesh opacity
  animationScale: AnimationScale; // minimal=reduced decorative, full=current cyberpunk
}
```

Add `aesthetic: ThemeAesthetic;` to `ThemeDefinition`.

- [ ] **Step 4: Commit**

```bash
git add client/src/themes/types.ts tests/theme-aesthetic.test.ts
git commit -m "feat: add ThemeAesthetic type and validation tests"
```

---

### Task 2: Add aesthetic profiles to all existing themes

**Files:**
- Modify: `client/src/themes/dark.ts`
- Modify: `client/src/themes/light.ts`
- Modify: `client/src/themes/glass.ts`
- Modify: `client/src/themes/anthropic.ts`
- Modify: `client/src/themes/catppuccin-mocha.ts`
- Modify: `client/src/themes/nord.ts`
- Modify: `client/src/themes/dracula.ts`
- Modify: `client/src/themes/tokyo-night.ts`
- Modify: `client/src/themes/solarized-dark.ts`

- [ ] **Step 1: Add aesthetic to each theme**

Use the values from the research table above. Example for dark.ts:

```typescript
aesthetic: {
  glowIntensity: 0.6,
  borderRadius: "medium",
  cardElevation: "glow",
  gradientMeshOpacity: 0.035,
  animationScale: "full",
},
```

And for anthropic.ts (also change `variant: "dark"` to `variant: "light"` and update color values to warm cream light palette):

```typescript
variant: "light",
aesthetic: {
  glowIntensity: 0,
  borderRadius: "soft",
  cardElevation: "shadow",
  gradientMeshOpacity: 0.02,
  animationScale: "minimal",
},
```

See the research table in the Context section above for all values.

**Important: Anthropic theme rewrite.** The Anthropic theme should become a `light` variant with warm cream backgrounds (#faf9f5 range), not dark. This is the most impactful single change — it makes CCC feel comfortable alongside the Claude desktop app. Rewrite the full color palette for the light variant.

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/theme-aesthetic.test.ts`
Expected: PASS — all themes have valid aesthetic properties

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add client/src/themes/*.ts
git commit -m "feat: add aesthetic profiles to all 9 existing themes"
```

---

### Task 3: Create 4 new community themes (Rose Pine, Tomorrow Night, Oceanic Next, One Half Dark)

**Files:**
- Create: `client/src/themes/rose-pine.ts`
- Create: `client/src/themes/tomorrow-night.ts`
- Create: `client/src/themes/oceanic-next.ts`
- Create: `client/src/themes/one-half-dark.ts`
- Modify: `client/src/themes/index.ts`

- [ ] **Step 1: Create Rose Pine theme**

Reference: https://rosepinetheme.com/palette
- Base: #191724, Surface: #1f1d2e, Overlay: #26233a
- Text: #e0def4, Subtle: #908caa, Muted: #6e6a86
- Love: #eb6f92, Gold: #f6c177, Rose: #ebbcba, Pine: #31748f, Foam: #9ccfd8, Iris: #c4a7e7

```typescript
aesthetic: {
  glowIntensity: 0.05,
  borderRadius: "medium",
  cardElevation: "shadow",
  gradientMeshOpacity: 0.03,
  animationScale: "minimal",
},
```

- [ ] **Step 2: Create Tomorrow Night theme**

Reference: https://github.com/chriskempson/tomorrow-theme
- Background: #1d1f21, Current Line: #282a2e, Selection: #373b41
- Foreground: #c5c8c6, Comment: #969896
- Red: #cc6666, Orange: #de935f, Yellow: #f0c674, Green: #b5bd68, Aqua: #8abeb7, Blue: #81a2be, Purple: #b294bb

```typescript
aesthetic: {
  glowIntensity: 0,
  borderRadius: "sharp",
  cardElevation: "flat",
  gradientMeshOpacity: 0.01,
  animationScale: "minimal",
},
```

- [ ] **Step 3: Create Oceanic Next theme**

Reference: https://github.com/voronianski/oceanic-next-color-scheme
- Base: #1b2b34, Light background: #343d46
- Text: #d8dee9, Comment: #65737e
- Red: #ec5f67, Orange: #f99157, Yellow: #fac863, Green: #99c794, Cyan: #5fb3b3, Blue: #6699cc, Purple: #c594c5

```typescript
aesthetic: {
  glowIntensity: 0.1,
  borderRadius: "medium",
  cardElevation: "shadow",
  gradientMeshOpacity: 0.03,
  animationScale: "minimal",
},
```

- [ ] **Step 4: Create One Half Dark theme**

Reference: https://github.com/sonph/onehalf
- Background: #282c34, Foreground: #dcdfe4
- Red: #e06c75, Green: #98c379, Yellow: #e5c07b, Blue: #61afef, Purple: #c678dd, Cyan: #56b6c2

```typescript
aesthetic: {
  glowIntensity: 0,
  borderRadius: "medium",
  cardElevation: "flat",
  gradientMeshOpacity: 0.02,
  animationScale: "minimal",
},
```

- [ ] **Step 5: Register all new themes in index.ts**

Add imports and push to the `themes` array.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/theme-aesthetic.test.ts && npm test`
Expected: All tests pass, including new themes in aesthetic validation

- [ ] **Step 7: Commit**

```bash
git add client/src/themes/*.ts tests/theme-aesthetic.test.ts
git commit -m "feat: add Rose Pine, Tomorrow Night, Oceanic Next, One Half Dark themes"
```

---

### Task 4: Inject aesthetic tokens as CSS custom properties

**Files:**
- Modify: `client/src/themes/index.ts`
- Modify: `client/src/hooks/use-theme.ts`

The aesthetic tokens need to become CSS custom properties that index.css can reference. There are two approaches:

1. Add them to the generated `[data-theme]` style blocks (via `buildThemeCSS`)
2. Set them as inline styles on the root element (via `applyTheme`)

Use approach 1 — extend `buildThemeCSS` to include aesthetic tokens in the generated CSS.

- [ ] **Step 1: Extend buildThemeCSS to include aesthetic tokens**

In `client/src/themes/index.ts`, modify the `themeToCSS` function:

```typescript
function themeToCSS(theme: ThemeDefinition): string {
  const colorLines = Object.entries(theme.colors)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const radiusMap = { sharp: "3px", medium: "8px", soft: "12px" };
  const { aesthetic } = theme;

  const aestheticLines = [
    `  --glow-intensity: ${aesthetic.glowIntensity};`,
    `  --card-radius: ${radiusMap[aesthetic.borderRadius]};`,
    `  --card-elevation: ${aesthetic.cardElevation};`,
    `  --gradient-mesh-opacity: ${aesthetic.gradientMeshOpacity};`,
    `  --animation-scale: ${aesthetic.animationScale === "full" ? "1" : "0"};`,
  ].join("\n");

  return `${colorLines}\n${aestheticLines}`;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/themes/index.ts
git commit -m "feat: inject aesthetic tokens into theme CSS"
```

---

### Task 5: Wire CSS to respond to aesthetic tokens — glow intensity

**Files:**
- Modify: `client/src/index.css`

The glow intensity token scales all glow effects. When `--glow-intensity: 0`, all glows disappear.

- [ ] **Step 1: Wrap glow classes with intensity scaling**

In `client/src/index.css`, update the neon-glow classes:

```css
/* Entity-colored neon glow shadows — scaled by theme glow intensity */
.neon-glow-blue { box-shadow: 0 0 calc(12px * var(--glow-intensity, 1)) var(--glow-blue); }
.neon-glow-green { box-shadow: 0 0 calc(12px * var(--glow-intensity, 1)) var(--glow-green); }
.neon-glow-purple { box-shadow: 0 0 calc(12px * var(--glow-intensity, 1)) var(--glow-purple); }
.neon-glow-amber { box-shadow: 0 0 calc(12px * var(--glow-intensity, 1)) var(--glow-amber); }
```

- [ ] **Step 2: Scale gradient-border hover opacity with glow intensity**

```css
.gradient-border:hover::before {
  opacity: var(--glow-intensity, 1);
}
```

- [ ] **Step 3: Scale card-hover glow with glow intensity**

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15), 0 0 calc(12px * var(--glow-intensity, 1)) hsl(var(--primary) / 0.06);
}
```

- [ ] **Step 4: Scale brand-glow animation with glow intensity**

Wrap `brand-glow` with intensity:

```css
.brand-glow {
  animation: brand-glow-rotate calc(20s / max(var(--glow-intensity, 1), 0.01)) ease-in-out infinite;
  opacity: max(var(--glow-intensity, 1), 0);
}
```

When glow-intensity is 0, the brand-glow animation effectively disappears.

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "feat: wire glow intensity token into CSS"
```

---

### Task 6: Wire CSS to respond to aesthetic tokens — gradient mesh opacity

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace hardcoded mesh opacity with token**

```css
#root::before {
  ...
  opacity: var(--gradient-mesh-opacity, 0.035);
}
```

Remove the `[data-variant="light"] #root::before` and `[data-theme="glass"] #root::before` opacity overrides — the token now handles per-theme opacity directly.

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "feat: wire gradient mesh opacity token"
```

---

### Task 7: Wire CSS to respond to aesthetic tokens — border radius

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Make border radius reference CSS variable**

```typescript
borderRadius: {
  lg: "var(--card-radius, .5625rem)",
  md: "calc(var(--card-radius, .375rem) * 0.67)",
  sm: "calc(var(--card-radius, .1875rem) * 0.33)",
},
```

This scales all three radius levels proportionally when the theme changes `--card-radius`.

- [ ] **Step 2: Run TypeScript check and tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: wire border radius to theme aesthetic token"
```

---

### Task 8: Wire CSS to respond to aesthetic tokens — card elevation and animation scale

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Card elevation styles**

Add elevation-mode-specific styles:

```css
/* Card elevation: flat mode — border only, no shadow */
[data-theme] .card-hover:hover {
  transform: translateY(-1px);
}

/* Override card-hover shadow when elevation is flat */
:root[style*="--card-elevation: flat"] .card-hover:hover,
/* Actually, cleaner approach: use the CSS variable directly */
```

The cleanest approach is to make card-hover shadow conditional on card-elevation:

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 25px rgba(0,0,0, calc(0.15 * var(--shadow-multiplier, 1))),
    0 0 calc(12px * var(--glow-intensity, 1)) hsl(var(--primary) / 0.06);
  border-color: hsl(var(--border) / 0.8);
}
```

Add `--shadow-multiplier` to the aesthetic injection: `1` for shadow/glow elevation, `0` for flat.

- [ ] **Step 2: Animation scale — disable decorative animations when minimal**

```css
/* When animation scale is minimal, disable decorative animations */
:root[data-animation="minimal"] #root::before {
  animation: none !important;
}
:root[data-animation="minimal"] .brand-glow {
  animation: none !important;
}
:root[data-animation="minimal"] .empty-state-dot,
:root[data-animation="minimal"] .empty-state-icon,
:root[data-animation="minimal"] .floating-bg-circle {
  animation: none !important;
}
```

Update `applyTheme` in `use-theme.ts` to set `data-animation` attribute:

```typescript
root.setAttribute("data-animation", resolved.aesthetic.animationScale);
```

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css client/src/hooks/use-theme.ts
git commit -m "feat: wire card elevation and animation scale tokens"
```

---

### Task 9: Rewrite Anthropic theme as light variant

**Files:**
- Modify: `client/src/themes/anthropic.ts`

This is the highest-impact change for making CCC feel comfortable next to the Claude desktop app.

- [ ] **Step 1: Rewrite anthropic.ts with light variant colors**

Change `variant: "dark"` to `variant: "light"` and rewrite all color values to use warm cream/beige palette:

```typescript
variant: "light",
aesthetic: {
  glowIntensity: 0,
  borderRadius: "soft",
  cardElevation: "shadow",
  gradientMeshOpacity: 0.02,
  animationScale: "minimal",
},
colors: {
  // Warm cream background (#faf9f5)
  background: "40 33% 97%",
  // Dark warm foreground (#141413)
  foreground: "40 4% 8%",
  // Slightly darker cream for cards
  card: "40 22% 94%",
  "card-foreground": "40 4% 8%",
  // ...etc with warm cream light palette
}
```

Use the Anthropic brand colors from the research:
- Background: #faf9f5 (warm off-white)
- Foreground: #141413 (near-black with warm undertone)
- Primary accent: #d97757 (burnt orange)
- Secondary: #6a9bcc (slate blue)
- Muted text: #b0aea5 (taupe)

- [ ] **Step 2: Run tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add client/src/themes/anthropic.ts
git commit -m "feat: rewrite Anthropic theme as light variant with warm cream palette"
```

---

### Task 10: Add shadow-multiplier and warm shadow support for card elevation

**Files:**
- Modify: `client/src/themes/index.ts`
- Modify: `client/src/index.css`

- [ ] **Step 1: Add shadow-multiplier to aesthetic CSS injection**

In `themeToCSS`, add:
```typescript
`  --shadow-multiplier: ${aesthetic.cardElevation === "flat" ? "0" : "1"};`,
```

- [ ] **Step 2: For shadow-style themes, use warm vs cool shadow tint**

Themes with warm aesthetics (Anthropic, Rose Pine) should have warm-toned shadows. Themes with cool aesthetics (Nord, Tokyo Night) should have cool or neutral shadows.

Add to ThemeAesthetic (optional):
```typescript
shadowTint?: string; // e.g. "120 80 40" for warm, "0 0 0" for neutral
```

Or keep it simple — use `rgba(0,0,0,opacity)` for all and let the background warmth handle the perception.

- [ ] **Step 3: Commit**

```bash
git add client/src/themes/index.ts client/src/index.css
git commit -m "feat: add shadow-multiplier for flat vs elevated card styles"
```

---

### Task 11: Update `:root` fallback and index.html

**Files:**
- Modify: `client/src/index.css`
- Modify: `client/index.html`

- [ ] **Step 1: Add aesthetic fallbacks to :root**

```css
:root {
  /* ... existing color fallbacks ... */
  --glow-intensity: 0.6;
  --card-radius: 6px;
  --gradient-mesh-opacity: 0.035;
  --shadow-multiplier: 1;
}
```

- [ ] **Step 2: Add data-animation="full" to index.html**

```html
<html lang="en" class="dark" data-theme="dark" data-variant="dark" data-animation="full">
```

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css client/index.html
git commit -m "feat: add aesthetic token fallbacks for pre-hydration"
```

---

### Task 12: Update CHANGELOG, CLAUDE.md, and version

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `package.json`

- [ ] **Step 1: Add changelog entries**

Under `[Unreleased]`, add:
- Theme aesthetic profiles (glow intensity, border radius, card elevation, animation scale)
- Anthropic rewritten as light variant with warm cream palette
- 4 new community themes (Rose Pine, Tomorrow Night, Oceanic Next, One Half Dark)
- Total: 13 themes

- [ ] **Step 2: Bump version to 1.24.0**

- [ ] **Step 3: Update test count in CLAUDE.md**

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md package.json
git commit -m "docs: update changelog, version bump — v1.24.0"
```

---

### Task 13: Final verification and deploy

- [ ] **Step 1: Run full verification**

```bash
npm run check && npm test && npm run build
```

- [ ] **Step 2: Visual verification**

Start the dev server and test each theme:
- Dark: should look like current (baseline)
- Glass: should have enhanced glows and blur
- Anthropic: should feel warm, cream-colored, no glows, soft corners — comfortable next to Claude desktop
- Catppuccin: should feel cozy and muted, flat elevation
- Nord: should feel arctic and minimal, sharp corners, no glows
- Dracula: should feel vibrant with colored glows
- All others: verify no visual breakage

- [ ] **Step 3: Commit any fixes from visual review**

- [ ] **Step 4: Push and deploy**

```bash
git push origin main
# Deploy per Docker workflow
```
