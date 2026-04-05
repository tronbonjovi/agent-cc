import type { ThemeDefinition } from "./types";

// Nord — an arctic, north-bluish color palette
// https://www.nordtheme.com/
//   Polar Night: #2e3440, #3b4252, #434c5e, #4c566a
//   Snow Storm: #d8dee9, #e5e9f0, #eceff4
//   Frost: #8fbcbb, #88c0d0, #81a1c1, #5e81ac
//   Aurora: #bf616a, #d08770, #ebcb8b, #a3be8c, #b48ead
export const nord: ThemeDefinition = {
  id: "nord",
  name: "Nord",
  description: "Arctic, north-bluish color palette",
  variant: "dark",
  author: "Arctic Ice Studio",
  fonts: {
    mono: "\"Fira Code\", ui-monospace, monospace",
  },
  aesthetic: {
    glowIntensity: 0,
    borderRadius: "sharp",
    cardElevation: "flat",
    gradientMeshOpacity: 0.01,
    animationScale: "minimal",
  },
  colors: {
    // Polar Night 1 (#2e3440) = hsl(220 16% 22%)
    background: "220 16% 22%",
    // Snow Storm 1 (#d8dee9) = hsl(219 28% 88%)
    foreground: "219 28% 88%",
    // Polar Night 2 (#3b4252) = hsl(222 16% 28%)
    card: "222 16% 28%",
    "card-foreground": "219 28% 88%",
    // Polar Night 1
    popover: "220 16% 22%",
    "popover-foreground": "219 28% 88%",
    // Frost 3 (#81a1c1) = hsl(210 34% 63%)
    primary: "210 34% 63%",
    "primary-foreground": "220 16% 12%",
    // Polar Night 2
    secondary: "222 16% 28%",
    "secondary-foreground": "219 28% 88%",
    // Polar Night 3 (#434c5e) = hsl(220 17% 32%)
    muted: "220 17% 32%",
    // Polar Night 4 + Snow Storm blend
    "muted-foreground": "219 15% 62%",
    // Polar Night 3
    accent: "220 17% 32%",
    "accent-foreground": "219 28% 88%",
    // Aurora Red (#bf616a) = hsl(354 42% 56%)
    destructive: "354 42% 56%",
    "destructive-foreground": "219 28% 95%",
    // Polar Night 3
    border: "220 17% 32%",
    input: "220 17% 32%",
    // Frost 3
    ring: "210 34% 63%",
    // Frost 4 (#5e81ac), Aurora
    "chart-1": "213 32% 52%",
    "chart-2": "92 28% 65%",
    "chart-3": "14 51% 63%",
    "chart-4": "311 20% 63%",
    "chart-5": "40 71% 73%",
    // Polar Night 1
    sidebar: "220 16% 20%",
    "sidebar-foreground": "219 28% 88%",
    "sidebar-border": "220 17% 32%",
    // Frost 4 (#5e81ac) = hsl(213 32% 52%)
    "sidebar-primary": "213 32% 52%",
    "sidebar-primary-foreground": "219 28% 95%",
    "sidebar-accent": "220 17% 32%",
    "sidebar-accent-foreground": "219 28% 88%",
    // Frost 4 → brand, Frost 1 (#8fbcbb) secondary
    "brand-1": "213 32% 52%",
    "brand-2": "179 25% 65%",
    // Frost 2 (#88c0d0) = hsl(193 43% 67%)
    "nav-active": "193 43% 67%",
    // Aurora
    "status-success": "92 28% 65%",
    "status-warning": "40 71% 73%",
    "status-error": "354 42% 56%",
    // Aurora Purple (#b48ead) = hsl(311 20% 63%)
    "info": "311 20% 63%",
    // Frost colors for entities
    "entity-project": "213 32% 52%",
    "entity-mcp": "92 28% 65%",
    "entity-plugin": "311 20% 63%",
    "entity-skill": "14 51% 63%",
    "entity-markdown": "219 15% 62%",
    "entity-config": "179 25% 65%",
    "glow-blue": "rgba(94, 129, 172, 0.35)",
    "glow-purple": "rgba(180, 142, 173, 0.35)",
    "glow-green": "rgba(163, 190, 140, 0.35)",
    "glow-amber": "rgba(235, 203, 139, 0.35)",
    "glow-cyan": "rgba(136, 192, 208, 0.35)",
  },
};
