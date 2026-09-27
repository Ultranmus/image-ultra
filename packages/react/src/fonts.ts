import type { FontOption } from './context';
import type { Labels } from './i18n';

/** Default text fonts: system stacks only, so they render without downloads on every OS. */
export const DEFAULT_FONTS: readonly (FontOption & { id: keyof Labels['fontNames'] })[] = [
  {
    id: 'sans',
    label: 'Sans',
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  { id: 'serif', label: 'Serif', family: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', family: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  {
    id: 'rounded',
    label: 'Rounded',
    family: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
  },
  { id: 'hand', label: 'Hand', family: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive" },
];

/** The default fonts with their names from the labels (translated). */
export function defaultFonts(labels: Labels): FontOption[] {
  return DEFAULT_FONTS.map((font) => ({ label: labels.fontNames[font.id], family: font.family }));
}
