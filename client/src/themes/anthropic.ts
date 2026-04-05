import type { ThemeDefinition } from "./types";

// Anthropic Light — warm cream theme matching the Claude desktop aesthetic
// Every accent stays within the Anthropic earth-tone palette:
//   Primary: #d97757 (burnt orange/terra cotta)
//   Rose:    #b87878 (warm rose — secondary accent, replaces all blue)
//   Sage:    #788c5d (sage green — success, nature)
//   Amber:   #c19a50 (warm amber — warning, warmth)
//   Clay:    #b86a4e (deep terra cotta — error, urgency)
//   Taupe:   #8a8478 (warm gray — muted, secondary text)
export const anthropic: ThemeDefinition = {
  id: "anthropic",
  name: "Anthropic Light",
  description: "Warm cream light theme — Anthropic earth tones throughout",
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
    // Warm cream background (#faf9f5)
    background: "40 33% 97%",
    // Near-black warm foreground (#141413)
    foreground: "40 4% 8%",
    // Slightly darker cream for cards (#f3f1eb)
    card: "40 22% 94%",
    "card-foreground": "40 4% 8%",
    popover: "40 33% 97%",
    "popover-foreground": "40 4% 8%",
    // Burnt orange primary (#d97757)
    primary: "16 62% 60%",
    "primary-foreground": "40 33% 98%",
    // Warm gray secondary
    secondary: "40 12% 90%",
    "secondary-foreground": "40 4% 8%",
    muted: "40 12% 90%",
    // Warm taupe muted text
    "muted-foreground": "40 6% 47%",
    accent: "40 15% 88%",
    "accent-foreground": "40 4% 8%",
    // Terra cotta red for destructive (warm, not pure red)
    destructive: "8 45% 48%",
    "destructive-foreground": "40 33% 98%",
    border: "40 10% 82%",
    input: "40 10% 82%",
    ring: "16 62% 60%",
    // Charts — all warm earth tones
    "chart-1": "16 62% 56%",    // burnt orange
    "chart-2": "82 22% 46%",    // sage green
    "chart-3": "35 48% 54%",    // warm amber
    "chart-4": "0 25% 60%",     // warm rose
    "chart-5": "25 30% 50%",    // warm brown
    // Warm sidebar
    sidebar: "40 22% 95%",
    "sidebar-foreground": "40 4% 8%",
    "sidebar-border": "40 10% 82%",
    "sidebar-primary": "16 62% 56%",
    "sidebar-primary-foreground": "40 33% 98%",
    "sidebar-accent": "40 15% 88%",
    "sidebar-accent-foreground": "40 4% 8%",
    // Brand gradient — orange to warm rose (NO blue)
    "brand-1": "16 62% 56%",
    "brand-2": "0 25% 60%",
    "nav-active": "16 62% 52%",
    // Status — warm versions
    "status-success": "82 22% 42%",   // sage green
    "status-warning": "35 48% 50%",   // warm amber
    "status-error": "8 45% 48%",      // terra cotta
    // Warm rose info accent (NO blue)
    "info": "0 25% 55%",
    // Entities — all earth tones, no blue or teal
    "entity-project": "16 45% 52%",   // clay terra cotta
    "entity-mcp": "82 22% 42%",       // sage green
    "entity-plugin": "16 62% 56%",    // burnt orange
    "entity-skill": "35 48% 50%",     // warm amber
    "entity-markdown": "40 6% 47%",   // warm taupe
    "entity-config": "82 15% 40%",    // muted sage
    // Glow colors — warm tones (feed decorative gradients)
    "glow-blue": "rgba(217, 119, 87, 0.15)",    // warm orange (replaces blue)
    "glow-purple": "rgba(184, 120, 120, 0.15)",  // warm rose (replaces purple)
    "glow-green": "rgba(120, 140, 93, 0.12)",    // sage green
    "glow-amber": "rgba(193, 154, 80, 0.15)",    // warm amber
    "glow-cyan": "rgba(120, 140, 93, 0.1)",      // sage (replaces cyan)
  },
};
