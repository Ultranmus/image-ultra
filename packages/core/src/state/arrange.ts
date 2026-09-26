import type { Point } from '../types';
import {
  boxCenter,
  getShapeBounds,
  getShapeBox,
  moveShape,
  normalizeDegrees,
  rotatePoint,
  type Box,
  type Shape,
  type TextShape,
} from './annotations';

/*
 * Working with several shapes at once (DECISIONS #81): group bounds, moving / scaling / rotating a
 * group as one, align and distribute. Pure functions over shapes in oriented space. Text boxes need
 * their wrapped height, which only the renderer can measure — pass `textHeight` for accuracy.
 */

export type TextHeight = (shape: TextShape) => number | undefined;

const heightOf = (shape: Shape, textHeight?: TextHeight) =>
  shape.type === 'text' ? textHeight?.(shape) : undefined;

/** Axis-aligned box around all (rotated) shapes, or `null` for none. */
export function groupBounds(shapes: readonly Shape[], textHeight?: TextHeight): Box | null {
  if (shapes.length === 0) return null;
  const boxes = shapes.map((s) => getShapeBounds(s, heightOf(s, textHeight)));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Moves the shape's points with `map` and scales its sizes (box, stroke, font, corner radius) by
 * `k`. `map` must be a uniform scale + move (no rotation): the shape keeps its own rotation.
 */
export function transformShape(shape: Shape, map: (p: Point) => Point, k: number): Shape {
  switch (shape.type) {
    case 'line':
      return {
        ...shape,
        points: [map(shape.points[0]), map(shape.points[1])],
        strokeWidth: shape.strokeWidth * k,
      };
    case 'path':
      return { ...shape, points: shape.points.map(map), strokeWidth: shape.strokeWidth * k };
    case 'text': {
      const p = map({ x: shape.x, y: shape.y });
      return { ...shape, ...p, width: shape.width * k, fontSize: shape.fontSize * k };
    }
    case 'rect': {
      const p = map({ x: shape.x, y: shape.y });
      return {
        ...shape,
        ...p,
        width: shape.width * k,
        height: shape.height * k,
        strokeWidth: shape.strokeWidth * k,
        cornerRadius: shape.cornerRadius * k,
      };
    }
    case 'ellipse': {
      const p = map({ x: shape.x, y: shape.y });
      return {
        ...shape,
        ...p,
        width: shape.width * k,
        height: shape.height * k,
        strokeWidth: shape.strokeWidth * k,
      };
    }
    case 'image': {
      const p = map({ x: shape.x, y: shape.y });
      return { ...shape, ...p, width: shape.width * k, height: shape.height * k };
    }
    case 'redact': {
      if (shape.kind === 'brush')
        return { ...shape, points: shape.points.map(map), size: shape.size * k };
      const p = map({ x: shape.x, y: shape.y });
      return { ...shape, ...p, width: shape.width * k, height: shape.height * k };
    }
    case 'watermark':
      // Moved and sized by the editor through `EditState.watermark`.
      return shape;
  }
}

/** Scales every shape by `k` around `origin` (a group resize from a corner). */
export function scaleShapes(shapes: readonly Shape[], origin: Point, k: number): Shape[] {
  const map = (p: Point) => ({
    x: origin.x + (p.x - origin.x) * k,
    y: origin.y + (p.y - origin.y) * k,
  });
  return shapes.map((s) => transformShape(s, map, k));
}

/**
 * Turns every shape `degrees` clockwise around `center` (a group rotation): lines and paths turn
 * their points, box shapes move their centre and add to their own rotation.
 */
export function rotateShapes(
  shapes: readonly Shape[],
  center: Point,
  degrees: number,
  textHeight?: TextHeight,
): Shape[] {
  return shapes.map((shape) => {
    if (shape.type === 'line') {
      return {
        ...shape,
        points: shape.points.map((p) => rotatePoint(p, center, degrees)) as [Point, Point],
      };
    }
    if (shape.type === 'watermark') return shape;
    if (shape.type === 'path' || (shape.type === 'redact' && shape.kind === 'brush')) {
      return { ...shape, points: shape.points.map((p) => rotatePoint(p, center, degrees)) };
    }
    const box = getShapeBox(shape, heightOf(shape, textHeight));
    const c = boxCenter(box);
    const next = rotatePoint(c, center, degrees);
    return {
      ...moveShape(shape, next.x - c.x, next.y - c.y),
      rotation: normalizeDegrees(shape.rotation + degrees),
    };
  });
}

export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/**
 * Lines the shapes up on one edge (or centre) of `target` — the group's bounds, or the photo for a
 * single shape. Returns the moved shapes, same order.
 */
export function alignShapes(
  shapes: readonly Shape[],
  edge: AlignEdge,
  target: Box,
  textHeight?: TextHeight,
): Shape[] {
  return shapes.map((shape) => {
    const b = getShapeBounds(shape, heightOf(shape, textHeight));
    switch (edge) {
      case 'left':
        return moveShape(shape, target.x - b.x, 0);
      case 'centerX':
        return moveShape(shape, target.x + target.width / 2 - (b.x + b.width / 2), 0);
      case 'right':
        return moveShape(shape, target.x + target.width - (b.x + b.width), 0);
      case 'top':
        return moveShape(shape, 0, target.y - b.y);
      case 'centerY':
        return moveShape(shape, 0, target.y + target.height / 2 - (b.y + b.height / 2));
      case 'bottom':
        return moveShape(shape, 0, target.y + target.height - (b.y + b.height));
    }
  });
}

/**
 * Equal gaps between the shapes along `axis` (3+ shapes; fewer are returned unchanged). The first
 * and last shape stay put; the others keep their order. Returns the shapes in the input order.
 */
export function distributeShapes(
  shapes: readonly Shape[],
  axis: 'x' | 'y',
  textHeight?: TextHeight,
): Shape[] {
  if (shapes.length < 3) return [...shapes];
  const items = shapes.map((shape, index) => {
    const b = getShapeBounds(shape, heightOf(shape, textHeight));
    return {
      index,
      start: axis === 'x' ? b.x : b.y,
      size: axis === 'x' ? b.width : b.height,
    };
  });
  const sorted = [...items].sort((a, b) => a.start + a.size / 2 - (b.start + b.size / 2));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = last.start + last.size - first.start;
  const total = sorted.reduce((sum, i) => sum + i.size, 0);
  const gap = (span - total) / (sorted.length - 1);
  const result = [...shapes];
  let cursor = first.start;
  for (const item of sorted) {
    const d = cursor - item.start;
    result[item.index] = moveShape(shapes[item.index]!, axis === 'x' ? d : 0, axis === 'y' ? d : 0);
    cursor += item.size + gap;
  }
  return result;
}

/** Do two boxes overlap (touching counts)? For marquee selection. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}
