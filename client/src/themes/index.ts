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

export type { ThemeDefinition, ThemeColors, ThemeFonts } from "./types";

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
];

export const themeMap = new Map<string, ThemeDefinition>(
  themes.map((t) => [t.id, t]),
);

// Generate a CSS rule block for a single theme
function themeToCSS(theme: ThemeDefinition): string {
  return Object.entries(theme.colors)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
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
