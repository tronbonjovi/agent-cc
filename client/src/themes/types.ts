export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  variant: "light" | "dark";
  author?: string;
  fonts?: ThemeFonts;
  colors: ThemeColors;
}

export interface ThemeFonts {
  sans?: string;  // e.g. "Inter, system-ui, sans-serif"
  mono?: string;  // e.g. "JetBrains Mono, ui-monospace, monospace"
}

export interface ThemeColors {
  // Core shadcn tokens (HSL triplets without hsl() wrapper, e.g. "222 47% 5%")
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;

  // Charts
  "chart-1": string;
  "chart-2": string;
  "chart-3": string;
  "chart-4": string;
  "chart-5": string;

  // Sidebar
  sidebar: string;
  "sidebar-foreground": string;
  "sidebar-border": string;
  "sidebar-primary": string;
  "sidebar-primary-foreground": string;
  "sidebar-accent": string;
  "sidebar-accent-foreground": string;

  // Brand gradient pair — used for sidebar brand icon, nav active indicator, decorative gradients
  "brand-1": string;  // HSL triplet — gradient start
  "brand-2": string;  // HSL triplet — gradient end

  // Nav active highlight — foreground color for active nav icons, tab indicators, emphasis
  "nav-active": string;  // HSL triplet

  // Semantic status colors — for health dots, sync status, trend indicators
  "status-success": string;  // HSL triplet (green-ish)
  "status-warning": string;  // HSL triplet (amber/yellow-ish)
  "status-error": string;    // HSL triplet (red-ish)

  // Informational accent — secondary emphasis for numbered steps, badges, category labels
  "info": string;  // HSL triplet

  // Entity colors (HSL triplets — used via hsl(var(--entity-*)))
  "entity-project": string;
  "entity-mcp": string;
  "entity-plugin": string;
  "entity-skill": string;
  "entity-markdown": string;
  "entity-config": string;

  // Glow colors (full rgba strings for box-shadow usage)
  "glow-blue": string;
  "glow-purple": string;
  "glow-green": string;
  "glow-amber": string;
  "glow-cyan": string;
}
