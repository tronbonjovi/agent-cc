export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;

export function computeZoomTransform(
  prev: Transform,
  cursorX: number,
  cursorY: number,
  deltaY: number,
  min: number = ZOOM_MIN,
  max: number = ZOOM_MAX,
): Transform {
  const factor = deltaY < 0 ? 1.1 : 0.9;
  const nextScale = Math.min(max, Math.max(min, prev.scale * factor));
  if (nextScale === prev.scale) return prev;

  const canvasX = (cursorX - prev.x) / prev.scale;
  const canvasY = (cursorY - prev.y) / prev.scale;

  return {
    x: cursorX - canvasX * nextScale,
    y: cursorY - canvasY * nextScale,
    scale: nextScale,
  };
}
