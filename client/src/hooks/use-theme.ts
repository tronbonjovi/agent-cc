import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement, type ReactNode } from "react";
import { themes, themeMap, buildThemeCSS, type ThemeDefinition } from "@/themes";

const STORAGE_KEY = "cc-theme";
const STYLE_ID = "cc-theme-variables";
const DEFAULT_THEME = "dark";

export type ThemeId = string;

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeDefinition[];
  resolvedTheme: ThemeDefinition;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemVariant(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveSystemTheme(): ThemeDefinition {
  const variant = getSystemVariant();
  return themes.find((t) => t.variant === variant) ?? themes[0];
}

function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === "system" || themeMap.has(stored))) {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_THEME;
}

function resolveTheme(themeId: ThemeId): ThemeDefinition {
  if (themeId === "system") return resolveSystemTheme();
  return themeMap.get(themeId) ?? themes[0];
}

function ensureThemeStyleSheet() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildThemeCSS();
  document.head.appendChild(style);
}

function applyTheme(themeId: ThemeId) {
  ensureThemeStyleSheet();
  const resolved = resolveTheme(themeId);
  const root = document.documentElement;

  root.setAttribute("data-theme", resolved.id);
  root.setAttribute("data-variant", resolved.variant);

  if (resolved.variant === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}

// Provider component — wrap the app with this once
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(getStoredTheme);

  const setTheme = useCallback((newThemeId: ThemeId) => {
    setThemeIdState(newThemeId);
    try {
      localStorage.setItem(STORAGE_KEY, newThemeId);
    } catch {
      // localStorage unavailable
    }
    applyTheme(newThemeId);
  }, []);

  // Apply theme on mount only — runtime changes go through setTheme
  useEffect(() => {
    applyTheme(themeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for OS preference changes when "system" is selected
  useEffect(() => {
    if (themeId !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme: themeId,
    setTheme,
    themes,
    resolvedTheme: resolveTheme(themeId),
  }), [themeId, setTheme]);

  return createElement(ThemeContext.Provider, { value }, children);
}

// Hook — all consumers share the same state via context
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
