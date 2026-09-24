/** SVG area path for a 256-bin histogram in a `width`×`height` box (square-root scaled). */
export function histogramPath(bins: Uint32Array, width: number, height: number): string {
  let max = 0;
  for (let i = 1; i < 255; i++) max = Math.max(max, bins[i]!); // ignore clipped ends when scaling
  if (max === 0) return '';
  const k = Math.sqrt(max);
  let d = `M0 ${height}`;
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width;
    const y = height - Math.min(1, Math.sqrt(bins[i]!) / k) * height;
    d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}L${width} ${height}Z`;
}
