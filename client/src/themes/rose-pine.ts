import type { ThemeDefinition } from "./types";

// Rosé Pine — all natural pine, faux fur and a bit of soho vibes
// https://rosepinetheme.com/palette
//   Base: #191724, Surface: #1f1d2e, Overlay: #26233a
//   Text: #e0def4, Subtle: #908caa, Muted: #6e6a86
//   Love: #eb6f92, Gold: #f6c177, Rose: #ebbcba, Pine: #31748f, Foam: #9ccfd8, Iris: #c4a7e7
export const rosePine: ThemeDefinition = {
  id: "rose-pine",
  name: "Rosé Pine",
  description: "All natural pine, faux fur and a bit of soho vibes",
  variant: "dark",
  author: "Rosé Pine",
  aesthetic: {
    glowIntensity: 0.05,
    borderRadius: "medium",
    cardElevation: "shadow",
    gradientMeshOpacity: 0.03,
    animationScale: "minimal",
  },
  colors: {
    // Base (#191724) = hsl(249 22% 12%)
    background: "249 22% 12%",
    // Text (#e0def4) = hsl(245 50% 91%)
    foreground: "245 50% 91%",
    // Surface (#1f1d2e) = hsl(247 23% 15%)
    card: "247 23% 15%",
    "card-foreground": "245 50% 91%",
    popover: "249 22% 12%",
    "popover-foreground": "245 50% 91%",
    // Iris (#c4a7e7) = hsl(267 57% 78%)
    primary: "267 57% 78%",
    "primary-foreground": "249 22% 10%",
    // Overlay (#26233a) = hsl(247 22% 18%)
    secondary: "247 22% 18%",
    "secondary-foreground": "245 50% 91%",
    muted: "247 22% 18%",
    // Subtle (#908caa) = hsl(245 12% 61%)
    "muted-foreground": "245 12% 61%",
    accent: "247 22% 22%",
    "accent-foreground": "245 50% 91%",
    // Love (#eb6f92) = hsl(343 76% 68%)
    destructive: "343 76% 68%",
    "destructive-foreground": "249 22% 10%",
    // Muted (#6e6a86) = hsl(245 10% 47%)
    border: "245 10% 47%",
    input: "245 10% 47%",
    ring: "267 57% 78%",
    // Gold, Pine, Iris, Love, Foam
    "chart-1": "35 88% 72%",
    "chart-2": "197 49% 38%",
    "chart-3": "267 57% 78%",
    "chart-4": "343 76% 68%",
    "chart-5": "189 43% 73%",
    sidebar: "249 22% 11%",
    "sidebar-foreground": "245 50% 91%",
    "sidebar-border": "245 10% 47%",
    "sidebar-primary": "267 57% 78%",
    "sidebar-primary-foreground": "249 22% 10%",
    "sidebar-accent": "247 22% 18%",
    "sidebar-accent-foreground": "245 50% 91%",
    // Iris → Love gradient
    "brand-1": "267 57% 78%",
    "brand-2": "343 76% 68%",
    // Foam for active nav
    "nav-active": "189 43% 73%",
    // Pine, Gold, Love
    "status-success": "197 49% 38%",
    "status-warning": "35 88% 72%",
    "status-error": "343 76% 68%",
    // Rose (#ebbcba) = hsl(2 55% 83%)
    "info": "2 55% 83%",
    // Foam, Pine, Iris, Gold, Subtle, Rose
    "entity-project": "189 43% 73%",
    "entity-mcp": "197 49% 38%",
    "entity-plugin": "267 57% 78%",
    "entity-skill": "35 88% 72%",
    "entity-markdown": "245 12% 61%",
    "entity-config": "197 49% 38%",
    "glow-blue": "rgba(156, 207, 216, 0.25)",
    "glow-purple": "rgba(196, 167, 231, 0.25)",
    "glow-green": "rgba(49, 116, 143, 0.25)",
    "glow-amber": "rgba(246, 193, 119, 0.25)",
    "glow-cyan": "rgba(156, 207, 216, 0.2)",
  },
};
