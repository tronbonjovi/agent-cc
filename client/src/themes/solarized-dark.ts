import type { ThemeDefinition } from "./types";

// Solarized Dark — precision colors for machines and people
// https://ethanschoonover.com/solarized/
//   Base03: #002b36, Base02: #073642, Base01: #586e75, Base00: #657b83
//   Base0: #839496, Base1: #93a1a1, Base2: #eee8d5, Base3: #fdf6e3
//   Yellow: #b58900, Orange: #cb4b16, Red: #dc322f, Magenta: #d33682
//   Violet: #6c71c4, Blue: #268bd2, Cyan: #2aa198, Green: #859900
export const solarizedDark: ThemeDefinition = {
  id: "solarized-dark",
  name: "Solarized Dark",
  description: "Precision colors designed for readability",
  variant: "dark",
  author: "Ethan Schoonover",
  colors: {
    // Base03 (#002b36) = hsl(192 100% 11%)
    background: "192 100% 11%",
    // Base0 (#839496) = hsl(186 8% 55%)
    foreground: "186 8% 55%",
    // Base02 (#073642) = hsl(192 81% 14%)
    card: "192 81% 14%",
    "card-foreground": "186 8% 55%",
    popover: "192 100% 11%",
    "popover-foreground": "186 8% 55%",
    // Blue (#268bd2) = hsl(205 69% 49%)
    primary: "205 69% 49%",
    "primary-foreground": "44 87% 94%",
    secondary: "192 81% 14%",
    "secondary-foreground": "186 8% 55%",
    // Base02 lighter
    muted: "192 81% 17%",
    // Base01 (#586e75) = hsl(194 14% 40%)
    "muted-foreground": "194 14% 40%",
    accent: "192 81% 17%",
    "accent-foreground": "186 8% 55%",
    // Red (#dc322f) = hsl(1 71% 52%)
    destructive: "1 71% 52%",
    "destructive-foreground": "44 87% 94%",
    border: "192 81% 19%",
    input: "192 81% 19%",
    ring: "205 69% 49%",
    // Blue, Cyan, Green, Yellow, Magenta
    "chart-1": "205 69% 49%",
    "chart-2": "175 59% 40%",
    "chart-3": "68 100% 30%",
    "chart-4": "45 100% 35%",
    "chart-5": "331 64% 52%",
    sidebar: "192 100% 10%",
    "sidebar-foreground": "186 8% 55%",
    "sidebar-border": "192 81% 19%",
    "sidebar-primary": "205 69% 49%",
    "sidebar-primary-foreground": "44 87% 94%",
    "sidebar-accent": "192 81% 17%",
    "sidebar-accent-foreground": "186 8% 55%",
    // Blue → Violet
    "brand-1": "205 69% 49%",
    "brand-2": "237 45% 60%",
    // Cyan
    "nav-active": "175 59% 40%",
    // Green, Yellow, Red
    "status-success": "68 100% 30%",
    "status-warning": "45 100% 35%",
    "status-error": "1 71% 52%",
    // Violet (#6c71c4) = hsl(237 45% 60%)
    "info": "237 45% 60%",
    // Blue, Green, Violet, Orange, Base01, Cyan
    "entity-project": "205 69% 49%",
    "entity-mcp": "68 100% 30%",
    "entity-plugin": "237 45% 60%",
    "entity-skill": "18 89% 44%",
    "entity-markdown": "194 14% 40%",
    "entity-config": "175 59% 40%",
    "glow-blue": "rgba(38, 139, 210, 0.35)",
    "glow-purple": "rgba(108, 113, 196, 0.35)",
    "glow-green": "rgba(133, 153, 0, 0.35)",
    "glow-amber": "rgba(181, 137, 0, 0.35)",
    "glow-cyan": "rgba(42, 161, 152, 0.35)",
  },
};
