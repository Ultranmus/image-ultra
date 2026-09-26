import { useState } from 'react';
import {
  cropForAspect,
  getCanvasSize,
  getOutputSize,
  MAX_OUTPUT_SIDE,
  type CanvasState,
  type EditState,
  type LoadedImage,
  type WatermarkPosition,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, useToolState } from '../../context';
import { IconButton } from '../../components/IconButton';
import { NumberField } from '../../controls/NumberField';
import { Popover } from '../../controls/Popover';
import { AspectGlyph, PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { IconLink, IconPosition, IconReset, IconUnlink } from '../../icons/Icon';
import { undoStep } from '../../controls/undoStep';

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

type ResizeMode = 'size' | 'canvas';

/**
 * ControlBar for the Resize tool (UI_VISION §5): [Size | Canvas]. Size = exact width/height,
 * aspect lock and size presets. Canvas = space added around the photo (shape, padding, where the
 * photo sits) — DECISIONS #83.
 */
export function ResizeControls() {
  const labels = useLabels();
  const store = useEditorStore();
  const edit = useEditorState((s) => s.edit);
  const [mode, setMode] = useToolState<ResizeMode>('size');

  return (
    <div className="iu-resize">
      <div className="iu-adjust__row iu-resize__head">
        <span />
        <SegmentedControl
          label={labels.tools.resize}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'size', label: labels.resizeModeSize },
            { value: 'canvas', label: labels.resizeModeCanvas },
          ]}
        />
        <div className="iu-toolgroup iu-toolgroup--end">
          {mode === 'canvas' && (
            <IconButton
              label={labels.canvasReset}
              icon={<IconReset />}
              disabled={!edit.canvas}
              onClick={() => setCanvas(store, labels.canvasReset, null)}
            />
          )}
        </div>
      </div>
      {mode === 'size' ? <SizePanel /> : <CanvasPanel />}
    </div>
  );
}

/* ── Size ─────────────────────────────────────────────────────────────── */

function SizePanel() {
  const labels = useLabels();
  const store = useEditorStore();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const [locked, setLocked] = useState(true);
  if (!image) return null;

  // "Original" = the photo's crop plus any added canvas space, at 1:1.
  const crop = getCanvasSize(image, edit);
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
    <>
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
    </>
  );
}

/* ── Canvas (space around the photo) ──────────────────────────────────── */

const NO_CANVAS: CanvasState = { aspect: null, padding: 0, anchor: { x: 0.5, y: 0.5 } };

/** Canvas shapes, as width : height. `null` keeps the photo's own shape (padding only). */
const CANVAS_SHAPES: [id: string, aspect: number | null][] = [
  ['photo', null],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['5:4', 5 / 4],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
];

/** The 3×3 spots for the photo inside the added space. */
const ANCHORS: [WatermarkPosition, number, number][] = [
  ['top-left', 0, 0],
  ['top', 0.5, 0],
  ['top-right', 1, 0],
  ['left', 0, 0.5],
  ['center', 0.5, 0.5],
  ['right', 1, 0.5],
  ['bottom-left', 0, 1],
  ['bottom', 0.5, 1],
  ['bottom-right', 1, 1],
];

/**
 * Sets the added space as one undo step (`null` removes it). A custom output size keeps its scale,
 * so the result grows with the canvas instead of being stretched.
 */
function setCanvas(
  store: ReturnType<typeof useEditorStore>,
  label: string,
  next: CanvasState | null,
) {
  const image = store.getState().image;
  if (!image) return;
  store.getState().update(label, (draft) => {
    const before = getCanvasSize(image, draft);
    draft.canvas = next && (next.aspect !== null || next.padding > 0) ? next : null;
    if (draft.resize) {
      const after = getCanvasSize(image, draft);
      const k = draft.resize.width / before.width;
      draft.resize = {
        width: Math.min(MAX_OUTPUT_SIDE, Math.max(1, Math.round(after.width * k))),
        height: Math.min(MAX_OUTPUT_SIDE, Math.max(1, Math.round(after.height * k))),
      };
    }
  });
}

function CanvasPanel() {
  const labels = useLabels();
  const store = useEditorStore();
  const edit = useEditorState((s) => s.edit);
  const canvas = edit.canvas ?? NO_CANVAS;
  const change = (label: string, patch: Partial<CanvasState>) =>
    setCanvas(store, label, { ...canvas, ...patch });

  const shape =
    CANVAS_SHAPES.find(([, a]) =>
      a === null
        ? canvas.aspect === null
        : canvas.aspect !== null && Math.abs(a - canvas.aspect) < 1e-3,
    )?.[0] ?? null;

  return (
    <>
      <div className="iu-resize__row iu-resize__canvas">
        <div className="iu-resize__ruler">
          <RulerSlider
            label={labels.canvasPadding}
            value={Math.round(canvas.padding * 100)}
            min={0}
            max={50}
            tickEvery={1}
            majorEvery={10}
            defaultValue={0}
            format={(v) => `${v}%`}
            {...undoStep(store, labels.canvasPadding)}
            onChange={(v) => change(labels.canvasPadding, { padding: v / 100 })}
          />
        </div>
        <Popover
          label={labels.canvasAnchor}
          trigger={
            <IconButton
              label={labels.canvasAnchor}
              icon={<IconPosition />}
              disabled={canvas.aspect === null}
            />
          }
        >
          <div className="iu-watermark__grid" role="radiogroup" aria-label={labels.canvasAnchor}>
            {ANCHORS.map(([position, x, y]) => (
              <button
                key={position}
                type="button"
                role="radio"
                aria-checked={canvas.anchor.x === x && canvas.anchor.y === y}
                aria-label={labels.watermarkPositions[position]}
                className="iu-watermark__spot"
                onClick={() => change(labels.canvasAnchor, { anchor: { x, y } })}
              />
            ))}
          </div>
        </Popover>
      </div>
      <PresetStrip
        label={labels.canvasShape}
        value={shape}
        onSelect={(id) => {
          const aspect = CANVAS_SHAPES.find(([key]) => key === id)?.[1] ?? null;
          change(labels.canvasShape, { aspect });
        }}
        presets={CANVAS_SHAPES.map(([id, aspect]) => ({
          value: id,
          label: aspect === null ? labels.canvasOriginal : id,
          ...(aspect !== null && { glyph: <AspectGlyph aspect={aspect} /> }),
        }))}
      />
    </>
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
  // A size preset crops to its shape, so any added canvas space is dropped.
  update(preset.label, () => ({
    ...edit,
    geometry: { ...edit.geometry, crop, cropAspect: aspect, cropShape: 'rect' },
    canvas: null,
    resize: { width: preset.width, height: preset.height },
  }));
}
