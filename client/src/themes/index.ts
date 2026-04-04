import type { ThemeDefinition } from "./types";
import { dark } from "./dark";
import { light } from "./light";
import { glass } from "./glass";
import { anthropic } from "./anthropic";
import { catppuccinMocha } from "./catppuccin-mocha";
import { nord } from "./nord";
import { dracula } from "./dracula";
import { tokyoNight } from "./tokyo-night";
import { solarizedDark } from "./solarized-dark";
import { rosePine } from "./rose-pine";
import { tomorrowNight } from "./tomorrow-night";
import { oceanicNext } from "./oceanic-next";
import { oneHalfDark } from "./one-half-dark";

export type { ThemeDefinition, ThemeColors, ThemeFonts, ThemeAesthetic, BorderRadius, CardElevation, AnimationScale } from "./types";

// All registered themes — add new themes here and they'll appear in the picker
export const themes: ThemeDefinition[] = [
  dark,
  light,
  glass,
  anthropic,
  catppuccinMocha,
  nord,
  dracula,
  tokyoNight,
  solarizedDark,
  rosePine,
  tomorrowNight,
  oceanicNext,
  oneHalfDark,
];

export const themeMap = new Map<string, ThemeDefinition>(
  themes.map((t) => [t.id, t]),
);

// Generate a CSS rule block for a single theme (colors + aesthetic tokens)
function themeToCSS(theme: ThemeDefinition): string {
  const colorLines = Object.entries(theme.colors)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const radiusMap = { sharp: "3px", medium: "8px", soft: "12px" } as const;
  const { aesthetic } = theme;

  const aestheticLines = [
    `  --glow-intensity: ${aesthetic.glowIntensity};`,
    `  --card-radius: ${radiusMap[aesthetic.borderRadius]};`,
    `  --card-elevation: ${aesthetic.cardElevation};`,
    `  --gradient-mesh-opacity: ${aesthetic.gradientMeshOpacity};`,
    `  --animation-scale: ${aesthetic.animationScale === "full" ? "1" : "0"};`,
    `  --shadow-multiplier: ${aesthetic.cardElevation === "flat" ? "0" : "1"};`,
  ].join("\n");

  return `${colorLines}\n${aestheticLines}`;
}

// Build the full CSS string for all themes, injected at runtime
export function buildThemeCSS(): string {
  return themes
    .map(
      (theme) =>
        `[data-theme="${theme.id}"] {\n${themeToCSS(theme)}\n}`,
    )
    .join("\n\n");
}
