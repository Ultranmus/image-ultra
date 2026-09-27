'use client';

import { useMemo, useState } from 'react';
import { ImageEditor, type ThemeOverrides } from '@image-ultra/react';

type Mode = 'dark' | 'light';
type ColorKey =
  | 'accent'
  | 'accentText'
  | 'bg'
  | 'stage'
  | 'surface1'
  | 'surface2'
  | 'surface3'
  | 'text'
  | 'textMuted';

/** The editor's defaults (THEMING.md), to start the pickers from. */
const DEFAULTS: Record<Mode, Record<ColorKey, string>> = {
  dark: {
    accent: '#9c479c',
    accentText: '#d08bd0',
    bg: '#0b0b0d',
    stage: '#060607',
    surface1: '#131316',
    surface2: '#1c1c21',
    surface3: '#26262d',
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
  },
  light: {
    accent: '#4d194d',
    accentText: '#4d194d',
    bg: '#f4f4f6',
    stage: '#e9e9ed',
    surface1: '#ffffff',
    surface2: '#f1f1f4',
    surface3: '#e4e4ea',
    text: '#18181b',
    textMuted: '#5b5b66',
  },
};

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Accent text' },
  { key: 'bg', label: 'Background' },
  { key: 'stage', label: 'Behind the photo' },
  { key: 'surface1', label: 'Bars' },
  { key: 'surface2', label: 'Inputs, hover' },
  { key: 'surface3', label: 'Pressed, popovers' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
];

/** `ThemeOverrides` key → CSS variable (the same map the editor uses). */
const TOKEN: Record<keyof ThemeOverrides, string> = {
  accent: '--iu-accent',
  accentHover: '--iu-accent-hover',
  accentContrast: '--iu-accent-contrast',
  accentText: '--iu-accent-text',
  bg: '--iu-bg',
  stage: '--iu-stage',
  surface1: '--iu-surface-1',
  surface2: '--iu-surface-2',
  surface3: '--iu-surface-3',
  text: '--iu-text',
  textMuted: '--iu-text-muted',
  border: '--iu-border',
  fontFamily: '--iu-font-family',
  radius: '--iu-radius-md',
};

const FONTS = [
  { label: 'Your page’s font', value: '' },
  { label: 'System sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: "ui-serif, Georgia, 'Times New Roman', serif" },
  { label: 'Rounded', value: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

const QUICK_ACCENTS = ['#9c479c', '#2563eb', '#0e7490', '#16a34a', '#ea580c', '#e11d48'];

export function ThemePlayground() {
  const [mode, setMode] = useState<Mode>('dark');
  const [colors, setColors] = useState<Partial<Record<ColorKey, string>>>({});
  const [radius, setRadius] = useState(8);
  const [font, setFont] = useState('');
  const [output, setOutput] = useState<'props' | 'css'>('props');
  const [copied, setCopied] = useState(false);

  const value = (key: ColorKey) => colors[key] ?? DEFAULTS[mode][key];
  const overrides = useMemo<ThemeOverrides>(
    () => ({
      ...colors,
      ...(radius !== 8 && { radius: `${radius}px` }),
      ...(font && { fontFamily: font }),
    }),
    [colors, radius, font],
  );

  const code =
    output === 'props'
      ? `<ImageEditor\n  theme="${mode}"\n  themeOverrides={${formatObject(overrides)}}\n/>`
      : `.iu-root[data-iu-theme='${mode}'] {\n${Object.entries(overrides)
          .map(([k, v]) => `  ${TOKEN[k as keyof ThemeOverrides]}: ${v};`)
          .join('\n')}\n}`;

  const buttonContrast = contrast('#ffffff', value('accent'));
  const textContrast = contrast(value('text'), value('surface1'));
  const mutedContrast = contrast(value('textMuted'), value('surface1'));

  return (
    <div className="playground__grid">
      <form className="playground__panel" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Mode</legend>
          <div className="segmented">
            {(['dark', 'light'] as const).map((m) => (
              <label key={m}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === m}
                  onChange={() => {
                    setMode(m);
                    setColors({});
                  }}
                />
                {m === 'dark' ? 'Dark' : 'Light'}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Accent</legend>
          <div className="swatches">
            {QUICK_ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                style={{ background: c }}
                aria-label={`Accent ${c}`}
                aria-pressed={value('accent') === c}
                onClick={() => setColors((prev) => ({ ...prev, accent: c, accentText: c }))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Colours</legend>
          {COLOR_FIELDS.map(({ key, label }) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                type="color"
                value={value(key)}
                onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
          <button type="button" className="link" onClick={() => setColors({})}>
            Reset colours
          </button>
        </fieldset>

        <fieldset>
          <legend>Shape and type</legend>
          <label className="field">
            <span>Corner radius · {radius}px</span>
            <input
              type="range"
              min={0}
              max={20}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Font</span>
            <select value={font} onChange={(e) => setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Contrast (WCAG AA needs 4.5)</legend>
          <Ratio label="Button text on accent" value={buttonContrast} />
          <Ratio label="Text on bars" value={textContrast} />
          <Ratio label="Muted text on bars" value={mutedContrast} />
        </fieldset>
      </form>

      <div className="playground__preview">
        <div className="demo playground__editor">
          <ImageEditor
            src="/sample.jpg"
            theme={mode}
            themeOverrides={overrides}
            defaultTool="finetune"
          />
        </div>
        <div className="playground__code">
          <div className="segmented" role="radiogroup" aria-label="Copy as">
            {(['props', 'css'] as const).map((o) => (
              <label key={o}>
                <input
                  type="radio"
                  name="output"
                  checked={output === o}
                  onChange={() => setOutput(o)}
                />
                {o === 'props' ? 'Props' : 'CSS'}
              </label>
            ))}
          </div>
          <pre>
            <code data-testid="theme-code">{code}</code>
          </pre>
          <button
            type="button"
            className="button"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Ratio({ label, value }: { label: string; value: number }) {
  const ok = value >= 4.5;
  return (
    <p className="ratio">
      <span>{label}</span>
      <strong data-ok={ok}>
        {value.toFixed(1)} {ok ? '✓' : '— too low'}
      </strong>
    </p>
  );
}

function formatObject(o: ThemeOverrides): string {
  const entries = Object.entries(o);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `    ${k}: '${String(v).replace(/'/g, "\\'")}',`).join('\n')}\n  }`;
}

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
