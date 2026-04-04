import type { ThemeDefinition } from "./types";

// Anthropic Dark — the same warm earth-tone palette on a dark canvas
// Same accent philosophy as Anthropic Light: burnt orange, warm rose, sage, amber.
// No blue, no teal, no cyan — every color stays in the Anthropic family.
export const anthropicDark: ThemeDefinition = {
  id: "anthropic-dark",
  name: "Anthropic Dark",
  description: "Dark theme with Anthropic earth tones throughout",
  variant: "dark",
  author: "Anthropic",
  aesthetic: {
    glowIntensity: 0.05,
    borderRadius: "soft",
    cardElevation: "shadow",
    gradientMeshOpacity: 0.02,
    animationScale: "minimal",
  },
  colors: {
    // Very dark warm background (#131210)
    background: "40 8% 7%",
    // Warm off-white foreground (#e5e0d5)
    foreground: "38 20% 87%",
    // Slightly lighter warm dark for cards (#1e1c18)
    card: "40 10% 11%",
    "card-foreground": "38 20% 87%",
    popover: "40 8% 7%",
    "popover-foreground": "38 20% 87%",
    // Burnt orange primary (#d97757)
    primary: "16 62% 60%",
    "primary-foreground": "40 33% 98%",
    // Warm dark secondary
    secondary: "40 6% 16%",
    "secondary-foreground": "38 20% 87%",
    muted: "40 6% 16%",
    // Warm taupe muted text
    "muted-foreground": "38 8% 50%",
    accent: "40 8% 19%",
    "accent-foreground": "38 20% 87%",
    // Terra cotta red for destructive
    destructive: "8 50% 55%",
    "destructive-foreground": "40 33% 98%",
    border: "40 6% 20%",
    input: "40 6% 20%",
    ring: "16 62% 60%",
    // Charts — warm earth tones (brighter for dark bg readability)
    "chart-1": "16 62% 60%",    // burnt orange
    "chart-2": "82 25% 52%",    // sage green
    "chart-3": "35 50% 58%",    // warm amber
    "chart-4": "0 28% 64%",     // warm rose
    "chart-5": "25 32% 55%",    // warm brown
    // Dark warm sidebar
    sidebar: "40 8% 6%",
    "sidebar-foreground": "38 20% 87%",
    "sidebar-border": "40 6% 20%",
    "sidebar-primary": "16 62% 60%",
    "sidebar-primary-foreground": "40 33% 98%",
    "sidebar-accent": "40 8% 19%",
    "sidebar-accent-foreground": "38 20% 87%",
    // Brand gradient — orange to warm rose (NO blue)
    "brand-1": "16 62% 60%",
    "brand-2": "0 28% 60%",
    "nav-active": "16 62% 64%",
    // Status — warm versions (slightly brighter for dark bg)
    "status-success": "82 25% 50%",   // sage green
    "status-warning": "35 50% 58%",   // warm amber
    "status-error": "8 50% 55%",      // terra cotta
    // Warm rose info accent (NO blue)
    "info": "0 28% 60%",
    // Entities — all earth tones
    "entity-project": "16 48% 58%",   // clay terra cotta
    "entity-mcp": "82 25% 50%",       // sage green
    "entity-plugin": "16 62% 60%",    // burnt orange
    "entity-skill": "35 50% 58%",     // warm amber
    "entity-markdown": "38 8% 50%",   // warm taupe
    "entity-config": "82 18% 46%",    // muted sage
    // Glow colors — all warm tones
    "glow-blue": "rgba(217, 119, 87, 0.25)",    // warm orange (replaces blue)
    "glow-purple": "rgba(184, 120, 120, 0.25)",  // warm rose (replaces purple)
    "glow-green": "rgba(120, 140, 93, 0.2)",     // sage green
    "glow-amber": "rgba(193, 154, 80, 0.25)",    // warm amber
    "glow-cyan": "rgba(120, 140, 93, 0.15)",     // sage (replaces cyan)
  },
};
