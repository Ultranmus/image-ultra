import type { Point } from '../types';
import {
  WATERMARK_ELEMENT_ID,
  type LineCap,
  type Paint,
  type Shape,
  type TextAlign,
} from './annotations';
import { parseRedaction } from './redactions';

/** Validates untrusted annotation JSON; broken shapes are dropped, fields get defaults. */
export function parseAnnotations(input: unknown): Shape[] {
  if (!Array.isArray(input)) return [];
  const shapes: Shape[] = [];
  const seen = new Set<string>();
  for (const item of input.slice(0, 2000)) {
    const shape = parseShape(item);
    if (shape && !seen.has(shape.id)) {
      seen.add(shape.id);
      shapes.push(shape);
    }
  }
  return shapes;
}

function parseShape(input: unknown): Shape | null {
  if (!isRecord(input) || typeof input['id'] !== 'string') return null;
  const base = {
    id: input['id'],
    rotation: num(input['rotation'], 0, -360, 360),
    opacity: num(input['opacity'], 1, 0, 1),
    ...(typeof input['name'] === 'string' && { name: input['name'].slice(0, 80) }),
    ...(input['locked'] === true && { locked: true }),
    ...(input['hidden'] === true && { hidden: true }),
  };
  const box = () => {
    const x = finite(input['x']);
    const y = finite(input['y']);
    const width = finite(input['width']);
    const height = finite(input['height']);
    if (x === null || y === null || !width || !height || width < 0 || height < 0) return null;
    return { x, y, width, height };
  };
  const strokeWidth = num(input['strokeWidth'], 4, 0, 10000);
  switch (input['type']) {
    case 'rect': {
      const b = box();
      if (!b) return null;
      return {
        ...base,
        type: 'rect',
        ...b,
        fill: paint(input['fill']),
        stroke: paint(input['stroke']),
        strokeWidth,
        cornerRadius: num(input['cornerRadius'], 0, 0, 100000),
      };
    }
    case 'ellipse': {
      const b = box();
      if (!b) return null;
      return {
        ...base,
        type: 'ellipse',
        ...b,
        fill: paint(input['fill']),
        stroke: paint(input['stroke']),
        strokeWidth,
      };
    }
    case 'image': {
      const b = box();
      if (!b || typeof input['assetId'] !== 'string') return null;
      return { ...base, type: 'image', ...b, assetId: input['assetId'] };
    }
    case 'redact': {
      const r = parseRedaction(input);
      if (!r) return null;
      return {
        ...r,
        type: 'redact',
        opacity: base.opacity,
        ...(base.name !== undefined && { name: base.name }),
        ...(base.locked && { locked: true }),
        ...(base.hidden && { hidden: true }),
      };
    }
    case 'watermark':
      return { ...base, id: WATERMARK_ELEMENT_ID, type: 'watermark', rotation: 0, opacity: 1 };
    case 'line': {
      const pts = points(input['points']);
      if (!pts || pts.length !== 2) return null;
      return {
        ...base,
        type: 'line',
        points: [pts[0]!, pts[1]!],
        stroke: paint(input['stroke']) ?? '#000000',
        strokeWidth,
        startCap: cap(input['startCap']),
        endCap: cap(input['endCap']),
      };
    }
    case 'path': {
      const pts = points(input['points']);
      if (!pts || pts.length === 0) return null;
      return {
        ...base,
        type: 'path',
        points: pts.slice(0, 5000),
        closed: input['closed'] === true,
        smooth: input['smooth'] !== false,
        fill: paint(input['fill']),
        stroke: paint(input['stroke']),
        strokeWidth,
      };
    }
    case 'text': {
      const x = finite(input['x']);
      const y = finite(input['y']);
      const width = finite(input['width']);
      if (x === null || y === null || !width || width <= 0) return null;
      const align = input['align'];
      return {
        ...base,
        type: 'text',
        x,
        y,
        width,
        text: typeof input['text'] === 'string' ? input['text'].slice(0, 5000) : '',
        fontFamily:
          typeof input['fontFamily'] === 'string'
            ? input['fontFamily'].slice(0, 200)
            : 'sans-serif',
        fontSize: num(input['fontSize'], 32, 1, 10000),
        fontWeight: input['fontWeight'] === 700 ? 700 : 400,
        fontStyle: input['fontStyle'] === 'italic' ? 'italic' : 'normal',
        align: (['left', 'center', 'right'] as TextAlign[]).includes(align as TextAlign)
          ? (align as TextAlign)
          : 'left',
        lineHeight: num(input['lineHeight'], 1.25, 0.5, 4),
        color: paint(input['color']) ?? '#000000',
        background: paint(input['background']),
      };
    }
    default:
      return null;
  }
}

export function points(input: unknown): Point[] | null {
  if (!Array.isArray(input)) return null;
  const out: Point[] = [];
  for (const p of input) {
    if (!isRecord(p)) continue;
    const x = finite(p['x']);
    const y = finite(p['y']);
    if (x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

function cap(input: unknown): LineCap {
  return input === 'arrow' || input === 'circle' ? input : 'none';
}

/** Only plain colour strings are accepted (no `url(...)`, no expressions). */
export function paint(input: unknown): Paint {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(value)
    ? value
    : null;
}

export function num(input: unknown, fallback: number, min: number, max: number): number {
  const n = finite(input);
  return n === null ? fallback : Math.min(max, Math.max(min, n));
}

export function finite(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
