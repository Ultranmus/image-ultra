import { describe, expect, it } from 'vitest';
import {
  createEditState,
  createGeometryState,
  type EditState,
  type GeometryState,
} from './editState';
import {
  applyToPoint,
  compose,
  getOutputSize,
  getOutputToSource,
  getSourceToOriented,
  invert,
  mat3Apply,
  mat3Compose,
  mat3Invert,
  rotate,
} from './geometry';

const image = { width: 400, height: 200 };
const edit = (geometry: Partial<GeometryState>, rest: Partial<EditState> = {}): EditState => ({
  ...createEditState(),
  ...rest,
  geometry: { ...createGeometryState(), ...geometry },
});
const near = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('geometry', () => {
  it('identity maps output pixels 1:1 to source pixels', () => {
    near(mat3Apply(getOutputToSource(image, edit({})), { x: 10, y: 20 }), 10, 20);
  });

  it('rotating 90° clockwise swaps the size and moves the bottom-left corner to the top-left', () => {
    const state = edit({ rotation: 90 });
    expect(getOutputSize(image, state)).toEqual({ width: 200, height: 400 });
    near(mat3Apply(getOutputToSource(image, state), { x: 0, y: 0 }), 0, 200);
  });

  it('flipX mirrors horizontally', () => {
    near(mat3Apply(getOutputToSource(image, edit({ flipX: true })), { x: 0, y: 0 }), 400, 0);
  });

  it('crop offsets into the oriented image and export scale divides through', () => {
    const state = edit({ crop: { x: 100, y: 50, width: 200, height: 100 } });
    expect(getOutputSize(image, state)).toEqual({ width: 200, height: 100 });
    near(mat3Apply(getOutputToSource(image, state, 0.5), { x: 50, y: 25 }), 200, 100);
  });

  it('resize stretches the crop to the target size', () => {
    const state = edit({}, { resize: { width: 100, height: 100 } });
    expect(getOutputSize(image, state)).toEqual({ width: 100, height: 100 });
    near(mat3Apply(getOutputToSource(image, state), { x: 100, y: 100 }), 400, 200);
  });

  it('straighten and perspective keep the centre fixed', () => {
    const state = edit({ straighten: 30, perspective: { x: 0.4, y: -0.6 } });
    near(mat3Apply(getSourceToOriented(image, state.geometry), { x: 200, y: 100 }), 200, 100);
  });

  it('perspective makes the far edge shorter', () => {
    const m = getSourceToOriented(image, edit({ perspective: { x: 0, y: 0.5 } }).geometry);
    const top = mat3Apply(m, { x: 400, y: 0 }).x - mat3Apply(m, { x: 0, y: 0 }).x;
    const bottom = mat3Apply(m, { x: 400, y: 200 }).x - mat3Apply(m, { x: 0, y: 200 }).x;
    expect(Math.abs(top - bottom)).toBeGreaterThan(10);
  });

  it('inverts affine and projective transforms', () => {
    const m = compose(rotate(33), [2, 0, 0, 3, 5, 7]);
    near(applyToPoint(compose(invert(m), m), { x: 3, y: 4 }), 3, 4);
    const p = getSourceToOriented(image, edit({ perspective: { x: 0.3, y: 0.2 } }).geometry);
    near(mat3Apply(mat3Compose(mat3Invert(p), p), { x: 37, y: 91 }), 37, 91);
  });
});
