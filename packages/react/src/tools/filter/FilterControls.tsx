import { useEffect, useMemo, useRef } from 'react';
import {
  applyLook,
  filterFromPreset,
  lookMatches,
  type EditState,
  type ThumbnailRenderer,
} from '@image-ultra/core/internal';
import {
  useEditorState,
  useEditorStore,
  useFilterPresets,
  useLabels,
  useLooks,
} from '../../context';
import { PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { useThumbnailRenderer } from '../../hooks/useThumbnailRenderer';
import { IconBookmark } from '../../icons/Icon';
import { undoStep } from '../../controls/undoStep';

const NONE = 'none';
/** Thumbnail edge in CSS px. */
const THUMB = 52;

/** ControlBar for the Filter tool: live thumbnails, intensity, and the user's saved looks. */
export function FilterControls() {
  const labels = useLabels();
  const store = useEditorStore();
  const [looks, setLooks] = useLooks();
  const filterPresets = useFilterPresets();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const renderer = useThumbnailRenderer(image);

  // Thumbnails show what picking each one gives: a preset on top of the user's Finetune / Levels /
  // Curves edits (at full strength); a saved look replaces them.
  const { geometry, finetune, levels, curves } = edit;
  const base = useMemo<EditState>(
    () => ({ ...edit, filter: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these affect thumbnails
    [geometry, finetune, levels, curves],
  );
  const states = useMemo(
    () => ({
      [NONE]: base,
      ...Object.fromEntries(
        filterPresets.map((p) => [p.id, { ...base, filter: filterFromPreset(p) }]),
      ),
      ...Object.fromEntries(looks.map((l) => [l.id, applyLook(base, l)])),
    }),
    [base, looks, filterPresets],
  ) as Record<string, EditState>;

  const lookMatch = looks.find((l) => lookMatches(edit, l));
  const selected = lookMatch?.id ?? edit.filter?.id ?? NONE;

  const select = (id: string) => {
    const look = looks.find((l) => l.id === id);
    if (look) {
      store.getState().update(look.name, () => applyLook(store.getState().edit, look));
      return;
    }
    const preset = filterPresets.find((p) => p.id === id);
    const intensity = store.getState().edit.filter?.intensity ?? 1;
    store
      .getState()
      .update(
        preset ? (labels.filterNames[preset.id] ?? preset.name) : labels.filterNone,
        (draft) => {
          draft.filter = preset ? filterFromPreset(preset, intensity) : null;
        },
      );
  };

  const thumb = (id: string) => <Thumbnail renderer={renderer} state={states[id]!} />;
  // Order: Original, the user's own looks (easy to find right after saving), then the presets.
  const presets: Preset<string>[] = [
    { value: NONE, label: labels.filterNone, glyph: thumb(NONE) },
    ...looks.map((l) => ({
      value: l.id,
      label: l.name,
      glyph: thumb(l.id),
      badge: <IconBookmark size={10} strokeWidth={2.5} />,
      description: labels.myLooks,
      removable: true,
    })),
    ...filterPresets.map((p, i) => ({
      value: p.id,
      label: labels.filterNames[p.id] ?? p.name,
      glyph: thumb(p.id),
      separatorBefore: i === 0,
    })),
  ];

  return (
    <div className="iu-filter">
      <RulerSlider
        label={labels.intensity}
        value={Math.round((edit.filter?.intensity ?? 1) * 100)}
        min={0}
        max={100}
        step={1}
        tickEvery={5}
        unitWidth={4}
        majorEvery={25}
        defaultValue={100}
        disabled={!edit.filter}
        format={(v) => `${v}%`}
        {...undoStep(store, labels.intensity)}
        onChange={(v) =>
          store.getState().update(labels.intensity, (draft) => {
            if (draft.filter) draft.filter.intensity = v / 100;
          })
        }
      />
      <PresetStrip
        variant="thumbs"
        label={labels.filters}
        presets={presets}
        value={selected}
        onSelect={select}
        removeLabel={labels.removeLook}
        onRemove={(id) => setLooks(looks.filter((l) => l.id !== id))}
      />
    </div>
  );
}

/** One live preview, redrawn when the renderer or its state changes. */
function Thumbnail({ renderer, state }: { renderer: ThumbnailRenderer | null; state: EditState }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!renderer || !canvas.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.render(state, canvas.current, Math.round(THUMB * dpr));
  }, [renderer, state]);
  return <canvas ref={canvas} className="iu-thumb" aria-hidden="true" />;
}
