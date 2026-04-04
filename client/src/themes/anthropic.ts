import type { ThemeDefinition } from "./types";

// Anthropic's brand palette — warm cream light theme matching the Claude desktop aesthetic
// Based on Anthropic's official brand colors:
//   Background: #faf9f5 (warm off-white), Foreground: #141413 (near-black warm)
//   Primary: #d97757 (burnt orange), Blue: #6a9bcc (slate blue), Green: #788c5d
export const anthropic: ThemeDefinition = {
  id: "anthropic",
  name: "Anthropic",
  description: "Warm cream light theme inspired by Anthropic's brand",
  variant: "light",
  author: "Anthropic",
  aesthetic: {
    glowIntensity: 0,
    borderRadius: "soft",
    cardElevation: "shadow",
    gradientMeshOpacity: 0.02,
    animationScale: "minimal",
  },
  colors: {
    // Warm cream background (#faf9f5) = hsl(40 33% 97%)
    background: "40 33% 97%",
    // Near-black warm foreground (#141413) = hsl(40 4% 8%)
    foreground: "40 4% 8%",
    // Slightly darker cream for cards (#f3f1eb) = hsl(40 22% 94%)
    card: "40 22% 94%",
    "card-foreground": "40 4% 8%",
    popover: "40 33% 97%",
    "popover-foreground": "40 4% 8%",
    // Burnt orange primary (#d97757) = hsl(16 62% 60%)
    primary: "16 62% 60%",
    "primary-foreground": "40 33% 98%",
    // Warm gray secondary
    secondary: "40 12% 90%",
    "secondary-foreground": "40 4% 8%",
    // Muted cream
    muted: "40 12% 90%",
    // Taupe muted text (#b0aea5) = hsl(40 6% 67%)
    "muted-foreground": "40 6% 47%",
    accent: "40 15% 88%",
    "accent-foreground": "40 4% 8%",
    destructive: "0 63% 45%",
    "destructive-foreground": "40 33% 98%",
    // Warm border
    border: "40 10% 82%",
    input: "40 10% 82%",
    ring: "16 62% 60%",
    "chart-1": "16 62% 56%",
    "chart-2": "208 44% 58%",
    "chart-3": "82 22% 50%",
    "chart-4": "30 50% 65%",
    "chart-5": "340 45% 55%",
    // Warm sidebar
    sidebar: "40 22% 95%",
    "sidebar-foreground": "40 4% 8%",
    "sidebar-border": "40 10% 82%",
    "sidebar-primary": "16 62% 56%",
    "sidebar-primary-foreground": "40 33% 98%",
    "sidebar-accent": "40 15% 88%",
    "sidebar-accent-foreground": "40 4% 8%",
    "brand-1": "16 62% 56%",
    "brand-2": "208 44% 58%",
    "nav-active": "16 62% 52%",
    "status-success": "82 22% 42%",
    "status-warning": "30 50% 50%",
    "status-error": "0 50% 48%",
    "info": "208 44% 58%",
    "entity-project": "208 44% 58%",
    "entity-mcp": "82 22% 42%",
    "entity-plugin": "16 62% 56%",
    "entity-skill": "30 50% 55%",
    "entity-markdown": "40 6% 47%",
    "entity-config": "173 40% 38%",
    "glow-blue": "rgba(106, 155, 204, 0.15)",
    "glow-purple": "rgba(217, 119, 87, 0.15)",
    "glow-green": "rgba(120, 140, 93, 0.15)",
    "glow-amber": "rgba(200, 160, 90, 0.15)",
    "glow-cyan": "rgba(106, 155, 204, 0.1)",
  },
};
