import type { CurvePoint, CurvesState, FilterState } from '../state/editState';

/**
 * Built-in filter looks. Each is a colour matrix and/or tone curves — no bitmaps, so they're tiny,
 * resolution-independent and stored in full inside `EditState.filter`.
 */
export interface FilterPreset {
  id: string;
  name: string;
  category: FilterCategory;
  matrix?: number[];
  curves?: Partial<CurvesState>;
}

export type FilterCategory = 'color' | 'film' | 'mono';

/** Row-major 3×4 matrix: [r-row (r g b offset), g-row, b-row]. */
type Matrix = number[];

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** `combine(a, b)` applies `b` first, then `a`. */
function combine(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += a[r * 4 + k]! * b[k * 4 + c]!;
      if (c === 3) v += a[r * 4 + 3]!;
      out.push(Number(v.toFixed(5)));
    }
  }
  return out;
}

function chain(...matrices: Matrix[]): Matrix {
  return matrices.reduce((acc, m) => combine(m, acc), IDENTITY);
}

function saturate(s: number): Matrix {
  const i = 1 - s;
  return [
    LR * i + s,
    LG * i,
    LB * i,
    0,
    LR * i,
    LG * i + s,
    LB * i,
    0,
    LR * i,
    LG * i,
    LB * i + s,
    0,
  ];
}

function shift(r: number, g: number, b: number): Matrix {
  return [1, 0, 0, r, 0, 1, 0, g, 0, 0, 1, b];
}

function gain(r: number, g: number, b: number): Matrix {
  return [r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0];
}

/** Maps luminance to a colour ramp from `dark` to `light` (duotone / monochrome). */
function tone(dark: [number, number, number], light: [number, number, number]): Matrix {
  const row = (d: number, l: number) => [LR * (l - d), LG * (l - d), LB * (l - d), d];
  return [...row(dark[0], light[0]), ...row(dark[1], light[1]), ...row(dark[2], light[2])];
}

const SEPIA: Matrix = [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0];

const curve = (...points: CurvePoint[]): CurvePoint[] => points;
const S_SOFT = curve([0, 0], [0.25, 0.22], [0.75, 0.79], [1, 1]);
const S_STRONG = curve([0, 0], [0.25, 0.17], [0.75, 0.84], [1, 1]);
const S_HARD = curve([0, 0], [0.3, 0.12], [0.7, 0.9], [1, 1]);
const FADED = curve([0, 0.1], [0.5, 0.52], [1, 0.95]);
const MATTE = curve([0, 0.12], [0.25, 0.28], [0.75, 0.76], [1, 0.92]);

export const FILTER_PRESETS: readonly FilterPreset[] = [
  // Colour
  {
    id: 'vivid',
    name: 'Vivid',
    category: 'color',
    matrix: saturate(1.35),
    curves: { rgb: S_SOFT },
  },
  {
    id: 'punch',
    name: 'Punch',
    category: 'color',
    matrix: saturate(1.2),
    curves: { rgb: S_STRONG },
  },
  {
    id: 'chrome',
    name: 'Chrome',
    category: 'color',
    matrix: chain(saturate(1.15), shift(-0.01, 0, 0.02)),
    curves: { rgb: S_SOFT },
  },
  {
    id: 'warm',
    name: 'Warm',
    category: 'color',
    matrix: chain(shift(0.06, 0.02, -0.06), saturate(1.05)),
  },
  {
    id: 'cool',
    name: 'Cool',
    category: 'color',
    matrix: chain(shift(-0.05, 0.01, 0.07), saturate(0.95)),
  },
  {
    id: 'golden',
    name: 'Golden',
    category: 'color',
    matrix: chain(gain(1.08, 1.03, 0.9), shift(0.03, 0.02, -0.02)),
    curves: { rgb: S_SOFT },
  },
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    category: 'color',
    matrix: saturate(1.1),
    curves: {
      red: curve([0, 0], [0.25, 0.19], [0.75, 0.83], [1, 1]),
      blue: curve([0, 0.07], [0.25, 0.31], [0.75, 0.69], [1, 0.93]),
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    category: 'color',
    matrix: chain(saturate(0.7), shift(0.03, 0, 0.02)),
    curves: { rgb: FADED },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    category: 'color',
    matrix: chain(shift(0.04, -0.03, 0.08), saturate(0.9)),
    curves: { rgb: S_SOFT },
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    category: 'color',
    matrix: chain(shift(-0.04, 0.03, 0.05), saturate(1.1)),
  },
  {
    id: 'rose',
    name: 'Rose',
    category: 'color',
    matrix: shift(0.06, -0.02, 0.03),
    curves: { rgb: FADED },
  },
  {
    id: 'nordic',
    name: 'Nordic',
    category: 'color',
    matrix: chain(saturate(0.8), shift(-0.03, 0, 0.04)),
    curves: { rgb: MATTE },
  },

  // Film
  { id: 'fade', name: 'Fade', category: 'film', matrix: saturate(0.85), curves: { rgb: FADED } },
  { id: 'matte', name: 'Matte', category: 'film', curves: { rgb: MATTE } },
  {
    id: 'film',
    name: 'Film',
    category: 'film',
    matrix: saturate(0.95),
    curves: {
      rgb: curve([0, 0.06], [0.3, 0.27], [0.7, 0.76], [1, 0.96]),
      green: curve([0, 0.03], [1, 1]),
    },
  },
  {
    id: 'instant',
    name: 'Instant',
    category: 'film',
    matrix: [1.2, -0.05, -0.05, -0.02, -0.08, 1.15, -0.08, 0.03, -0.01, -0.01, 1.2, -0.02],
    curves: { rgb: FADED },
  },
  {
    id: 'retro',
    name: 'Retro',
    category: 'film',
    matrix: chain(saturate(0.75), gain(1.06, 1.0, 0.86)),
    curves: { rgb: MATTE },
  },
  {
    id: 'bleach',
    name: 'Bleach',
    category: 'film',
    matrix: saturate(0.5),
    curves: { rgb: S_STRONG },
  },
  { id: 'sepia', name: 'Sepia', category: 'film', matrix: SEPIA },
  {
    id: 'rust',
    name: 'Rust',
    category: 'film',
    matrix: chain(SEPIA, gain(1.08, 0.94, 0.85)),
    curves: { rgb: S_SOFT },
  },

  // Mono & duotone
  { id: 'mono', name: 'Mono', category: 'mono', matrix: saturate(0) },
  { id: 'noir', name: 'Noir', category: 'mono', matrix: saturate(0), curves: { rgb: S_HARD } },
  { id: 'silver', name: 'Silver', category: 'mono', matrix: saturate(0), curves: { rgb: MATTE } },
  {
    id: 'stark',
    name: 'Stark',
    category: 'mono',
    matrix: chain(saturate(0), gain(1.1, 1.1, 1.1)),
    curves: { rgb: curve([0, 0], [0.4, 0.08], [0.6, 0.94], [1, 1]) },
  },
  {
    id: 'cyanotype',
    name: 'Cyanotype',
    category: 'mono',
    matrix: tone([0.02, 0.1, 0.25], [0.8, 0.92, 1]),
  },
  { id: 'plum', name: 'Plum', category: 'mono', matrix: tone([0.2, 0.05, 0.2], [1, 0.9, 0.96]) },
  {
    id: 'emerald',
    name: 'Emerald',
    category: 'mono',
    matrix: tone([0.02, 0.18, 0.12], [0.88, 1, 0.9]),
  },
  {
    id: 'amber',
    name: 'Amber',
    category: 'mono',
    matrix: tone([0.2, 0.08, 0.02], [1, 0.93, 0.78]),
  },
];

/** Turns a preset into the self-contained `EditState.filter` value. */
export function filterFromPreset(preset: FilterPreset, intensity = 1): FilterState {
  const filter: FilterState = { id: preset.id, name: preset.name, intensity };
  if (preset.matrix) filter.matrix = [...preset.matrix];
  if (preset.curves) {
    filter.curves = Object.fromEntries(
      Object.entries(preset.curves).map(([k, v]) => [k, v.map((p) => [p[0], p[1]])]),
    ) as Partial<CurvesState>;
  }
  return filter;
}
