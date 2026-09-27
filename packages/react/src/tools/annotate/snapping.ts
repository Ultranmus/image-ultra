import type { Box } from '@image-ultra/core/internal';

export interface SnapResult {
  dx: number;
  dy: number;
  /** Guide lines to draw, in the same space as the boxes. */
  guides: { x?: number; y?: number }[];
}

/**
 * Snaps a moving box (already offset by the raw drag) to the frame and other boxes: left/centre/
 * right against the targets' left/centre/right, same for y. `threshold` in box units.
 */
export function snapBox(moving: Box, targets: readonly Box[], threshold: number): SnapResult {
  const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
  const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];
  const best = (mine: number[], theirs: number[]) => {
    let result: { delta: number; at: number } | null = null;
    for (const m of mine) {
      for (const t of theirs) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (!result || Math.abs(d) < Math.abs(result.delta))) {
          result = { delta: d, at: t };
        }
      }
    }
    return result;
  };
  const bx = best(xs(moving), targets.flatMap(xs));
  const by = best(ys(moving), targets.flatMap(ys));
  const guides: SnapResult['guides'] = [];
  if (bx) guides.push({ x: bx.at });
  if (by) guides.push({ y: by.at });
  return { dx: bx?.delta ?? 0, dy: by?.delta ?? 0, guides };
}

/** Rotation snapping: Shift → 15° steps; otherwise a soft snap to 0/90/180/270 within 3°. */
export function snapAngle(degrees: number, fine: boolean): number {
  if (fine) return Math.round(degrees / 15) * 15;
  const nearest = Math.round(degrees / 90) * 90;
  return Math.abs(degrees - nearest) < 3 ? nearest : degrees;
}
