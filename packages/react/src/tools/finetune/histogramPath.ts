/** Largest bin, ignoring the clipped ends (they'd flatten everything else). */
function peak(bins: Uint32Array): number {
  let max = 0;
  for (let i = 1; i < 255; i++) max = Math.max(max, bins[i]!);
  return max;
}

function points(bins: Uint32Array, width: number, height: number, max: number): string {
  const k = Math.sqrt(max);
  let d = '';
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width;
    const y = height - Math.min(1, Math.sqrt(bins[i]!) / k) * height;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function sameBins(a: Uint32Array, b: Uint32Array): boolean {
  for (let i = 0; i < 256; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * SVG paths for a 256-bin histogram in a `width`×`height` box (square-root scaled): `before` as a
 * filled area and `after` as an outline on the same scale, or `null` when the two are the same.
 */
export function histogramPaths(
  before: Uint32Array,
  after: Uint32Array | null,
  width: number,
  height: number,
): { before: string; after: string | null } {
  const shown = after && !sameBins(before, after) ? after : null;
  const max = Math.max(peak(before), shown ? peak(shown) : 0);
  if (max === 0) return { before: '', after: null };
  return {
    before: `M0 ${height}${points(before, width, height, max).replace(/^M/, 'L')}L${width} ${height}Z`,
    after: shown ? points(shown, width, height, max) : null,
  };
}
