import { useState, useEffect, useCallback, useRef } from "react";

/** Viewport size tier matching Tailwind default breakpoints. */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

/** Returns true when the breakpoint is a mobile-class viewport (xs or sm). */
export const isMobile = (bp: Breakpoint): boolean => bp === "xs" || bp === "sm";

/**
 * Media queries ordered from largest to smallest.
 * We check in descending order so the first match wins.
 */
const QUERIES: Array<{ query: string; tier: Breakpoint }> = [
  { query: "(min-width: 1280px)", tier: "xl" },
  { query: "(min-width: 1024px)", tier: "lg" },
  { query: "(min-width: 768px)", tier: "md" },
  { query: "(min-width: 640px)", tier: "sm" },
];

/** Determine current breakpoint by checking media queries top-down. */
function resolve(lists: MediaQueryList[]): Breakpoint {
  for (let i = 0; i < lists.length; i++) {
    if (lists[i].matches) return QUERIES[i].tier;
  }
  return "xs";
}

/**
 * React hook that returns the current viewport breakpoint tier.
 *
 * Uses `window.matchMedia` listeners (not resize events) for efficient,
 * debounced breakpoint detection. Re-renders only when the tier changes.
 *
 * Breakpoints (matching Tailwind defaults):
 * - `xs`: < 640px
 * - `sm`: 640–767px
 * - `md`: 768–1023px
 * - `lg`: 1024–1279px
 * - `xl`: 1280px+
 */
export function useBreakpoint(): Breakpoint {
  const listsRef = useRef<MediaQueryList[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazily create MediaQueryList objects (SSR-safe: only in useEffect)
  const getLists = useCallback(() => {
    if (listsRef.current.length === 0) {
      listsRef.current = QUERIES.map((q) => window.matchMedia(q.query));
    }
    return listsRef.current;
  }, []);

  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "lg"; // SSR fallback
    const lists = QUERIES.map((q) => window.matchMedia(q.query));
    listsRef.current = lists;
    return resolve(lists);
  });

  useEffect(() => {
    const lists = getLists();

    // Debounced handler — waits 100ms of inactivity before updating state
    const handleChange = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setBreakpoint(resolve(lists));
      }, 100);
    };

    // Attach listeners
    lists.forEach((mql) => mql.addEventListener("change", handleChange));

    // Sync on mount in case initial state is stale
    setBreakpoint(resolve(lists));

    // Cleanup: remove listeners and cancel pending debounce
    return () => {
      lists.forEach((mql) => mql.removeEventListener("change", handleChange));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [getLists]);

  return breakpoint;
}
