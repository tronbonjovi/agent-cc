import type { ThemeDefinition } from "./types";

// Tokyo Night — a clean dark theme inspired by the lights of Tokyo at night
// https://github.com/enkia/tokyo-night-vscode-theme
//   Background: #1a1b26, Editor: #24283b, Terminal: #414868
//   Foreground: #a9b1d6, Comment: #565f89
//   Blue: #7aa2f7, Purple: #bb9af7, Cyan: #7dcfff, Green: #9ece6a
//   Red: #f7768e, Orange: #ff9e64, Yellow: #e0af68, Magenta: #ff007c
export const tokyoNight: ThemeDefinition = {
  id: "tokyo-night",
  name: "Tokyo Night",
  description: "Clean dark theme inspired by Tokyo city lights",
  variant: "dark",
  author: "enkia",
  fonts: {
    mono: "\"Cascadia Code\", ui-monospace, monospace",
  },
  colors: {
    // Background (#1a1b26) = hsl(235 18% 12%)
    background: "235 18% 12%",
    // Foreground (#a9b1d6) = hsl(227 32% 75%)
    foreground: "227 32% 75%",
    // Editor (#24283b) = hsl(230 24% 19%)
    card: "230 24% 19%",
    "card-foreground": "227 32% 75%",
    popover: "235 18% 12%",
    "popover-foreground": "227 32% 75%",
    // Blue (#7aa2f7) = hsl(220 90% 72%)
    primary: "220 90% 72%",
    "primary-foreground": "235 18% 10%",
    secondary: "230 24% 19%",
    "secondary-foreground": "227 32% 75%",
    // Terminal (#414868) = hsl(228 21% 33%)
    muted: "228 21% 33%",
    // Comment (#565f89) = hsl(227 18% 44%)
    "muted-foreground": "227 18% 44%",
    accent: "228 21% 33%",
    "accent-foreground": "227 32% 75%",
    // Red (#f7768e) = hsl(348 86% 72%)
    destructive: "348 86% 72%",
    "destructive-foreground": "235 18% 10%",
    border: "228 21% 28%",
    input: "228 21% 28%",
    ring: "220 90% 72%",
    // Blue, Green, Orange, Purple, Cyan
    "chart-1": "220 90% 72%",
    "chart-2": "85 55% 60%",
    "chart-3": "24 100% 70%",
    "chart-4": "267 75% 75%",
    "chart-5": "199 100% 74%",
    sidebar: "235 18% 11%",
    "sidebar-foreground": "227 32% 75%",
    "sidebar-border": "228 21% 28%",
    "sidebar-primary": "220 90% 72%",
    "sidebar-primary-foreground": "235 18% 10%",
    "sidebar-accent": "228 21% 33%",
    "sidebar-accent-foreground": "227 32% 75%",
    // Blue → Purple gradient
    "brand-1": "220 90% 72%",
    "brand-2": "267 75% 75%",
    // Cyan for active nav
    "nav-active": "199 100% 74%",
    // Green, Yellow, Red
    "status-success": "85 55% 60%",
    "status-warning": "34 72% 64%",
    "status-error": "348 86% 72%",
    // Magenta (#ff007c) / Purple
    "info": "267 75% 75%",
    // Blue, Green, Purple, Orange, Comment, Cyan
    "entity-project": "220 90% 72%",
    "entity-mcp": "85 55% 60%",
    "entity-plugin": "267 75% 75%",
    "entity-skill": "24 100% 70%",
    "entity-markdown": "227 18% 44%",
    "entity-config": "199 100% 74%",
    "glow-blue": "rgba(122, 162, 247, 0.35)",
    "glow-purple": "rgba(187, 154, 247, 0.35)",
    "glow-green": "rgba(158, 206, 106, 0.35)",
    "glow-amber": "rgba(255, 158, 100, 0.35)",
    "glow-cyan": "rgba(125, 207, 255, 0.35)",
  },
};
