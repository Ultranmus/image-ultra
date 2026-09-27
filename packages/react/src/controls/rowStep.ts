/**
 * ← / → as a step along a row of items (chips, colours, tools): +1 = next, −1 = previous, 0 = not
 * an arrow. In a right-to-left row → goes to the previous item. Sliders and the photo don't use
 * this: they stay left-to-right.
 */
export function rowStep(key: string, element: Element): -1 | 0 | 1 {
  const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (step === 0) return 0;
  return getComputedStyle(element).direction === 'rtl' ? (step === 1 ? -1 : 1) : step;
}
