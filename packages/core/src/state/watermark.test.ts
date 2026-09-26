import { describe, expect, it } from 'vitest';
import { getBeforeState, parseEditState } from './editState';
import { layoutWatermark } from '../render/watermark';
import { DEFAULT_WATERMARK, parseWatermark } from './watermark';

describe('watermark state', () => {
  it('fills a partial watermark with defaults and clamps values', () => {
    expect(parseWatermark({ text: 'ACME', position: 'tile', opacity: 3 })).toEqual({
      ...DEFAULT_WATERMARK,
      text: 'ACME',
      position: 'tile',
      opacity: 1,
    });
  });

  it('rejects unsafe fonts / colours and logos without an asset', () => {
    const wm = parseWatermark({ fontFamily: 'x;}body{', color: 'url(x)' })!;
    expect(wm.fontFamily).toBe(DEFAULT_WATERMARK.fontFamily);
    expect(wm.color).toBe(DEFAULT_WATERMARK.color);
    expect(parseWatermark({ kind: 'image' })).toBeNull();
    expect(parseWatermark({ kind: 'image', assetId: 'logo' })?.kind).toBe('image');
  });

  it('is part of the edit state and left out of the compare "before" side', () => {
    const state = parseEditState({ watermark: { text: 'Hi' } });
    expect(state.watermark?.text).toBe('Hi');
    expect(getBeforeState(state).watermark).toBeNull();
  });

  it('lays out by fit: 100% fills the width inside the margin; custom stays inside the photo', () => {
    const size = { width: 2000, height: 1000 };
    // A 4:1 mark with a 30px margin (3% of 1000): 100% = (2000 − 60) wide.
    const full = layoutWatermark({ ...DEFAULT_WATERMARK, size: 1, margin: 0.03 }, size, 4);
    expect(full.width).toBeCloseTo(1940);
    expect(full.x).toBeCloseTo(30);
    const corner = layoutWatermark(
      { ...DEFAULT_WATERMARK, size: 0.25, margin: 0.03, position: 'top-left' },
      size,
      4,
    );
    expect(corner).toMatchObject({ x: 30, y: 30 });
    const dragged = layoutWatermark(
      { ...DEFAULT_WATERMARK, size: 0.25, position: 'custom', x: 0.99, y: 0.5 },
      size,
      4,
    );
    expect(dragged.x + dragged.width).toBeCloseTo(2000); // clamped to the right edge
  });
});
