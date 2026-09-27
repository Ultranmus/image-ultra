/** Built-in output sizes for the Resize tool (data only, so the labels can list their names). */
export interface SizePreset {
  id: string;
  /** Chip text. */
  label: string;
  width: number;
  height: number;
}

/**
 * Common social/web sizes. Picking one crops to its aspect ratio (as large as possible) and
 * resizes to exactly this size.
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'ig-square', label: 'Instagram 1:1', width: 1080, height: 1080 },
  { id: 'ig-portrait', label: 'Instagram 4:5', width: 1080, height: 1350 },
  { id: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  { id: 'youtube', label: 'YouTube thumbnail', width: 1280, height: 720 },
  { id: 'og', label: 'Link preview (OG)', width: 1200, height: 630 },
  { id: 'x-post', label: 'X post', width: 1600, height: 900 },
  { id: 'linkedin', label: 'LinkedIn post', width: 1200, height: 627 },
  { id: 'fb-cover', label: 'Facebook cover', width: 820, height: 312 },
];
