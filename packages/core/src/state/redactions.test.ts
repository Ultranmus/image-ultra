import { describe, expect, it } from 'vitest';
import { parseEditState } from './editState';
import {
  flipRedactions,
  hitTestRedaction,
  moveRedaction,
  parseRedactions,
  redactionAt,
  redactionBounds,
  redactBlockSize,
  resizeRedaction,
  rotateRedactions,
  type RedactBox,
  type RedactBrush,
} from './redactions';

const box = (overrides: Partial<RedactBox> = {}): RedactBox => ({
  id: 'b',
  kind: 'box',
  style: 'pixelate',
  strength: 0.5,
  color: '#000000',
  rotation: 0,
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  ...overrides,
});

const brush: RedactBrush = {
  id: 'p',
  kind: 'brush',
  style: 'blur',
  strength: 0.5,
  color: '#000000',
  rotation: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  size: 20,
};

describe('redactions', () => {
  it('measures bounds (brush includes its radius) and hit-tests', () => {
    expect(redactionBounds(box())).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(redactionBounds(brush)).toEqual({ x: -10, y: -10, width: 120, height: 20 });
    expect(hitTestRedaction(box(), { x: 50, y: 40 }, 0)).toBe(true);
    expect(hitTestRedaction(brush, { x: 50, y: 9 }, 0)).toBe(true);
    expect(hitTestRedaction(brush, { x: 50, y: 12 }, 0)).toBe(false);
    expect(redactionAt([box(), box({ id: 'top' })], { x: 50, y: 40 }, 0)?.id).toBe('top');
  });

  it('moves, and follows 90° turns and flips of the photo', () => {
    expect(moveRedaction(box(), 5, 5)).toMatchObject({ x: 15, y: 25 });
    const size = { width: 400, height: 300 };
    // Clockwise: (x, y) → (H − y, x).
    expect(rotateRedactions([box()], size, 1)[0]).toMatchObject({
      x: 300 - 70,
      y: 10,
      width: 50,
      height: 100,
    });
    expect(flipRedactions([box()], size, 'x')[0]).toMatchObject({ x: 400 - 110, y: 20 });
    const back = rotateRedactions(
      rotateRedactions([box()], size, 1),
      { width: 300, height: 400 },
      -1,
    );
    expect(back[0]).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('rotated areas hit-test in their own frame; turns and flips carry the angle', () => {
    // 100 × 50 box turned upright around its centre (60, 45).
    const turned = box({ rotation: 90 });
    expect(hitTestRedaction(turned, { x: 60, y: 90 }, 0)).toBe(true);
    expect(hitTestRedaction(turned, { x: 105, y: 45 }, 0)).toBe(false);
    const size = { width: 400, height: 300 };
    const flipped = flipRedactions([box({ rotation: 30 })], size, 'x')[0]!;
    expect(flipped.rotation).toBe(-30);
    const quarter = rotateRedactions([box({ rotation: 30 })], size, 1)[0] as RedactBox;
    expect(quarter).toMatchObject({ rotation: 30, width: 50, height: 100 });
    // The centre (60, 45) moves to (300 − 45, 60).
    expect(quarter.x + quarter.width / 2).toBeCloseTo(255);
    expect(quarter.y + quarter.height / 2).toBeCloseTo(60);
  });

  it('resizes boxes directly and scales brush strokes to the new bounds', () => {
    expect(resizeRedaction(box(), { x: 0, y: 0, width: 10, height: 10 })).toMatchObject({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    // Brush bounds are 120 × 20 at (−10, −10); doubling both sides doubles the stroke.
    const bigger = resizeRedaction(brush, { x: -10, y: -10, width: 240, height: 40 });
    expect(redactionBounds(bigger)).toEqual({ x: -10, y: -10, width: 240, height: 40 });
    expect(bigger.size).toBeCloseTo(40);
  });

  it('parses untrusted JSON: drops broken areas, clamps and defaults fields', () => {
    const parsed = parseRedactions([
      box({ strength: 7 }),
      { ...brush, color: 'url(evil)' },
      { id: 'x', kind: 'box', x: 0, y: 0, width: -5, height: 5 },
      { id: 'y', kind: 'triangle' },
      'nope',
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.strength).toBe(1);
    expect(parsed[1]!.color).toBe('#000000');
    expect(parseEditState({}).redactions).toEqual([]);
    expect(parseEditState({ redactions: [box()] }).redactions).toHaveLength(1);
  });

  it('scales strength with the image', () => {
    expect(redactBlockSize(0.5, 2000)).toBeCloseTo(2000 * 0.033);
    expect(redactBlockSize(0, 100)).toBe(2);
  });
});
