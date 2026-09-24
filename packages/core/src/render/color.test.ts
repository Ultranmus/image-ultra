import { describe, expect, it } from 'vitest';
import { createFinetuneState } from '../state/editState';
import { adjustColor, linearToSrgb, srgbToLinear } from './color';

describe('adjustColor', () => {
  it('is (almost) the identity with neutral settings', () => {
    const out = adjustColor([0.2, 0.5, 0.9], 0.5, 0.5, createFinetuneState());
    expect(out[0]).toBeCloseTo(0.2, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(0.9, 5);
  });

  it('sRGB conversions round-trip', () => {
    for (const c of [0, 0.01, 0.5, 1]) expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 6);
  });

  it('saturation −1 produces grey', () => {
    const [r, g, b] = adjustColor([0.9, 0.2, 0.1], 0.5, 0.5, {
      ...createFinetuneState(),
      saturation: -1,
    });
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });

  it('warm temperature raises red and lowers blue', () => {
    const [r, , b] = adjustColor([0.5, 0.5, 0.5], 0.5, 0.5, {
      ...createFinetuneState(),
      temperature: 1,
    });
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('vignette darkens corners but not the centre', () => {
    const f = { ...createFinetuneState(), vignette: 1 };
    expect(adjustColor([0.5, 0.5, 0.5], 0.5, 0.5, f)[0]).toBeCloseTo(0.5, 6);
    expect(adjustColor([0.5, 0.5, 0.5], 0, 0, f)[0]).toBeLessThan(0.05);
  });
});
