import { REDACT_STYLES, type RedactShape, type RedactStyle } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../controls/Popover';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import { IconBrush, IconPointer, IconSquare, IconStrokeWidth, IconTrash } from '../../icons/Icon';
import { shapeActions } from '../annotate/actions';
import { selectionIds, selectPatch } from '../annotate/state';
import { redactRef, useRedactState, type RedactMode } from './state';

const MODE_ICONS = { select: IconPointer, box: IconSquare, brush: IconBrush } as const;

/**
 * Redact ControlBar (UI_VISION §5b): Select / Box / Brush, the style, strength or fill colour,
 * Delete and Clear all. With redaction areas selected the controls edit all of them; otherwise
 * they set up the next one.
 */
export function RedactControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const [ui, setUi] = useRedactState();
  const elements = useEditorState((s) => s.edit.annotations);
  const ids = selectionIds(ui);
  const selected = elements.filter(
    (s): s is RedactShape => s.type === 'redact' && ids.includes(s.id),
  );
  const first = selected[0] ?? null;
  const areas = elements.filter((s) => s.type === 'redact');

  const style = first?.style ?? ui.redactStyle;
  const strength = first?.strength ?? ui.strength;
  const color = first?.color ?? ui.color;
  // Brush size is stored in image px; the control shows % of the image's short side.
  const ref = useEditorState((s) => (s.image ? redactRef(s.image, s.edit) : 1000));
  const brushes = selected.filter((s) => s.kind === 'brush');
  const firstBrush = brushes[0];
  const brushSize =
    firstBrush?.kind === 'brush'
      ? Math.min(20, Math.max(1, Math.round((firstBrush.size / ref) * 100)))
      : ui.brushSize;
  const setBrushSize = (percent: number) => {
    setUi((u) => ({ ...u, brushSize: percent }));
    if (brushes.length === 0) return;
    const brushIds = brushes.map((b) => b.id);
    store.getState().update(labels.brushSize, (draft) => {
      for (const s of draft.annotations)
        if (s.type === 'redact' && s.kind === 'brush' && brushIds.includes(s.id))
          s.size = (percent / 100) * ref;
    });
  };

  /** Changes the selected areas (one undo step) and remembers the value for the next area. */
  const apply = (
    label: string,
    change: Partial<Pick<RedactShape, 'style' | 'strength' | 'color'>>,
  ) => {
    setUi((u) => ({
      ...u,
      ...(change.style && { redactStyle: change.style }),
      ...(change.strength !== undefined && { strength: change.strength }),
      ...(change.color && { color: change.color }),
    }));
    if (selected.length === 0) return;
    const targets = selected.filter((s) => !s.locked).map((s) => s.id);
    store.getState().update(label, (draft) => {
      for (const s of draft.annotations)
        if (s.type === 'redact' && targets.includes(s.id)) Object.assign(s, change);
    });
  };

  const modes: RedactMode[] = ['select', 'box', 'brush'];
  const modeLabel = (mode: RedactMode) =>
    mode === 'select'
      ? labels.annotateModes.select
      : mode === 'box'
        ? labels.redactBox
        : labels.redactBrush;

  return (
    <div className="iu-annotate">
      <div className="iu-adjust__row">
        <div className="iu-toolgroup" role="radiogroup" aria-label={labels.redactTools}>
          {modes.map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <IconButton
                key={mode}
                label={modeLabel(mode)}
                icon={<Icon />}
                role="radio"
                aria-checked={ui.redactMode === mode}
                data-active={ui.redactMode === mode ? '' : undefined}
                onClick={() => setUi((u) => ({ ...u, redactMode: mode }))}
              />
            );
          })}
          {(ui.redactMode === 'brush' || brushes.length > 0) && (
            <Popover
              label={labels.brushSize}
              trigger={<IconButton label={labels.brushSize} icon={<IconStrokeWidth />} />}
            >
              <RulerSlider
                label={labels.brushSize}
                value={brushSize}
                min={1}
                max={20}
                unitWidth={8}
                majorEvery={5}
                defaultValue={5}
                format={(v) => `${v}%`}
                onChangeStart={() =>
                  brushes.length > 0 && store.getState().beginChange(labels.brushSize)
                }
                onChangeEnd={() => brushes.length > 0 && store.getState().endChange()}
                onChange={setBrushSize}
              />
            </Popover>
          )}
        </div>
        <SegmentedControl
          label={labels.redactStyle}
          value={style}
          options={REDACT_STYLES.map((value) => ({ value, label: labels.redactStyles[value] }))}
          onChange={(value: RedactStyle) => apply(labels.redactStyle, { style: value })}
        />
        <div className="iu-toolgroup iu-toolgroup--end">
          {ids.length > 0 && (
            <IconButton
              label={`${labels.redactDelete} (⌫)`}
              icon={<IconTrash />}
              onClick={(event) => {
                shapeActions(store, labels).removeMany(ids);
                setUi((u) => ({ ...u, ...selectPatch([]) }));
                focusPhoto(event.currentTarget);
              }}
            />
          )}
          <button
            type="button"
            className="iu-button iu-button--text"
            disabled={areas.length === 0}
            onClick={(event) => {
              store.getState().update(labels.redactClear, (draft) => {
                draft.annotations = draft.annotations.filter(
                  (s) => s.type !== 'redact' || s.locked,
                );
              });
              setUi((u) => ({ ...u, ...selectPatch([]) }));
              focusPhoto(event.currentTarget);
            }}
          >
            <span className="iu-button__label">{labels.redactClear}</span>
          </button>
        </div>
      </div>

      <div className="iu-inspector iu-redact__inspector">
        {style === 'solid' ? (
          <div className="iu-toolgroup">
            <Popover
              label={labels.redactColor}
              trigger={<ColorButton swatch={color} label={labels.redactColor} />}
            >
              <SwatchPicker
                value={color}
                onChange={(v) => v && apply(labels.redactColor, { color: v })}
              />
            </Popover>
          </div>
        ) : (
          <div className="iu-rulerfield">
            <RulerSlider
              label={labels.redactStrength}
              value={Math.round(strength * 100)}
              min={0}
              max={100}
              unitWidth={2.4}
              tickEvery={5}
              majorEvery={25}
              defaultValue={50}
              onChangeStart={() =>
                selected.length > 0 && store.getState().beginChange(labels.redactStrength)
              }
              onChangeEnd={() => selected.length > 0 && store.getState().endChange()}
              onChange={(v) => apply(labels.redactStrength, { strength: v / 100 })}
            />
            <span className="iu-rulerfield__label" aria-hidden="true">
              {labels.redactStrength}
            </span>
          </div>
        )}
        <p className="iu-controlbar__hint">
          {style === 'blur' ? labels.redactBlurHint : areas.length === 0 ? labels.redactHint : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * The pressed button disappears or gets disabled once its areas are gone, which would drop keyboard
 * focus out of the editor (⌘Z would stop working): hand it to the photo instead.
 */
function focusPhoto(from: HTMLElement) {
  from
    .closest('.iu-root')
    ?.querySelector<HTMLElement>('.iu-annotate-layer')
    ?.focus({ preventScroll: true });
}
