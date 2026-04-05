import type { ThemeDefinition } from "./types";

// Dracula — a dark theme with vibrant, high-contrast colors
// https://draculatheme.com/contribute
//   Background: #282a36, Current Line: #44475a, Foreground: #f8f8f2
//   Comment: #6272a4, Cyan: #8be9fd, Green: #50fa7b, Orange: #ffb86c
//   Pink: #ff79c6, Purple: #bd93f9, Red: #ff5555, Yellow: #f1fa8c
export const dracula: ThemeDefinition = {
  id: "dracula",
  name: "Dracula",
  description: "Dark theme with vibrant, high-contrast colors",
  variant: "dark",
  author: "Dracula Theme",
  aesthetic: {
    glowIntensity: 0.4,
    borderRadius: "medium",
    cardElevation: "glow",
    gradientMeshOpacity: 0.04,
    animationScale: "full",
  },
  colors: {
    // Background (#282a36) = hsl(231 15% 18%)
    background: "231 15% 18%",
    // Foreground (#f8f8f2) = hsl(60 30% 96%)
    foreground: "60 30% 96%",
    // Current Line (#44475a) = hsl(232 14% 31%)
    card: "232 14% 31%",
    "card-foreground": "60 30% 96%",
    popover: "231 15% 18%",
    "popover-foreground": "60 30% 96%",
    // Purple (#bd93f9) = hsl(265 89% 78%)
    primary: "265 89% 78%",
    "primary-foreground": "231 15% 12%",
    // Current Line
    secondary: "232 14% 31%",
    "secondary-foreground": "60 30% 96%",
    // Slightly lighter than bg
    muted: "232 14% 25%",
    // Comment (#6272a4) = hsl(225 27% 51%)
    "muted-foreground": "225 27% 51%",
    accent: "232 14% 31%",
    "accent-foreground": "60 30% 96%",
    // Red (#ff5555) = hsl(0 100% 67%)
    destructive: "0 100% 67%",
    "destructive-foreground": "231 15% 12%",
    // Comment-ish
    border: "232 14% 35%",
    input: "232 14% 35%",
    ring: "265 89% 78%",
    // Cyan, Green, Orange, Purple, Pink
    "chart-1": "191 97% 77%",
    "chart-2": "135 94% 65%",
    "chart-3": "31 100% 71%",
    "chart-4": "265 89% 78%",
    "chart-5": "326 100% 74%",
    sidebar: "231 15% 16%",
    "sidebar-foreground": "60 30% 96%",
    "sidebar-border": "232 14% 35%",
    "sidebar-primary": "265 89% 78%",
    "sidebar-primary-foreground": "231 15% 12%",
    "sidebar-accent": "232 14% 31%",
    "sidebar-accent-foreground": "60 30% 96%",
    // Purple → Pink gradient
    "brand-1": "265 89% 78%",
    "brand-2": "326 100% 74%",
    // Cyan for active nav
    "nav-active": "191 97% 77%",
    // Green, Yellow, Red
    "status-success": "135 94% 65%",
    "status-warning": "65 92% 76%",
    "status-error": "0 100% 67%",
    // Pink
    "info": "326 100% 74%",
    // Cyan, Green, Purple, Orange, Comment, Pink
    "entity-project": "191 97% 77%",
    "entity-mcp": "135 94% 65%",
    "entity-plugin": "265 89% 78%",
    "entity-skill": "31 100% 71%",
    "entity-markdown": "225 27% 51%",
    "entity-config": "135 94% 55%",
    "glow-blue": "rgba(139, 233, 253, 0.3)",
    "glow-purple": "rgba(189, 147, 249, 0.3)",
    "glow-green": "rgba(80, 250, 123, 0.3)",
    "glow-amber": "rgba(255, 184, 108, 0.3)",
    "glow-cyan": "rgba(139, 233, 253, 0.25)",
  },
};
