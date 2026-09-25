import { describe, expect, it } from 'vitest';
import { getBeforeState, parseEditState } from './editState';
import { parseBackground, parseFrame } from './frame';

describe('frame & fill state', () => {
  it('parses frames: unknown styles are dropped, size is clamped, colour validated', () => {
    expect(parseFrame({ style: 'polaroid', size: 0.1, color: '#000' })).toEqual({
      style: 'polaroid',
      size: 0.1,
      color: '#000',
    });
    expect(parseFrame({ style: 'wavy' })).toBeNull();
    expect(parseFrame({ style: 'border', size: 5, color: 'url(x)' })).toEqual({
      style: 'border',
      size: 0.2,
      color: '#ffffff',
    });
  });

  it('parses fills', () => {
    expect(parseBackground({ kind: 'color', color: '#123456' })).toEqual({
      kind: 'color',
      color: '#123456',
    });
    expect(parseBackground({ kind: 'color', color: 'javascript:1' })).toBeNull();
    expect(parseBackground({ kind: 'image', assetId: 'a1' })).toEqual({
      kind: 'image',
      assetId: 'a1',
    });
    expect(parseBackground({ kind: 'blur' })).toEqual({ kind: 'blur' });
    expect(parseBackground({ kind: 'gradient' })).toBeNull();
  });

  it('defaults to none, and compare\'s "before" drops both', () => {
    const state = parseEditState({ frame: { style: 'line' }, background: { kind: 'blur' } });
    expect(state.frame?.style).toBe('line');
    expect(parseEditState({}).frame).toBeNull();
    const before = getBeforeState(state);
    expect(before.frame).toBeNull();
    expect(before.background).toBeNull();
  });
});
