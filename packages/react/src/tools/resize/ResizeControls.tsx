import { useState } from 'react';
import {
  cropForAspect,
  getCropSize,
  getOutputSize,
  MAX_OUTPUT_SIDE,
  type EditState,
  type LoadedImage,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { NumberField } from '../../controls/NumberField';
import { AspectGlyph, PresetStrip, type Preset } from '../../controls/PresetStrip';
import { IconLink, IconUnlink } from '../../icons/Icon';

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

type Choice = 'original' | 'half' | string;

/** ControlBar for the Resize tool: exact width/height, aspect lock and size presets. */
export function ResizeControls() {
  const labels = useLabels();
  const store = useEditorStore();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const [locked, setLocked] = useState(true);
  if (!image) return null;

  const crop = getCropSize(image, edit.geometry);
  const output = getOutputSize(image, edit);
  const upscaled = output.width > crop.width + 1 || output.height > crop.height + 1;

  const setSize = (label: string, width: number, height: number) => {
    store.getState().update(label, (draft) => {
      draft.resize = width === crop.width && height === crop.height ? null : { width, height };
    });
  };

  const onWidth = (width: number) =>
    setSize(
      'Resize',
      width,
      locked ? Math.max(1, Math.round((width * crop.height) / crop.width)) : output.height,
    );
  const onHeight = (height: number) =>
    setSize(
      'Resize',
      locked ? Math.max(1, Math.round((height * crop.width) / crop.height)) : output.width,
      height,
    );

  const presets: Preset<Choice>[] = [
    {
      value: 'original',
      label: labels.originalSize,
      description: `${crop.width} × ${crop.height}`,
    },
    {
      value: 'half',
      label: '50%',
      description: `${Math.round(crop.width / 2)} × ${Math.round(crop.height / 2)}`,
    },
    ...SIZE_PRESETS.map((p) => ({
      value: p.id,
      label: p.label,
      description: `${p.width} × ${p.height}`,
      glyph: <AspectGlyph aspect={p.width / p.height} />,
    })),
  ];

  const selected = currentChoice(edit, crop);

  const onPreset = (choice: Choice) => {
    if (choice === 'original') return setSize('Resize', crop.width, crop.height);
    if (choice === 'half') {
      return setSize(
        'Resize',
        Math.max(1, Math.round(crop.width / 2)),
        Math.max(1, Math.round(crop.height / 2)),
      );
    }
    const preset = SIZE_PRESETS.find((p) => p.id === choice);
    if (preset) applySizePreset(store.getState().update, image, edit, preset);
  };

  return (
    <div className="iu-resize">
      <div className="iu-resize__row">
        <NumberField
          label={labels.width}
          value={output.width}
          min={1}
          max={MAX_OUTPUT_SIDE}
          unit="px"
          onChange={onWidth}
        />
        <IconButton
          label={labels.keepAspect}
          icon={locked ? <IconLink /> : <IconUnlink />}
          aria-pressed={locked}
          onClick={() => setLocked((v) => !v)}
        />
        <NumberField
          label={labels.height}
          value={output.height}
          min={1}
          max={MAX_OUTPUT_SIDE}
          unit="px"
          onChange={onHeight}
        />
        <p className="iu-resize__meta" data-warning={upscaled ? '' : undefined} aria-live="polite">
          {upscaled
            ? labels.upscaleWarning
            : `${labels.originalSize}: ${crop.width} × ${crop.height}`}
        </p>
      </div>
      <PresetStrip
        label={labels.sizePresets}
        presets={presets}
        value={selected}
        onSelect={onPreset}
      />
    </div>
  );
}

function currentChoice(edit: EditState, crop: { width: number; height: number }): Choice | null {
  const r = edit.resize;
  if (!r) return 'original';
  if (r.width === Math.round(crop.width / 2) && r.height === Math.round(crop.height / 2))
    return 'half';
  return SIZE_PRESETS.find((p) => p.width === r.width && p.height === r.height)?.id ?? null;
}

/** Crops to the preset's aspect ratio and resizes to its exact size — one undo step. */
function applySizePreset(
  update: (label: string, recipe: () => EditState) => void,
  image: LoadedImage,
  edit: EditState,
  preset: SizePreset,
) {
  const aspect = preset.width / preset.height;
  const crop = cropForAspect(image, edit.geometry, aspect);
  update(preset.label, () => ({
    ...edit,
    geometry: { ...edit.geometry, crop, cropAspect: aspect, cropShape: 'rect' },
    resize: { width: preset.width, height: preset.height },
  }));
}
