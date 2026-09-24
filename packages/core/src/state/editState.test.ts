import { describe, expect, it } from 'vitest';
import { createEditState, EditStateError, parseEditState } from './editState';

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

  it('rejects other versions and non-objects', () => {
    expect(() => parseEditState({ version: 2 })).toThrow(EditStateError);
    expect(() => parseEditState('not json')).toThrow(EditStateError);
    expect(() => parseEditState(42)).toThrow(EditStateError);
  });
});
