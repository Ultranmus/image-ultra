import { useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_FRAME_COLOR,
  DEFAULT_FRAME_SIZE,
  FRAME_STYLES,
  drawFrame,
  type EditState,
  type FrameState,
  type FrameStyle,
  type ThumbnailRenderer,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, useToolState } from '../../context';
import { Popover } from '../../controls/Popover';
import { PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import { useThumbnailRenderer } from '../../hooks/useThumbnailRenderer';
import { undoStep } from '../../controls/undoStep';

const NONE = 'none';
type FrameChoice = FrameStyle | typeof NONE;
/** Thumbnail edge in CSS px (same as the Filter strip). */
const THUMB = 52;

/** Remembered between frames: switching style keeps the size and colour. */
interface FrameUi {
  size: number;
  color: string;
}

/** ControlBar for the Frame tool: style thumbnails, then size and colour (UI_VISION §5b). */
export function FrameControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const frame = edit.frame;
  const [ui, setUi] = useToolState<FrameUi>({
    size: DEFAULT_FRAME_SIZE,
    color: DEFAULT_FRAME_COLOR,
  });
  const renderer = useThumbnailRenderer(image);
  const size = frame?.size ?? ui.size;
  const color = frame?.color ?? ui.color;

  // Thumbnails show the photo as it is now (crop and look), without the frame.
  const geometry = edit.geometry;
  const look = edit.filter;
  const base = useMemo<EditState>(
    () => ({ ...edit, frame: null, annotations: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only crop and look change the photo
    [geometry, look],
  );

  const select = (choice: FrameChoice) =>
    store
      .getState()
      .update(choice === NONE ? labels.frameNone : labels.frameStyles[choice], (draft) => {
        draft.frame = choice === NONE ? null : { style: choice, size, color };
      });

  const change = (label: string, patch: Partial<FrameState>) => {
    setUi((u) => ({ ...u, ...patch }));
    store.getState().update(label, (draft) => {
      if (draft.frame) Object.assign(draft.frame, patch);
    });
  };

  const thumb = (choice: FrameChoice) => (
    <FrameThumbnail
      renderer={renderer}
      state={base}
      // Thicker than real so thin styles read at thumbnail size.
      frame={choice === NONE ? null : { style: choice, size: Math.max(size, 0.07), color }}
    />
  );
  const presets: Preset<FrameChoice>[] = [
    { value: NONE, label: labels.frameNone, glyph: thumb(NONE) },
    ...FRAME_STYLES.map((style) => ({
      value: style,
      label: labels.frameStyles[style],
      glyph: thumb(style),
    })),
  ];

  return (
    <div className="iu-filter">
      <div className="iu-inspector iu-row-centered">
        {frame && (
          <>
            <div className="iu-rulerfield">
              <RulerSlider
                label={labels.frameSize}
                value={Math.round(size * 100)}
                min={1}
                max={15}
                unitWidth={10}
                majorEvery={5}
                defaultValue={4}
                format={(v) => `${v}%`}
                {...undoStep(store, labels.frameSize)}
                onChange={(v) => change(labels.frameSize, { size: v / 100 })}
              />
              <span className="iu-rulerfield__label" aria-hidden="true">
                {labels.frameSize}
              </span>
            </div>
            <Popover
              label={labels.frameColor}
              trigger={<ColorButton swatch={color} label={labels.frameColor} />}
            >
              <SwatchPicker
                value={color}
                onChange={(v) => v && change(labels.frameColor, { color: v })}
              />
            </Popover>
          </>
        )}
      </div>
      <PresetStrip
        variant="thumbs"
        label={labels.frames}
        presets={presets}
        value={frame?.style ?? NONE}
        onSelect={select}
      />
    </div>
  );
}

/** The current photo with one frame style drawn over it. */
function FrameThumbnail({
  renderer,
  state,
  frame,
}: {
  renderer: ThumbnailRenderer | null;
  state: EditState;
  frame: FrameState | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!renderer || !el) return;
    const px = Math.round(THUMB * Math.min(2, window.devicePixelRatio || 1));
    renderer.render(state, el, px);
    const ctx = el.getContext('2d');
    if (ctx && frame) drawFrame(ctx, frame, { width: px, height: px });
  }, [renderer, state, frame?.style, frame?.size, frame?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={canvas} className="iu-thumb" aria-hidden="true" />;
}
