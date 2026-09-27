import type { CSSProperties } from 'react';

/** `dark` (default), `light`, or `auto` to follow the OS setting. */
export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * Typed shortcuts for the most common CSS variables. Anything else can be overridden in CSS:
 * `.iu-root { --iu-surface-1: #000; }` — see docs/internal/THEMING.md for the full token list.
 */
export interface ThemeOverrides {
  accent?: string;
  accentHover?: string;
  accentContrast?: string;
  /** Accent-coloured text and icons on surfaces (e.g. selected tool label). Defaults to `accent`. */
  accentText?: string;
  bg?: string;
  stage?: string;
  surface1?: string;
  surface2?: string;
  surface3?: string;
  text?: string;
  textMuted?: string;
  border?: string;
  fontFamily?: string;
  /** Base control radius, e.g. `'10px'`. Small and large radii scale from it. */
  radius?: string;
}

const TOKEN_BY_KEY: Record<keyof ThemeOverrides, string> = {
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

export function themeOverridesToStyle(overrides: ThemeOverrides | undefined): CSSProperties {
  const style: Record<string, string> = {};
  if (!overrides) return style;
  for (const key of Object.keys(overrides) as (keyof ThemeOverrides)[]) {
    const value = overrides[key];
    if (value) style[TOKEN_BY_KEY[key]] = value;
  }
  if (overrides.accent && !overrides.accentHover) {
    style['--iu-accent-hover'] = `color-mix(in oklab, ${overrides.accent} 85%, white)`;
  }
  if (overrides.accent && !overrides.accentText) {
    style['--iu-accent-text'] = overrides.accent;
  }
  if (overrides.accent) {
    style['--iu-accent-soft'] = `color-mix(in oklab, ${overrides.accent} 18%, transparent)`;
  }
  return style;
}
