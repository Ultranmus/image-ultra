import { describe, expect, it } from 'vitest';
import { createEditState, EditStateError, getBeforeState, parseEditState } from './editState';

describe('parseEditState', () => {
  it('round-trips through JSON', () => {
    const state = createEditState();
    state.geometry.rotation = 270;
    state.finetune.contrast = 0.4;
    expect(parseEditState(JSON.stringify(state))).toEqual(state);
  });

  it('fills defaults and clamps untrusted values', () => {
    const parsed = parseEditState({
      geometry: { rotation: 450, straighten: 90, crop: { x: 0, y: 0, width: 0, height: 5 } },
      finetune: { brightness: 7, contrast: 'high' },
    });
    expect(parsed.geometry.rotation).toBe(90);
    expect(parsed.geometry.straighten).toBe(45);
    expect(parsed.geometry.crop).toBeNull();
    expect(parsed.finetune.brightness).toBe(1);
    expect(parsed.finetune.contrast).toBe(0);
    expect(parsed.assets).toEqual({});
  });

  it('reads Phase 3 fields: perspective, aspect, shape, resize', () => {
    const parsed = parseEditState({
      geometry: { perspective: { x: 3, y: -0.5 }, cropAspect: -2, cropShape: 'ellipse' },
      resize: { width: 99999.4, height: 480.6 },
    });
    expect(parsed.geometry.perspective).toEqual({ x: 1, y: -0.5 });
    expect(parsed.geometry.cropAspect).toBeNull();
    expect(parsed.geometry.cropShape).toBe('ellipse');
    expect(parsed.resize).toEqual({ width: 16384, height: 481 });
  });

  it('reads Phase 4 fields: finetune ranges, levels, curves, filter', () => {
    const parsed = parseEditState({
      finetune: { blur: -1, grain: 3, hue: 0.5 },
      levels: { black: 0.5, white: 0.2, mid: 9 },
      curves: { rgb: [[0.5, 0.6]], red: 'nope' },
      filter: { id: 'x', intensity: 2, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 99] },
    });
    expect(parsed.finetune.blur).toBe(0);
    expect(parsed.finetune.grain).toBe(1);
    expect(parsed.finetune.hue).toBe(0.5);
    expect(parsed.levels).toEqual({ black: 0.5, white: 0.51, mid: 1 });
    expect(parsed.curves.rgb).toEqual([
      [0, 0],
      [0.5, 0.6],
      [1, 1],
    ]);
    expect(parsed.curves.red).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(parsed.filter).toEqual({ id: 'x', name: 'x', intensity: 1 }); // 13-number matrix dropped
  });

  it('rejects other versions and non-objects', () => {
    expect(() => parseEditState({ version: 2 })).toThrow(EditStateError);
    expect(() => parseEditState('not json')).toThrow(EditStateError);
    expect(() => parseEditState(42)).toThrow(EditStateError);
  });
});

describe('getBeforeState', () => {
  it('keeps the framing and drops the look', () => {
    const edited = createEditState();
    edited.geometry.rotation = 90;
    edited.resize = { width: 100, height: 50 };
    edited.finetune.contrast = 0.4;
    edited.annotations = [
      {
        id: 'r',
        type: 'rect',
        rotation: 0,
        opacity: 1,
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        fill: null,
        stroke: '#fff',
        strokeWidth: 1,
        cornerRadius: 0,
      },
    ];
    const before = getBeforeState(edited);
    expect(before.geometry).toBe(edited.geometry);
    expect(before.resize).toBe(edited.resize);
    expect(before.finetune.contrast).toBe(0);
    expect(before.annotations).toEqual([]);
  });
});
