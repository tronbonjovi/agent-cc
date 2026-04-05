import type { ThemeDefinition } from "./types";

// Anthropic Dark — neutral dark greys matching the Claude app UI.
// Clean, cool greys with subtle warm accents. No brown tint.
export const anthropicDark: ThemeDefinition = {
  id: "anthropic-dark",
  name: "Anthropic Dark",
  description: "Dark theme matching the Claude app aesthetic",
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
    // Neutral dark grey background (#1a1a1a)
    background: "0 0% 10%",
    // Light grey foreground (#e8e8e8)
    foreground: "0 0% 91%",
    // Slightly lighter grey for cards (#262626)
    card: "0 0% 15%",
    "card-foreground": "0 0% 91%",
    popover: "0 0% 10%",
    "popover-foreground": "0 0% 91%",
    // Anthropic brand orange (#da7756)
    primary: "16 62% 60%",
    "primary-foreground": "0 0% 98%",
    // Dark grey secondary
    secondary: "0 0% 18%",
    "secondary-foreground": "0 0% 91%",
    muted: "0 0% 18%",
    // Medium grey muted text
    "muted-foreground": "0 0% 55%",
    accent: "0 0% 20%",
    "accent-foreground": "0 0% 91%",
    // Muted red for destructive
    destructive: "0 45% 55%",
    "destructive-foreground": "0 0% 98%",
    border: "0 0% 22%",
    input: "0 0% 22%",
    ring: "16 62% 60%",
    // Charts — muted earth tones
    "chart-1": "16 62% 60%",     // anthropic orange
    "chart-2": "82 25% 52%",     // sage green
    "chart-3": "35 45% 58%",     // amber
    "chart-4": "0 28% 64%",      // warm rose
    "chart-5": "25 32% 55%",     // brown
    // Dark sidebar (#151515)
    sidebar: "0 0% 8%",
    "sidebar-foreground": "0 0% 91%",
    "sidebar-border": "0 0% 22%",
    "sidebar-primary": "16 62% 60%",
    "sidebar-primary-foreground": "0 0% 98%",
    "sidebar-accent": "0 0% 20%",
    "sidebar-accent-foreground": "0 0% 91%",
    // Brand gradient
    "brand-1": "16 62% 60%",
    "brand-2": "0 28% 60%",
    "nav-active": "16 62% 64%",
    // Status colors
    "status-success": "82 25% 50%",
    "status-warning": "35 50% 58%",
    "status-error": "0 45% 55%",
    // Info accent
    "info": "0 28% 60%",
    // Entity colors
    "entity-project": "16 48% 58%",
    "entity-mcp": "82 25% 50%",
    "entity-plugin": "16 62% 60%",
    "entity-skill": "35 45% 58%",
    "entity-markdown": "0 0% 55%",
    "entity-config": "82 18% 46%",
    // Glow colors — subtle
    "glow-blue": "rgba(217, 119, 87, 0.2)",
    "glow-purple": "rgba(184, 120, 120, 0.2)",
    "glow-green": "rgba(120, 140, 93, 0.15)",
    "glow-amber": "rgba(193, 154, 80, 0.2)",
    "glow-cyan": "rgba(120, 140, 93, 0.12)",
  },
};
