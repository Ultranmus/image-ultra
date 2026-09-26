import { REDACT_STYLES, type Redaction, type RedactStyle } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../controls/Popover';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import { IconBrush, IconSquare, IconStrokeWidth, IconTrash } from '../../icons/Icon';
import { redactRef, useRedactState, type RedactMode } from './state';

const MODE_ICONS = { box: IconSquare, brush: IconBrush } as const;

/**
 * Redact ControlBar (UI_VISION §5b): Box / Brush, the style, strength or fill colour, Delete and
 * Clear all. With an area selected the controls edit it; otherwise they set up the next one.
 */
export function RedactControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const [ui, setUi] = useRedactState();
  const redactions = useEditorState((s) => s.edit.redactions);
  const selected = redactions.find((r) => r.id === ui.selectedId) ?? null;

  const style = selected?.style ?? ui.style;
  const strength = selected?.strength ?? ui.strength;
  const color = selected?.color ?? ui.color;
  // Brush size is stored in image px; the control shows % of the image's short side.
  const ref = useEditorState((s) => (s.image ? redactRef(s.image, s.edit) : 1000));
  const selectedBrush = selected?.kind === 'brush' ? selected : null;
  const brushSize = selectedBrush
    ? Math.min(20, Math.max(1, Math.round((selectedBrush.size / ref) * 100)))
    : ui.brushSize;
  const setBrushSize = (percent: number) => {
    setUi((u) => ({ ...u, brushSize: percent }));
    if (!selectedBrush) return;
    store.getState().update(labels.brushSize, (draft) => {
      const area = draft.redactions.find((r) => r.id === selectedBrush.id);
      if (area?.kind === 'brush') area.size = (percent / 100) * ref;
    });
  };

  /** Changes the selected area (one undo step) and remembers the value for the next area. */
  const apply = (
    label: string,
    change: Partial<Pick<Redaction, 'style' | 'strength' | 'color'>>,
  ) => {
    setUi((u) => ({ ...u, ...change }));
    if (!selected) return;
    store.getState().update(label, (draft) => {
      const area = draft.redactions.find((r) => r.id === selected.id);
      if (area) Object.assign(area, change);
    });
  };

  const modes: RedactMode[] = ['box', 'brush'];

  return (
    <div className="iu-annotate">
      <div className="iu-adjust__row">
        <div className="iu-toolgroup" role="radiogroup" aria-label={labels.redactTools}>
          {modes.map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <IconButton
                key={mode}
                label={mode === 'box' ? labels.redactBox : labels.redactBrush}
                icon={<Icon />}
                role="radio"
                aria-checked={ui.mode === mode}
                data-active={ui.mode === mode ? '' : undefined}
                onClick={() => setUi((u) => ({ ...u, mode }))}
              />
            );
          })}
          {(ui.mode === 'brush' || selectedBrush) && (
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
                  selectedBrush && store.getState().beginChange(labels.brushSize)
                }
                onChangeEnd={() => selectedBrush && store.getState().endChange()}
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
          {selected && (
            <IconButton
              label={`${labels.redactDelete} (⌫)`}
              icon={<IconTrash />}
              onClick={(event) => {
                store.getState().update(labels.redactDelete, (draft) => {
                  draft.redactions = draft.redactions.filter((r) => r.id !== selected.id);
                });
                setUi((u) => ({ ...u, selectedId: null }));
                focusPhoto(event.currentTarget);
              }}
            />
          )}
          <button
            type="button"
            className="iu-button iu-button--text"
            disabled={redactions.length === 0}
            onClick={(event) => {
              store.getState().update(labels.redactClear, (draft) => {
                draft.redactions = [];
              });
              setUi((u) => ({ ...u, selectedId: null }));
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
              onChangeStart={() => selected && store.getState().beginChange(labels.redactStrength)}
              onChangeEnd={() => selected && store.getState().endChange()}
              onChange={(v) => apply(labels.redactStrength, { strength: v / 100 })}
            />
            <span className="iu-rulerfield__label" aria-hidden="true">
              {labels.redactStrength}
            </span>
          </div>
        )}
        <p className="iu-controlbar__hint">
          {style === 'blur'
            ? labels.redactBlurHint
            : redactions.length === 0
              ? labels.redactHint
              : ''}
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
    ?.querySelector<HTMLElement>('.iu-redact-layer')
    ?.focus({ preventScroll: true });
}
