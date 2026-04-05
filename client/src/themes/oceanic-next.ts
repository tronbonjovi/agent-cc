import type { ThemeDefinition } from "./types";

// Oceanic Next — a dark theme with oceanic blue-green tones
// https://github.com/voronianski/oceanic-next-color-scheme
//   Base: #1b2b34, Light bg: #343d46
//   Text: #d8dee9, Comment: #65737e
//   Red: #ec5f67, Orange: #f99157, Yellow: #fac863, Green: #99c794
//   Cyan: #5fb3b3, Blue: #6699cc, Purple: #c594c5
export const oceanicNext: ThemeDefinition = {
  id: "oceanic-next",
  name: "Oceanic Next",
  description: "Dark theme with oceanic blue-green tones",
  variant: "dark",
  author: "Dmitri Voronianski",
  aesthetic: {
    glowIntensity: 0.1,
    borderRadius: "medium",
    cardElevation: "shadow",
    gradientMeshOpacity: 0.03,
    animationScale: "minimal",
  },
  colors: {
    // Base (#1b2b34) = hsl(199 32% 16%)
    background: "199 32% 16%",
    // Text (#d8dee9) = hsl(215 27% 88%)
    foreground: "215 27% 88%",
    // Light bg (#343d46) = hsl(210 14% 24%)
    card: "210 14% 24%",
    "card-foreground": "215 27% 88%",
    popover: "199 32% 16%",
    "popover-foreground": "215 27% 88%",
    // Blue (#6699cc) = hsl(210 43% 60%)
    primary: "210 43% 60%",
    "primary-foreground": "199 32% 10%",
    secondary: "210 14% 24%",
    "secondary-foreground": "215 27% 88%",
    // Slightly lighter
    muted: "210 14% 28%",
    // Comment (#65737e) = hsl(206 12% 45%)
    "muted-foreground": "206 12% 45%",
    accent: "210 14% 28%",
    "accent-foreground": "215 27% 88%",
    // Red (#ec5f67) = hsl(357 79% 65%)
    destructive: "357 79% 65%",
    "destructive-foreground": "199 32% 10%",
    border: "210 14% 28%",
    input: "210 14% 28%",
    ring: "210 43% 60%",
    // Cyan, Green, Orange, Blue, Purple
    "chart-1": "180 32% 54%",
    "chart-2": "145 32% 68%",
    "chart-3": "23 93% 66%",
    "chart-4": "210 43% 60%",
    "chart-5": "300 31% 68%",
    sidebar: "199 32% 14%",
    "sidebar-foreground": "215 27% 88%",
    "sidebar-border": "210 14% 28%",
    "sidebar-primary": "210 43% 60%",
    "sidebar-primary-foreground": "199 32% 10%",
    "sidebar-accent": "210 14% 28%",
    "sidebar-accent-foreground": "215 27% 88%",
    // Blue → Cyan
    "brand-1": "210 43% 60%",
    "brand-2": "180 32% 54%",
    // Cyan for active
    "nav-active": "180 32% 54%",
    // Green, Yellow, Red
    "status-success": "145 32% 68%",
    "status-warning": "40 94% 69%",
    "status-error": "357 79% 65%",
    "info": "300 31% 68%",
    // Blue, Green, Purple, Orange, Comment, Cyan
    "entity-project": "210 43% 60%",
    "entity-mcp": "145 32% 68%",
    "entity-plugin": "300 31% 68%",
    "entity-skill": "23 93% 66%",
    "entity-markdown": "206 12% 45%",
    "entity-config": "180 32% 54%",
    "glow-blue": "rgba(102, 153, 204, 0.3)",
    "glow-purple": "rgba(197, 148, 197, 0.3)",
    "glow-green": "rgba(153, 199, 148, 0.3)",
    "glow-amber": "rgba(250, 200, 99, 0.3)",
    "glow-cyan": "rgba(95, 179, 179, 0.3)",
  },
};
