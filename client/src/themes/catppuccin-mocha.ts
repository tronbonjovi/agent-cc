import type { ThemeDefinition } from "./types";

// Catppuccin Mocha — the official dark variant of the Catppuccin palette
// https://github.com/catppuccin/catppuccin
//   Base: #1e1e2e, Mantle: #181825, Crust: #11111b
//   Text: #cdd6f4, Subtext1: #bac2de, Subtext0: #a6adc8, Overlay2: #9399b2
//   Surface2: #585b70, Surface1: #45475a, Surface0: #313244
//   Blue: #89b4fa, Mauve: #cba6f7, Green: #a6e3a1, Red: #f38ba8
//   Peach: #fab387, Yellow: #f9e2af, Teal: #94e2d5, Lavender: #b4befe
//   Pink: #f5c2e7, Sky: #89dcfe, Maroon: #eba0ac, Rosewater: #f5e0dc
export const catppuccinMocha: ThemeDefinition = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  description: "Soothing pastel dark theme from the Catppuccin palette",
  variant: "dark",
  author: "Catppuccin",
  colors: {
    // Base (#1e1e2e) = hsl(240 21% 15%)
    background: "240 21% 15%",
    // Text (#cdd6f4) = hsl(226 64% 88%)
    foreground: "226 64% 88%",
    // Surface0 (#313244) = hsl(237 16% 23%)
    card: "237 16% 23%",
    "card-foreground": "226 64% 88%",
    // Mantle (#181825) = hsl(240 21% 12%)
    popover: "240 21% 12%",
    "popover-foreground": "226 64% 88%",
    // Blue (#89b4fa) = hsl(217 92% 76%)
    primary: "217 92% 76%",
    // Crust (#11111b) = hsl(240 23% 9%)
    "primary-foreground": "240 23% 9%",
    // Surface0
    secondary: "237 16% 23%",
    "secondary-foreground": "226 64% 88%",
    // Surface1 (#45475a) = hsl(234 13% 31%)
    muted: "234 13% 31%",
    // Subtext0 (#a6adc8) = hsl(228 24% 72%)
    "muted-foreground": "228 24% 72%",
    // Surface1
    accent: "234 13% 31%",
    "accent-foreground": "226 64% 88%",
    // Red (#f38ba8) = hsl(343 81% 75%)
    destructive: "343 81% 75%",
    "destructive-foreground": "240 23% 9%",
    // Surface2 (#585b70) = hsl(234 10% 39%) — slightly lighter for visibility
    border: "234 10% 39%",
    input: "234 10% 39%",
    // Lavender (#b4befe) = hsl(232 97% 85%)
    ring: "232 97% 85%",
    // Peach, Teal, Mauve, Blue, Green
    "chart-1": "23 92% 75%",
    "chart-2": "170 57% 73%",
    "chart-3": "267 84% 81%",
    "chart-4": "217 92% 76%",
    "chart-5": "115 54% 76%",
    // Mantle
    sidebar: "240 21% 12%",
    "sidebar-foreground": "226 64% 88%",
    "sidebar-border": "234 10% 39%",
    // Blue
    "sidebar-primary": "217 92% 76%",
    "sidebar-primary-foreground": "240 23% 9%",
    // Surface1
    "sidebar-accent": "234 13% 31%",
    "sidebar-accent-foreground": "226 64% 88%",
    // Blue, Green, Mauve, Peach, Overlay2, Teal
    "entity-project": "217 92% 76%",
    "entity-mcp": "115 54% 76%",
    "entity-plugin": "267 84% 81%",
    "entity-skill": "23 92% 75%",
    "entity-markdown": "228 24% 72%",
    "entity-config": "170 57% 73%",
    "glow-blue": "rgba(137, 180, 250, 0.3)",
    "glow-purple": "rgba(203, 166, 247, 0.3)",
    "glow-green": "rgba(166, 227, 161, 0.3)",
    "glow-amber": "rgba(250, 179, 135, 0.3)",
    "glow-cyan": "rgba(137, 220, 254, 0.3)",
  },
};
