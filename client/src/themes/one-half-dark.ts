import type { ThemeDefinition } from "./types";

// One Half Dark — a clean, vibrant dark theme
// https://github.com/sonph/onehalf
//   Background: #282c34, Foreground: #dcdfe4
//   Red: #e06c75, Green: #98c379, Yellow: #e5c07b, Blue: #61afef
//   Purple: #c678dd, Cyan: #56b6c2
export const oneHalfDark: ThemeDefinition = {
  id: "one-half-dark",
  name: "One Half Dark",
  description: "Clean and vibrant dark theme",
  variant: "dark",
  author: "Son Pham",
  aesthetic: {
    glowIntensity: 0,
    borderRadius: "medium",
    cardElevation: "flat",
    gradientMeshOpacity: 0.02,
    animationScale: "minimal",
  },
  colors: {
    // Background (#282c34) = hsl(220 13% 18%)
    background: "220 13% 18%",
    // Foreground (#dcdfe4) = hsl(220 14% 88%)
    foreground: "220 14% 88%",
    // Slightly lighter (#2e3239)
    card: "220 13% 21%",
    "card-foreground": "220 14% 88%",
    popover: "220 13% 18%",
    "popover-foreground": "220 14% 88%",
    // Blue (#61afef) = hsl(207 82% 66%)
    primary: "207 82% 66%",
    "primary-foreground": "220 13% 10%",
    secondary: "220 13% 24%",
    "secondary-foreground": "220 14% 88%",
    muted: "220 13% 24%",
    // Comment (#5c6370) = hsl(220 9% 40%)
    "muted-foreground": "220 9% 40%",
    accent: "220 13% 26%",
    "accent-foreground": "220 14% 88%",
    // Red (#e06c75) = hsl(355 65% 65%)
    destructive: "355 65% 65%",
    "destructive-foreground": "220 13% 10%",
    border: "220 13% 26%",
    input: "220 13% 26%",
    ring: "207 82% 66%",
    // Green, Purple, Yellow, Blue, Cyan
    "chart-1": "95 38% 62%",
    "chart-2": "286 51% 67%",
    "chart-3": "39 67% 69%",
    "chart-4": "207 82% 66%",
    "chart-5": "187 47% 55%",
    sidebar: "220 13% 16%",
    "sidebar-foreground": "220 14% 88%",
    "sidebar-border": "220 13% 26%",
    "sidebar-primary": "207 82% 66%",
    "sidebar-primary-foreground": "220 13% 10%",
    "sidebar-accent": "220 13% 24%",
    "sidebar-accent-foreground": "220 14% 88%",
    // Blue → Purple
    "brand-1": "207 82% 66%",
    "brand-2": "286 51% 67%",
    // Cyan for active
    "nav-active": "187 47% 55%",
    // Green, Yellow, Red
    "status-success": "95 38% 62%",
    "status-warning": "39 67% 69%",
    "status-error": "355 65% 65%",
    "info": "286 51% 67%",
    // Blue, Green, Purple, Yellow, Comment, Cyan
    "entity-project": "207 82% 66%",
    "entity-mcp": "95 38% 62%",
    "entity-plugin": "286 51% 67%",
    "entity-skill": "39 67% 69%",
    "entity-markdown": "220 9% 40%",
    "entity-config": "187 47% 55%",
    "glow-blue": "rgba(97, 175, 239, 0.25)",
    "glow-purple": "rgba(198, 120, 221, 0.25)",
    "glow-green": "rgba(152, 195, 121, 0.25)",
    "glow-amber": "rgba(229, 192, 123, 0.25)",
    "glow-cyan": "rgba(86, 182, 194, 0.25)",
  },
};
