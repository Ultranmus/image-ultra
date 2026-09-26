import { describe, expect, it } from 'vitest';
import { createEditState, type EditState, type FinetuneState } from '../state/editState';
import { FILTER_PRESETS, filterFromPreset } from '../filters/presets';
import {
  colorPixel,
  compileColor,
  detailPixel,
  finishPixel,
  hash2,
  linearToSrgb,
  srgbToLinear,
} from './color';

const withFinetune = (f: Partial<FinetuneState>): EditState => {
  const s = createEditState();
  s.finetune = { ...s.finetune, ...f };
  return s;
};
const px = (state: EditState, rgb: [number, number, number]) =>
  colorPixel(rgb, compileColor(state));

describe('colour pipeline', () => {
  it('is the identity with no edits and reports no work', () => {
    const program = compileColor(createEditState());
    expect(program.hasColor || program.hasDetail || program.hasFinish).toBe(false);
    expect(colorPixel([0.2, 0.5, 0.9], program)).toEqual([0.2, 0.5, 0.9]);
  });

  it('sRGB conversions round-trip', () => {
    for (const c of [0, 0.01, 0.5, 1]) expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 6);
  });

  it('saturation −1 produces grey', () => {
    const [r, g, b] = px(withFinetune({ saturation: -1 }), [0.9, 0.2, 0.1]);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });

  it('warm temperature raises red and lowers blue', () => {
    const [r, , b] = px(withFinetune({ temperature: 1 }), [0.5, 0.5, 0.5]);
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('vibrance boosts muted colours more than saturated ones', () => {
    const state = withFinetune({ vibrance: 1 });
    const muted = px(state, [0.55, 0.5, 0.45]);
    const vivid = px(state, [0.9, 0.2, 0.1]);
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(spread(muted) / 0.1).toBeGreaterThan(spread(vivid) / 0.8);
  });

  it('hue rotation keeps greys grey and changes colours', () => {
    const state = withFinetune({ hue: 0.5 });
    const grey = px(state, [0.4, 0.4, 0.4]);
    expect(grey[0]).toBeCloseTo(0.4, 3);
    expect(grey[2]).toBeCloseTo(0.4, 3);
    const red = px(state, [0.8, 0.1, 0.1]);
    expect(red[0]).toBeLessThan(0.6);
  });

  it('shadows lifts dark tones but leaves highlights alone', () => {
    const state = withFinetune({ shadows: 1 });
    expect(px(state, [0.1, 0.1, 0.1])[0]).toBeGreaterThan(0.3);
    expect(px(state, [0.9, 0.9, 0.9])[0]).toBeCloseTo(0.9, 3);
  });

  it('levels stretch the tonal range', () => {
    const state = createEditState();
    state.levels = { black: 0.2, white: 0.8, mid: 0 };
    expect(px(state, [0.2, 0.5, 0.8])[0]).toBeCloseTo(0, 2);
    expect(px(state, [0.2, 0.5, 0.8])[1]).toBeCloseTo(0.5, 2);
    expect(px(state, [0.2, 0.5, 0.8])[2]).toBeCloseTo(1, 2);
  });

  it('a filter at intensity 0 changes nothing; Mono makes grey', () => {
    const mono = FILTER_PRESETS.find((p) => p.id === 'mono')!;
    const state = createEditState();
    state.filter = filterFromPreset(mono, 0);
    expect(compileColor(state).hasColor).toBe(false);
    state.filter = filterFromPreset(mono, 1);
    const [r, g, b] = px(state, [0.9, 0.3, 0.2]);
    expect(r).toBeCloseTo(g, 2);
    expect(g).toBeCloseTo(b, 2);
  });

  it('every built-in filter produces valid colours', () => {
    for (const preset of FILTER_PRESETS) {
      const state = createEditState();
      state.filter = filterFromPreset(preset);
      for (const c of [0, 0.3, 0.7, 1]) {
        for (const v of px(state, [c, 1 - c, c * 0.5])) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('detail and finish', () => {
  const f = withFinetune({ sharpen: 1, clarity: 0 }).finetune;

  it('sharpen pushes a pixel away from its blurred surroundings', () => {
    const out = detailPixel([0.6, 0.6, 0.6], { sharpen: [0.5, 0.5, 0.5] }, f);
    expect(out[0]).toBeGreaterThan(0.6);
  });

  it('blur replaces the pixel with the blurred value', () => {
    expect(detailPixel([0.9, 0.9, 0.9], { blur: [0.2, 0.3, 0.4] }, f)).toEqual([0.2, 0.3, 0.4]);
  });

  it('vignette darkens corners, not the centre; round mask clears corners', () => {
    const params = {
      finetune: withFinetune({ vignette: 1 }).finetune,
      output: { width: 100, height: 100 },
      photo: { x: 0, y: 0, width: 100, height: 100 },
      ellipse: true,
      ellipseAA: 0.02,
    };
    expect(finishPixel([0.5, 0.5, 0.5], 50, 50, params)).toEqual([0.5, 0.5, 0.5, 1]);
    const corner = finishPixel([0.5, 0.5, 0.5], 1, 1, params);
    expect(corner[0]).toBeLessThan(0.05);
    expect(corner[3]).toBe(0);
  });

  it('vignette and round mask follow the photo inside added canvas space', () => {
    const params = {
      finetune: withFinetune({ vignette: 1 }).finetune,
      output: { width: 200, height: 100 },
      photo: { x: 100, y: 0, width: 100, height: 100 },
      ellipse: true,
      ellipseAA: 0.02,
    };
    // The photo's centre is untouched and fully visible; the output's centre is its left edge.
    expect(finishPixel([0.5, 0.5, 0.5], 150, 50, params)).toEqual([0.5, 0.5, 0.5, 1]);
    expect(finishPixel([0.5, 0.5, 0.5], 101, 50, params)[0]).toBeLessThan(0.5);
  });

  it('grain hash is deterministic and roughly uniform', () => {
    expect(hash2(12, 34)).toBe(hash2(12, 34));
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += hash2(i, i * 7);
    expect(sum / 1000).toBeGreaterThan(0.45);
    expect(sum / 1000).toBeLessThan(0.55);
  });
});
