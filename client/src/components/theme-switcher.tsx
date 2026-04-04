import { useTheme } from "@/hooks/use-theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Palette, Check, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback } from "react";
import type { ThemeDefinition } from "@/themes";

// Preview swatches: show primary + background + accent for each theme
function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  // Parse "H S% L%" into hsl(H, S%, L%)
  const toHSL = (triplet: string) => `hsl(${triplet.replace(/ /g, ", ")})`;

  return (
    <div className="flex gap-0.5 rounded-sm overflow-hidden border border-border">
      <div className="w-3 h-3" style={{ background: toHSL(theme.colors.background) }} />
      <div className="w-3 h-3" style={{ background: toHSL(theme.colors.primary) }} />
      <div className="w-3 h-3" style={{ background: toHSL(theme.colors.accent) }} />
    </div>
  );
}

export function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { theme: activeThemeId, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Build the flat list of menu item IDs: "system" + each theme id
  const menuItemIds = ["system", ...themes.map((t) => t.id)];

  // Find the index of the currently active theme in the menu items list
  const activeIndex = menuItemIds.indexOf(activeThemeId);

  // Focus the appropriate menu item when the dropdown opens
  useEffect(() => {
    if (!open) return;
    // Focus the active item if found, otherwise the first item
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;
    // Defer focus to allow the DOM to render
    requestAnimationFrame(() => {
      itemRefs.current[targetIndex]?.focus();
    });
  }, [open, activeIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape and return focus to trigger
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Keyboard navigation within the menu
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[next]?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prev]?.focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          items[0]?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
        }
        case "Tab": {
          // Close the menu and return focus to trigger when tabbing out
          setOpen(false);
          triggerRef.current?.focus();
          e.preventDefault();
          break;
        }
      }
    },
    []
  );

  // Store a ref for each menu item by index
  const setItemRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

  const trigger = (
    <button
      ref={triggerRef}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 cursor-pointer w-full",
        collapsed ? "justify-center" : "",
        "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      )}
      aria-label="Select theme"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-controls={open ? "theme-menu" : undefined}
    >
      <Palette className="h-4 w-4 flex-shrink-0" />
      {!collapsed && (
        <span className="flex-1 text-left">
          {activeThemeId === "system"
            ? "System"
            : themes.find((t) => t.id === activeThemeId)?.name ?? "Theme"}
        </span>
      )}
    </button>
  );

  const dropdown = open && (
    <div
      id="theme-menu"
      role="menu"
      aria-label="Theme options"
      onKeyDown={handleMenuKeyDown}
      className={cn(
        "absolute z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg",
        collapsed ? "left-full top-0 ml-2" : "bottom-full left-0 mb-1 right-0"
      )}
    >
      {/* System option */}
      <button
        ref={setItemRef(0)}
        role="menuitem"
        tabIndex={-1}
        onClick={() => { setTheme("system"); setOpen(false); triggerRef.current?.focus(); }}
        className={cn(
          "flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          activeThemeId === "system" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <Monitor className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">System</span>
        {activeThemeId === "system" && <Check className="h-3.5 w-3.5 text-primary" />}
      </button>

      <div className="mx-2 my-1 h-px bg-border/50" role="separator" />

      {/* Named themes */}
      {themes.map((t, i) => (
        <button
          key={t.id}
          ref={setItemRef(i + 1)}
          role="menuitem"
          tabIndex={-1}
          onClick={() => { setTheme(t.id); setOpen(false); triggerRef.current?.focus(); }}
          className={cn(
            "flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            activeThemeId === t.id ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <ThemeSwatch theme={t} />
          <span className="flex-1 text-left">{t.name}</span>
          {activeThemeId === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </div>
  );

  if (collapsed) {
    return (
      <div className="px-2 py-1 relative" ref={menuRef}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Theme
          </TooltipContent>
        </Tooltip>
        {dropdown}
      </div>
    );
  }

  return (
    <div className="px-2 py-1 relative" ref={menuRef}>
      {trigger}
      {dropdown}
    </div>
  );
}
