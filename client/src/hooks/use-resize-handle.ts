// client/src/hooks/use-resize-handle.ts

import { useState, useCallback, useRef, useEffect } from "react";

interface UseResizeHandleOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  /** "left" means dragging the left edge (right sidebar), "right" means dragging the right edge (left sidebar) */
  side: "left" | "right";
}

/**
 * Hook for resizable panel widths via a drag handle.
 * Returns the current width and props for the drag handle element.
 */
export function useResizeHandle({ initialWidth, minWidth, maxWidth, side }: UseResizeHandleOptions) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = side === "right"
        ? startWidth.current + delta
        : startWidth.current - delta;
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    }

    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, maxWidth, side]);

  return { width, onMouseDown };
}
