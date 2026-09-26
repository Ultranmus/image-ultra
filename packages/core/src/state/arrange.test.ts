import { describe, expect, it } from 'vitest';
import type { LineShape, RectShape, Shape } from './annotations';
import {
  alignShapes,
  boxesIntersect,
  distributeShapes,
  groupBounds,
  rotateShapes,
  scaleShapes,
} from './arrange';

const rect = (id: string, x: number, y: number, w = 10, h = 10): RectShape => ({
  id,
  type: 'rect',
  rotation: 0,
  opacity: 1,
  x,
  y,
  width: w,
  height: h,
  fill: null,
  stroke: '#000',
  strokeWidth: 2,
  cornerRadius: 0,
});

const line: LineShape = {
  id: 'l',
  type: 'line',
  rotation: 0,
  opacity: 1,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  stroke: '#000',
  strokeWidth: 4,
  startCap: 'none',
  endCap: 'arrow',
};

const xs = (list: Shape[]) => list.map((s) => (s as RectShape).x);

describe('arrange', () => {
  it('groupBounds covers every shape', () => {
    expect(groupBounds([rect('a', 0, 0), rect('b', 50, 20, 10, 30)])).toEqual({
      x: 0,
      y: 0,
      width: 60,
      height: 50,
    });
    expect(groupBounds([])).toBeNull();
  });

  it('scaleShapes scales positions, sizes and strokes around a point', () => {
    const [a, l] = scaleShapes([rect('a', 10, 10), line], { x: 0, y: 0 }, 2) as [
      RectShape,
      LineShape,
    ];
    expect([a.x, a.y, a.width, a.strokeWidth]).toEqual([20, 20, 20, 4]);
    expect(l.points[1]).toEqual({ x: 200, y: 0 });
    expect(l.strokeWidth).toBe(8);
  });

  it('rotateShapes turns box shapes around the group centre and adds to their angle', () => {
    const [a, l] = rotateShapes([rect('a', 90, -5), line], { x: 0, y: 0 }, 90) as [
      RectShape,
      LineShape,
    ];
    // Centre (95, 0) → (0, 95).
    expect(a.x + a.width / 2).toBeCloseTo(0);
    expect(a.y + a.height / 2).toBeCloseTo(95);
    expect(a.rotation).toBe(90);
    expect(l.points[1].x).toBeCloseTo(0);
    expect(l.points[1].y).toBeCloseTo(100);
    expect(l.rotation).toBe(0);
  });

  it('alignShapes lines shapes up on an edge or centre of the target', () => {
    const shapes = [rect('a', 0, 0), rect('b', 40, 5, 20)];
    const target = { x: 0, y: 0, width: 60, height: 15 };
    expect(xs(alignShapes(shapes, 'left', target))).toEqual([0, 0]);
    expect(xs(alignShapes(shapes, 'right', target))).toEqual([50, 40]);
    expect(xs(alignShapes(shapes, 'centerX', target))).toEqual([25, 20]);
    const ys = alignShapes(shapes, 'bottom', target).map((s) => (s as RectShape).y);
    expect(ys).toEqual([5, 5]);
  });

  it('distributeShapes makes equal gaps, keeps the outer shapes and the input order', () => {
    const shapes = [rect('c', 100, 0), rect('a', 0, 0), rect('b', 20, 0)];
    const result = distributeShapes(shapes, 'x');
    expect(xs(result)).toEqual([100, 0, 50]);
    expect(distributeShapes(shapes.slice(0, 2), 'x')).toEqual(shapes.slice(0, 2));
  });

  it('boxesIntersect counts overlap and touching', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxesIntersect(a, { x: 10, y: 10, width: 5, height: 5 })).toBe(true);
    expect(boxesIntersect(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });
});
