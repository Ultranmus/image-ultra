import { describe, expect, it } from 'vitest';
import {
  flipAnnotations,
  getShapeCorners,
  hitTestShape,
  moveShape,
  resizeRotatedBox,
  rotateAnnotations,
  setShapeBox,
  shapeAt,
  type LineShape,
  type PathShape,
  type RectShape,
  type TextShape,
} from './annotations';
import { parseAnnotations } from './parseAnnotations';

const rect = (patch: Partial<RectShape> = {}): RectShape => ({
  id: 'r',
  type: 'rect',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  opacity: 1,
  fill: '#f00',
  stroke: null,
  strokeWidth: 4,
  cornerRadius: 0,
  ...patch,
});
const line: LineShape = {
  id: 'l',
  type: 'line',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  rotation: 0,
  opacity: 1,
  stroke: '#000',
  strokeWidth: 4,
  startCap: 'none',
  endCap: 'arrow',
};
const size = { width: 400, height: 300 };

describe('annotations', () => {
  it('hit-tests rotated boxes in their own frame', () => {
    const r = rect({ rotation: 90 }); // 100×50 box turned upright around its centre (60, 45)
    expect(hitTestShape(r, { x: 60, y: 90 }, 0)).toBe(true); // inside the turned box
    expect(hitTestShape(r, { x: 105, y: 45 }, 0)).toBe(false); // was inside before turning
  });

  it('hit-tests lines with stroke width + tolerance, and ignores hidden/locked in shapeAt', () => {
    expect(hitTestShape(line, { x: 50, y: 3 }, 1)).toBe(true);
    expect(hitTestShape(line, { x: 50, y: 10 }, 1)).toBe(false);
    expect(shapeAt([rect(), rect({ id: 'top', locked: true })], { x: 20, y: 30 }, 0)?.id).toBe('r');
    const withLocked = shapeAt(
      [rect(), rect({ id: 'top', locked: true })],
      { x: 20, y: 30 },
      0,
      undefined,
      {
        includeLocked: true,
      },
    );
    expect(withLocked?.id).toBe('top');
  });

  it('moves and resizes', () => {
    expect(moveShape(line, 5, 5).points[0]).toEqual({ x: 5, y: 5 });
    const path: PathShape = {
      id: 'p',
      type: 'path',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      closed: false,
      smooth: true,
      fill: null,
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      opacity: 1,
    };
    const scaled = setShapeBox(path, { x: 0, y: 0, width: 20, height: 40 });
    expect(scaled.points[1]).toEqual({ x: 20, y: 40 });
  });

  it('resizing a rotated box keeps the opposite corner in place', () => {
    const r = rect({ rotation: 30 });
    const before = getShapeCorners(r)[0]; // top-left is opposite the se handle
    const box = resizeRotatedBox(r, 30, 'se', { x: 40, y: 25 }, false);
    const after = getShapeCorners({ ...r, ...box })[0];
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('text: corner handles scale the font, side handles only change the wrap width', () => {
    const t: TextShape = {
      id: 't',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      text: 'hi',
      fontFamily: 'sans-serif',
      fontSize: 20,
      fontWeight: 400,
      fontStyle: 'normal',
      align: 'left',
      lineHeight: 1.25,
      color: '#000',
      background: null,
      rotation: 0,
      opacity: 1,
    };
    expect(
      setShapeBox(t, { x: 0, y: 0, width: 200, height: 10 }, { scaleText: true }).fontSize,
    ).toBe(40);
    expect(setShapeBox(t, { x: 0, y: 0, width: 200, height: 10 }).fontSize).toBe(20);
  });

  it('rotating the photo carries shapes along; four turns return them', () => {
    const r = rect();
    const [cw] = rotateAnnotations([r], size, 1) as [RectShape];
    // Centre (60, 45) → (H − y, x) = (255, 60); box turns with the photo.
    expect(cw.x + cw.width / 2).toBeCloseTo(255, 6);
    expect(cw.y + cw.height / 2).toBeCloseTo(60, 6);
    expect(cw.rotation).toBe(90);
    let shapes = [r, line];
    let s = size;
    for (let i = 0; i < 4; i++) {
      shapes = rotateAnnotations(shapes, s, 1) as typeof shapes;
      s = { width: s.height, height: s.width };
    }
    expect((shapes[0] as RectShape).x).toBeCloseTo(r.x, 6);
    expect((shapes[1] as LineShape).points[1].x).toBeCloseTo(100, 6);
  });

  it('flipping mirrors positions and angles but never mirrors text', () => {
    const [f] = flipAnnotations([rect({ rotation: 20 })], size, 'x') as [RectShape];
    expect(f.x + f.width / 2).toBeCloseTo(400 - 60, 6);
    expect(f.rotation).toBe(-20);
    const [l] = flipAnnotations([line], size, 'x') as [LineShape];
    expect(l.points[1].x).toBe(300);
  });

  it('parses untrusted shapes safely', () => {
    const parsed = parseAnnotations([
      rect(),
      { id: 'bad', type: 'rect', x: 0 },
      { id: 'x', type: 'text', x: 0, y: 0, width: 50, text: 'ok', color: 'url(javascript:1)' },
      { id: 'r', type: 'ellipse', x: 0, y: 0, width: 1, height: 1 }, // duplicate id
    ]);
    expect(parsed.map((s) => s.id)).toEqual(['r', 'x']);
    expect((parsed[1] as TextShape).color).toBe('#000000');
  });
});
