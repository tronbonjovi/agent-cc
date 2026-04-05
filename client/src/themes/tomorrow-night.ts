import type { ThemeDefinition } from "./types";

// Tomorrow Night — a clean, minimal dark theme
// https://github.com/chriskempson/tomorrow-theme
//   Background: #1d1f21, Current Line: #282a2e, Selection: #373b41
//   Foreground: #c5c8c6, Comment: #969896
//   Red: #cc6666, Orange: #de935f, Yellow: #f0c674, Green: #b5bd68
//   Aqua: #8abeb7, Blue: #81a2be, Purple: #b294bb
export const tomorrowNight: ThemeDefinition = {
  id: "tomorrow-night",
  name: "Tomorrow Night",
  description: "Clean and minimal dark theme",
  variant: "dark",
  author: "Chris Kempson",
  aesthetic: {
    glowIntensity: 0,
    borderRadius: "sharp",
    cardElevation: "flat",
    gradientMeshOpacity: 0.01,
    animationScale: "minimal",
  },
  colors: {
    // Background (#1d1f21) = hsl(210 5% 12%)
    background: "210 5% 12%",
    // Foreground (#c5c8c6) = hsl(120 3% 78%)
    foreground: "120 3% 78%",
    // Current Line (#282a2e) = hsl(220 8% 17%)
    card: "220 8% 17%",
    "card-foreground": "120 3% 78%",
    popover: "210 5% 12%",
    "popover-foreground": "120 3% 78%",
    // Blue (#81a2be) = hsl(209 34% 63%)
    primary: "209 34% 63%",
    "primary-foreground": "210 5% 10%",
    // Selection (#373b41) = hsl(216 9% 24%)
    secondary: "216 9% 24%",
    "secondary-foreground": "120 3% 78%",
    muted: "216 9% 24%",
    // Comment (#969896) = hsl(120 1% 59%)
    "muted-foreground": "120 1% 59%",
    accent: "216 9% 28%",
    "accent-foreground": "120 3% 78%",
    // Red (#cc6666) = hsl(0 47% 60%)
    destructive: "0 47% 60%",
    "destructive-foreground": "210 5% 10%",
    border: "216 9% 24%",
    input: "216 9% 24%",
    ring: "209 34% 63%",
    // Orange, Green, Blue, Purple, Aqua
    "chart-1": "25 65% 62%",
    "chart-2": "66 34% 57%",
    "chart-3": "209 34% 63%",
    "chart-4": "296 18% 65%",
    "chart-5": "170 26% 64%",
    sidebar: "210 5% 11%",
    "sidebar-foreground": "120 3% 78%",
    "sidebar-border": "216 9% 24%",
    "sidebar-primary": "209 34% 63%",
    "sidebar-primary-foreground": "210 5% 10%",
    "sidebar-accent": "216 9% 24%",
    "sidebar-accent-foreground": "120 3% 78%",
    // Blue → Purple
    "brand-1": "209 34% 63%",
    "brand-2": "296 18% 65%",
    // Aqua for active
    "nav-active": "170 26% 64%",
    // Green, Yellow, Red
    "status-success": "66 34% 57%",
    "status-warning": "40 81% 70%",
    "status-error": "0 47% 60%",
    "info": "296 18% 65%",
    // Blue, Green, Purple, Orange, Comment, Aqua
    "entity-project": "209 34% 63%",
    "entity-mcp": "66 34% 57%",
    "entity-plugin": "296 18% 65%",
    "entity-skill": "25 65% 62%",
    "entity-markdown": "120 1% 59%",
    "entity-config": "170 26% 64%",
    "glow-blue": "rgba(129, 162, 190, 0.25)",
    "glow-purple": "rgba(178, 148, 187, 0.25)",
    "glow-green": "rgba(181, 189, 104, 0.25)",
    "glow-amber": "rgba(240, 198, 116, 0.25)",
    "glow-cyan": "rgba(138, 190, 183, 0.25)",
  },
};
