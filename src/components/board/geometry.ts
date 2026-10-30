import type { Camera, Handle, Layer, Point, Points, XYWH } from "./types";

type Bounded = Pick<XYWH, "x" | "y" | "width" | "height">;

export function screenToWorld(clientX: number, clientY: number, rect: DOMRect, camera: Camera): Point {
  const scale = camera.flipped ? -camera.zoom : camera.zoom;
  return {
    x: (clientX - rect.left - camera.x) / scale,
    y: (clientY - rect.top - camera.y) / scale,
  };
}

/** Turns the camera to the other side of the table, keeping the same spot in the middle of the viewport. */
export function flipCamera(camera: Camera, viewportWidth: number, viewportHeight: number): Camera {
  return { ...camera, flipped: !camera.flipped, x: viewportWidth - camera.x, y: viewportHeight - camera.y };
}

export function boundsOf(items: readonly Bounded[]): XYWH | null {
  if (items.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of items) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.width);
    bottom = Math.max(bottom, b.y + b.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rectFromPoints(a: Point, b: Point): XYWH {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function rectsIntersect(a: XYWH, b: Bounded) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

/** Turns absolute points into a layer origin, size and relative points. */
export function normalizePoints(absolute: Points) {
  const xs = absolute.map((p) => p[0]);
  const ys = absolute.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    points: absolute.map((p) => [p[0] - x, p[1] - y]),
  };
}

/** Smooth SVG path through freehand points (quadratic curves between midpoints). */
export function smoothPath(points: Points) {
  if (points.length === 0) return "";
  if (points.length < 3) {
    const [first] = points;
    const last = points[points.length - 1];
    return `M ${first[0]} ${first[1]} L ${last[0]} ${last[1]}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

export function arrowHeadPath(from: ReadonlyArray<number>, to: ReadonlyArray<number>, strokeWidth: number) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const size = Math.max(12, strokeWidth * 3.5);
  const spread = Math.PI / 7;
  const a = [to[0] - size * Math.cos(angle - spread), to[1] - size * Math.sin(angle - spread)];
  const b = [to[0] - size * Math.cos(angle + spread), to[1] - size * Math.sin(angle + spread)];
  return `M ${a[0]} ${a[1]} L ${to[0]} ${to[1]} L ${b[0]} ${b[1]}`;
}

/**
 * Where the selection's new left/top edge is and how much it scales on each
 * axis while a resize handle is dragged. Scales go negative when the handle
 * is dragged past the opposite edge, which mirrors the selection.
 */
export type ResizeTransform = { left: number; top: number; sx: number; sy: number };

export function resizeTransform(initial: XYWH, handle: Handle, p: Point, keepAspect: boolean): ResizeTransform {
  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;
  let sx = 1;
  let sy = 1;

  if (initial.width > 0) {
    if (handle.includes("e")) sx = (p.x - initial.x) / initial.width;
    if (handle.includes("w")) sx = (right - p.x) / initial.width;
  }
  if (initial.height > 0) {
    if (handle.includes("s")) sy = (p.y - initial.y) / initial.height;
    if (handle.includes("n")) sy = (bottom - p.y) / initial.height;
  }

  const isCorner = handle.length === 2;
  if (keepAspect && isCorner) {
    const s = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * s;
    sy = Math.sign(sy || 1) * s;
  }

  return {
    left: handle.includes("w") ? right - initial.width * sx : initial.x,
    top: handle.includes("n") ? bottom - initial.height * sy : initial.y,
    sx,
    sy,
  };
}

/** Applies a selection resize to one layer, given that layer's state when the resize started. */
export function resizeLayer(layer: Layer, initial: XYWH, t: ResizeTransform): Partial<Layer> {
  const tx = (x: number) => t.left + (x - initial.x) * t.sx;
  const ty = (y: number) => t.top + (y - initial.y) * t.sy;

  if (layer.type === "path" || layer.type === "line" || layer.type === "arrow") {
    return normalizePoints(layer.points.map((p) => [tx(layer.x + p[0]), ty(layer.y + p[1])]));
  }

  return rectFromPoints(
    { x: tx(layer.x), y: ty(layer.y) },
    { x: tx(layer.x + layer.width), y: ty(layer.y + layer.height) },
  );
}
