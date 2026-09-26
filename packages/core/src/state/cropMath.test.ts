import { describe, expect, it } from 'vitest';
import { createGeometryState, type GeometryState, type Rect } from './editState';
import {
  cropFits,
  cropForAspect,
  fitCrop,
  flipGeometry,
  moveCrop,
  resizeCrop,
  rotateGeometry,
  zoomCrop,
} from './cropMath';
import { getCropRect, getSourceToOriented, mat3Apply } from './geometry';

const image = { width: 400, height: 300 };
const geo = (patch: Partial<GeometryState> = {}): GeometryState => ({
  ...createGeometryState(),
  ...patch,
});

/** Where a source pixel appears in the cropped result. */
function toResult(g: GeometryState, p: { x: number; y: number }) {
  const o = mat3Apply(getSourceToOriented(image, g), p);
  const crop = getCropRect(image, g);
  return { x: o.x - crop.x, y: o.y - crop.y, w: crop.width, h: crop.height };
}

const samples = [
  { x: 10, y: 20 },
  { x: 390, y: 15 },
  { x: 200, y: 150 },
  { x: 50, y: 280 },
];
const tricky = geo({
  flipX: true,
  straighten: 8,
  perspective: { x: 0.3, y: -0.2 },
  crop: { x: 90, y: 70, width: 200, height: 150 },
  cropAspect: 4 / 3,
});

describe('rotate / flip keep the result visually consistent', () => {
  for (const [name, start] of [
    ['plain', geo()],
    ['flipped, straightened, tilted, cropped', tricky],
  ] as const) {
    it(`rotating clockwise turns the result 90° (${name})`, () => {
      const next = rotateGeometry(image, start, 1);
      for (const p of samples) {
        const a = toResult(start, p);
        const b = toResult(next, p);
        expect(b.x).toBeCloseTo(a.h - a.y, 6);
        expect(b.y).toBeCloseTo(a.x, 6);
      }
    });

    it(`rotating counter-clockwise turns the result −90° (${name})`, () => {
      const next = rotateGeometry(image, start, -1);
      for (const p of samples) {
        const a = toResult(start, p);
        const b = toResult(next, p);
        expect(b.x).toBeCloseTo(a.y, 6);
        expect(b.y).toBeCloseTo(a.w - a.x, 6);
      }
    });

    it(`flipping mirrors the result (${name})`, () => {
      const x = flipGeometry(image, start, 'x');
      const y = flipGeometry(image, start, 'y');
      for (const p of samples) {
        const a = toResult(start, p);
        expect(toResult(x, p).x).toBeCloseTo(a.w - a.x, 6);
        expect(toResult(x, p).y).toBeCloseTo(a.y, 6);
        expect(toResult(y, p).x).toBeCloseTo(a.x, 6);
        expect(toResult(y, p).y).toBeCloseTo(a.h - a.y, 6);
      }
    });
  }

  it('four clockwise turns return to the start', () => {
    let g = tricky;
    for (let i = 0; i < 4; i++) g = rotateGeometry(image, g, 1);
    expect(g.rotation).toBe(tricky.rotation);
    expect(g.crop!.x).toBeCloseTo(tricky.crop!.x, 6);
    expect(g.perspective.x).toBeCloseTo(tricky.perspective.x, 6);
    expect(g.cropAspect).toBeCloseTo(tricky.cropAspect!, 6);
  });
});

describe('crop fitting', () => {
  const full: Rect = { x: 0, y: 0, width: 400, height: 300 };

  it('the full frame fits until the image is straightened', () => {
    expect(cropFits(image, geo(), full)).toBe(true);
    expect(cropFits(image, geo({ straighten: 10 }), full)).toBe(false);
  });

  it('fitCrop shrinks around the same centre and aspect', () => {
    const g = geo({ straighten: 10, perspective: { x: 0.2, y: 0 } });
    const r = fitCrop(image, g, full);
    expect(cropFits(image, g, r)).toBe(true);
    expect(r.width / r.height).toBeCloseTo(4 / 3, 3);
    expect(r.width).toBeGreaterThan(250);
    expect(r.x + r.width / 2).toBeCloseTo(200, 0);
  });

  it('moveCrop stops at the edge and slides along it', () => {
    const start = { x: 100, y: 100, width: 100, height: 100 };
    const moved = moveCrop(image, geo(), start, 500, 20);
    expect(moved.x).toBeCloseTo(300, 1);
    expect(moved.y).toBeCloseTo(120, 1);
  });

  it('resizeCrop keeps the aspect ratio and stays on the image', () => {
    const start = { x: 100, y: 100, width: 100, height: 100 };
    const r = resizeCrop(image, geo(), start, 'se', 400, 50, 1, 20);
    expect(r.width).toBeCloseTo(r.height, 6);
    expect(r.x).toBe(100);
    expect(cropFits(image, geo(), r)).toBe(true);
    expect(r.width).toBeCloseTo(200, 0); // limited by the bottom edge
  });

  it('resizeCrop respects the minimum size', () => {
    const start = { x: 100, y: 100, width: 100, height: 100 };
    const r = resizeCrop(image, geo(), start, 'w', 500, 0, null, 30);
    expect(r.width).toBe(30);
  });

  it('cropForAspect finds the largest square', () => {
    const r = cropForAspect(image, geo(), 1);
    expect(r.width).toBeCloseTo(300, 1);
    expect(r.height).toBeCloseTo(300, 1);
  });
});

describe('zoomCrop', () => {
  const full: Rect = { x: 0, y: 0, width: 400, height: 300 };

  it('zooming in shrinks the crop and keeps the point under the pointer', () => {
    const anchor = { x: 100, y: 75 };
    const r = zoomCrop(image, geo(), full, anchor, 2);
    expect(r).toEqual({ x: 50, y: 37.5, width: 200, height: 150 });
    // The anchor sits at the same relative spot (25%, 25%) in the new crop.
    expect((anchor.x - r.x) / r.width).toBeCloseTo(0.25);
  });

  it('stops at the minimum size', () => {
    const r = zoomCrop(image, geo(), full, { x: 200, y: 150 }, 1000, 30);
    expect(Math.min(r.width, r.height)).toBeCloseTo(30);
  });

  it('zooming out never goes past the image, and slides in from an edge', () => {
    const small: Rect = { x: 0, y: 0, width: 100, height: 75 };
    const r = zoomCrop(image, geo(), small, { x: 0, y: 0 }, 0.5);
    expect(cropFits(image, geo(), r)).toBe(true);
    expect(r.width).toBeCloseTo(200);
    expect(r.width / r.height).toBeCloseTo(4 / 3);
    const out = zoomCrop(image, geo(), full, { x: 200, y: 150 }, 0.5);
    expect(cropFits(image, geo(), out)).toBe(true);
    expect(out.width).toBeCloseTo(400, 0);
  });
});
