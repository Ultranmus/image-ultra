import { describe, expect, it } from 'vitest';
import { clampViewport, fitViewport, getFitScale, stageToImage, zoomAt } from './viewport';

const image = { width: 4000, height: 2000 };
const stage = { width: 1048, height: 648 };

describe('viewport', () => {
  it('fits the image inside the stage minus padding', () => {
    expect(getFitScale(image, stage, { padding: 24 })).toBeCloseTo(0.25);
  });

  it('centres the fitted image', () => {
    const vp = fitViewport(image, stage, { padding: 24 });
    expect(vp).toEqual({ scale: 0.25, x: 24, y: 74 });
  });

  it('keeps the anchor point fixed while zooming', () => {
    const vp = fitViewport(image, stage, { padding: 24 });
    const anchor = { x: 300, y: 200 };
    const before = stageToImage(vp, anchor);
    const after = stageToImage(zoomAt(vp, 1, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('never zooms out below fit and never leaves a gap at the edges', () => {
    const vp = clampViewport({ scale: 1, x: 500, y: -99999 }, image, stage, { padding: 24 });
    expect(vp.x).toBe(0);
    expect(vp.y).toBe(stage.height - image.height);
    expect(clampViewport({ scale: 0.01, x: 0, y: 0 }, image, stage, { padding: 24 }).scale).toBe(
      0.25,
    );
  });
});
