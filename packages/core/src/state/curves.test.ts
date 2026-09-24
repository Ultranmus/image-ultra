import { describe, expect, it } from 'vitest';
import { buildToneLUT, createCurveFunction, createLevelsFunction, sampleLUT } from './curves';
import { createCurvesState, createLevelsState, parseCurve } from './editState';

describe('curves', () => {
  it('passes through its control points and stays monotone', () => {
    const f = createCurveFunction([
      [0, 0],
      [0.25, 0.15],
      [0.75, 0.9],
      [1, 1],
    ]);
    expect(f(0.25)).toBeCloseTo(0.15, 6);
    expect(f(0.75)).toBeCloseTo(0.9, 6);
    let last = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      last = y;
    }
  });

  it('levels map black/white points and bend mid-tones', () => {
    const f = createLevelsFunction({ black: 0.1, white: 0.9, mid: 1 });
    expect(f(0.1)).toBe(0);
    expect(f(0.9)).toBe(1);
    expect(f(0.5)).toBeGreaterThan(0.5); // positive mid brightens
  });

  it('the LUT is null for neutral settings and samples linearly otherwise', () => {
    expect(buildToneLUT(createLevelsState(), createCurvesState())).toBeNull();
    const curves = createCurvesState();
    curves.red = [
      [0, 0],
      [0.5, 0.7],
      [1, 1],
    ];
    const lut = buildToneLUT(createLevelsState(), curves)!;
    expect(sampleLUT(lut, 0, 0.5)).toBeCloseTo(0.7, 2);
    expect(sampleLUT(lut, 1, 0.5)).toBeCloseTo(0.5, 2); // green untouched
  });

  it('parseCurve sorts, clamps, dedupes and adds end points', () => {
    expect(
      parseCurve([
        [0.5, 2],
        [0.2, 0.1],
        [0.205, 0.3],
      ]),
    ).toEqual([
      [0, 0],
      [0.2, 0.1],
      [0.5, 1],
      [1, 1],
    ]);
  });
});
