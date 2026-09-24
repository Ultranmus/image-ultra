import type { FontOption } from './context';

/** Default text fonts: system stacks only, so they render without downloads on every OS. */
export const DEFAULT_FONTS: readonly FontOption[] = [
  {
    label: 'Sans',
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  { label: 'Serif', family: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
  { label: 'Mono', family: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  {
    label: 'Rounded',
    family: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
  },
  { label: 'Hand', family: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive" },
];
