import { useRef, type ReactNode } from 'react';
import { type Shape, type TextAlign } from '@image-ultra/core';
import { useEditorState, useEditorStore, useFonts, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../controls/Popover';
import { PresetStrip } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrow,
  IconArrowEnd,
  IconArrowStart,
  IconBold,
  IconCircle,
  IconCorner,
  IconDuplicate,
  IconFont,
  IconImagePlus,
  IconLayers,
  IconLine,
  IconOpacity,
  IconPen,
  IconPointer,
  IconPolygon,
  IconSquare,
  IconStrokeWidth,
  IconText,
  IconTextSize,
  IconTrash,
} from '../../icons/Icon';
import type { IconProps } from '../../icons/Icon';
import {
  fontSizeFor,
  MODE_SHORTCUTS,
  nearestStep,
  referenceSize,
  selectionIds,
  selectPatch,
  strokeWidthFor,
  useAnnotateState,
  type AnnotateMode,
  type AnnotateStyle,
  type SizeStep,
} from './state';
import { shapeActions } from './actions';
import { AlignMenu, GroupInspector } from './GroupControls';
import { insertImageFile } from './insertImage';

const MODE_ICONS: Record<AnnotateMode, (p: IconProps) => React.JSX.Element> = {
  select: IconPointer,
  pen: IconPen,
  line: IconLine,
  arrow: IconArrow,
  rect: IconSquare,
  ellipse: IconCircle,
  polygon: IconPolygon,
  text: IconText,
};

const MODES = Object.keys(MODE_ICONS) as AnnotateMode[];
const STEPS: SizeStep[] = ['S', 'M', 'L', 'XL'];

type Kind = Shape['type'] | null;

function kindForMode(mode: AnnotateMode): Kind {
  switch (mode) {
    case 'select':
      return null;
    case 'arrow':
      return 'line';
    case 'pen':
    case 'polygon':
      return 'path';
    default:
      return mode;
  }
}

/** ControlBar for the Annotate tool: drawing tools + an inspector for the selection. */
export function AnnotateControls() {
  const labels = useLabels();
  const fonts = useFonts();
  const store = useEditorStore();
  const [ui, setUi] = useAnnotateState();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!image) return null;

  const ref = referenceSize(image, edit);
  const ids = selectionIds(ui);
  const members = edit.annotations.filter((s) => ids.includes(s.id) && !s.hidden);
  const multi = members.length > 1;
  const selected = multi
    ? null
    : (edit.annotations.find((s) => s.id === ui.selectedId && !s.hidden) ?? null);
  const kind: Kind = selected?.type ?? kindForMode(ui.mode);
  const style = ui.style;
  const polygonOrClosed = selected?.type === 'path' ? selected.closed : ui.mode === 'polygon';

  /** Changes the defaults for new shapes and, if a shape is selected, that shape (one undo step). */
  const apply = (label: string, patch: Partial<AnnotateStyle>, shapePatch?: (s: Shape) => void) => {
    setUi((u) => ({ ...u, style: { ...u.style, ...patch } }));
    if (selected && shapePatch) {
      store.getState().update(label, (draft) => {
        const s = draft.annotations.find((x) => x.id === selected.id);
        if (s) shapePatch(s);
      });
    }
  };

  /** Continuous change (ruler drag) on the selected shape. */
  const live = (label: string) => ({
    onChangeStart: () => store.getState().beginChange(label),
    onChangeEnd: () => store.getState().endChange(),
  });

  const color =
    selected?.type === 'text'
      ? selected.color
      : selected && 'stroke' in selected
        ? selected.stroke
        : kind === 'text'
          ? style.textColor
          : style.stroke;
  const fill =
    selected?.type === 'text'
      ? selected.background
      : selected && 'fill' in selected
        ? selected.fill
        : kind === 'text'
          ? style.textBackground
          : style.fill;
  const strokeWidth =
    selected && 'strokeWidth' in selected
      ? selected.strokeWidth
      : strokeWidthFor(style.strokeSize, ref);
  const fontSize = selected?.type === 'text' ? selected.fontSize : fontSizeFor(style.fontSize, ref);
  const opacity = selected?.opacity ?? style.opacity;

  const actions = shapeActions(store, labels);
  const duplicate = () => {
    if (multi) {
      const copies = actions.duplicateMany(
        members.map((s) => s.id),
        ref * 0.03,
      );
      setUi((u) => ({ ...u, ...selectPatch(copies) }));
      return;
    }
    if (!selected) return;
    const copyId = actions.duplicate(selected, ref * 0.03);
    setUi((u) => ({ ...u, ...selectPatch([copyId]) }));
  };

  const remove = () => {
    if (multi) actions.removeMany(members.map((s) => s.id));
    else if (selected) actions.remove(selected.id);
    else return;
    setUi((u) => ({ ...u, ...selectPatch([]) }));
  };

  const insertImage = async (file: File) => {
    const id = await insertImageFile(store, labels.insertImage, file);
    if (id) setUi((u) => ({ ...u, mode: 'select', ...selectPatch([id]) }));
  };

  const inspector: ReactNode[] = [];
  if (kind && kind !== 'image') {
    inspector.push(
      <Popover
        key="color"
        label={kind === 'text' ? labels.textColor : labels.strokeColor}
        trigger={
          <ColorButton
            swatch={color}
            label={kind === 'text' ? labels.textColor : labels.strokeColor}
          />
        }
      >
        <SwatchPicker
          value={color}
          allowNone={kind === 'rect' || kind === 'ellipse' || (kind === 'path' && polygonOrClosed)}
          onChange={(value) =>
            kind === 'text'
              ? apply(labels.textColor, { textColor: value ?? '#000000' }, (s) => {
                  if (s.type === 'text') s.color = value ?? '#000000';
                })
              : apply(labels.strokeColor, value ? { stroke: value } : {}, (s) => {
                  if ('stroke' in s)
                    (s as { stroke: string | null }).stroke =
                      s.type === 'line' ? (value ?? s.stroke) : value;
                })
          }
        />
      </Popover>,
    );
  }
  if (
    kind === 'rect' ||
    kind === 'ellipse' ||
    kind === 'text' ||
    (kind === 'path' && polygonOrClosed)
  ) {
    const label = kind === 'text' ? labels.textBackground : labels.fillColor;
    inspector.push(
      <Popover
        key="fill"
        label={label}
        trigger={<ColorButton swatch={fill ?? null} label={label} ring />}
      >
        <SwatchPicker
          value={fill ?? null}
          allowNone
          onChange={(value) =>
            kind === 'text'
              ? apply(label, { textBackground: value }, (s) => {
                  if (s.type === 'text') s.background = value;
                })
              : apply(label, { fill: value }, (s) => {
                  if ('fill' in s) s.fill = value;
                })
          }
        />
      </Popover>,
    );
  }
  if (kind && kind !== 'image' && kind !== 'text') {
    const max = Math.max(20, Math.ceil(ref * 0.05));
    inspector.push(
      <Popover
        key="width"
        label={labels.strokeWidth}
        trigger={<IconButton label={labels.strokeWidth} icon={<IconStrokeWidth />} />}
      >
        <SizeChooser
          label={labels.strokeWidth}
          value={nearestStep(strokeWidth, ref, 'stroke')}
          onStep={(step) =>
            apply(labels.strokeWidth, { strokeSize: step }, (s) => {
              if ('strokeWidth' in s) s.strokeWidth = strokeWidthFor(step, ref);
            })
          }
        />
        {selected && (
          <RulerSlider
            label={labels.strokeWidth}
            value={Math.round(strokeWidth)}
            min={1}
            max={max}
            unitWidth={Math.max(2, 240 / max)}
            majorEvery={Math.max(1, Math.round(max / 10))}
            defaultValue={Math.round(strokeWidthFor('M', ref))}
            format={(v) => `${v}px`}
            {...live(labels.strokeWidth)}
            onChange={(v) =>
              store.getState().update(labels.strokeWidth, (draft) => {
                const s = draft.annotations.find((x) => x.id === selected.id);
                if (s && 'strokeWidth' in s) s.strokeWidth = v;
              })
            }
          />
        )}
      </Popover>,
    );
  }
  if (kind === 'text') {
    const text = selected?.type === 'text' ? selected : null;
    const family = text?.fontFamily ?? style.fontFamily;
    const weight = text?.fontWeight ?? style.fontWeight;
    const align = text?.align ?? style.align;
    inspector.push(
      <Popover
        key="font"
        label={labels.font}
        trigger={<IconButton label={labels.font} icon={<IconFont />} />}
      >
        <div className="iu-menu" role="listbox" aria-label={labels.font}>
          {fonts.map((f) => (
            <button
              key={f.label}
              type="button"
              role="option"
              aria-selected={f.family === family}
              className="iu-menu__item"
              style={{ fontFamily: f.family }}
              onClick={() =>
                apply(labels.font, { fontFamily: f.family }, (s) => {
                  if (s.type === 'text') s.fontFamily = f.family;
                })
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </Popover>,
      <Popover
        key="size"
        label={labels.fontSize}
        trigger={<IconButton label={labels.fontSize} icon={<IconTextSize />} />}
      >
        <SizeChooser
          label={labels.fontSize}
          value={nearestStep(fontSize, ref, 'font')}
          onStep={(step) =>
            apply(labels.fontSize, { fontSize: step }, (s) => {
              if (s.type === 'text') s.fontSize = fontSizeFor(step, ref);
            })
          }
        />
        {text && (
          <RulerSlider
            label={labels.fontSize}
            value={Math.round(fontSize)}
            min={6}
            max={Math.max(60, Math.ceil(ref * 0.25))}
            unitWidth={1}
            tickEvery={5}
            majorEvery={50}
            defaultValue={fontSizeFor('M', ref)}
            format={(v) => `${v}px`}
            {...live(labels.fontSize)}
            onChange={(v) =>
              store.getState().update(labels.fontSize, (draft) => {
                const s = draft.annotations.find((x) => x.id === text.id);
                if (s?.type === 'text') s.fontSize = v;
              })
            }
          />
        )}
      </Popover>,
      <IconButton
        key="bold"
        label={labels.bold}
        icon={<IconBold />}
        aria-pressed={weight === 700}
        data-active={weight === 700 ? '' : undefined}
        onClick={() => {
          const next = weight === 700 ? 400 : 700;
          apply(labels.bold, { fontWeight: next }, (s) => {
            if (s.type === 'text') s.fontWeight = next;
          });
        }}
      />,
      <div key="align" className="iu-toolgroup" role="radiogroup" aria-label={labels.alignCenter}>
        {(
          [
            ['left', labels.alignLeft, IconAlignLeft],
            ['center', labels.alignCenter, IconAlignCenter],
            ['right', labels.alignRight, IconAlignRight],
          ] as [TextAlign, string, (p: IconProps) => React.JSX.Element][]
        ).map(([value, label, Icon]) => (
          <IconButton
            key={value}
            label={label}
            icon={<Icon />}
            role="radio"
            aria-checked={align === value}
            data-active={align === value ? '' : undefined}
            onClick={() =>
              apply(label, { align: value }, (s) => {
                if (s.type === 'text') s.align = value;
              })
            }
          />
        ))}
      </div>,
    );
  }
  if (selected?.type === 'line') {
    for (const end of ['startCap', 'endCap'] as const) {
      const on = selected[end] === 'arrow';
      const label = end === 'startCap' ? labels.arrowStart : labels.arrowEnd;
      inspector.push(
        <IconButton
          key={end}
          label={label}
          icon={end === 'startCap' ? <IconArrowStart /> : <IconArrowEnd />}
          aria-pressed={on}
          data-active={on ? '' : undefined}
          onClick={() =>
            apply(label, {}, (s) => {
              if (s.type === 'line') s[end] = on ? 'none' : 'arrow';
            })
          }
        />,
      );
    }
  }
  if (selected?.type === 'rect') {
    const max = Math.max(1, Math.round(Math.min(selected.width, selected.height) / 2));
    inspector.push(
      <Popover
        key="radius"
        label={labels.cornerRadius}
        trigger={<IconButton label={labels.cornerRadius} icon={<IconCorner />} />}
      >
        <RulerSlider
          label={labels.cornerRadius}
          value={Math.min(max, Math.round(selected.cornerRadius))}
          min={0}
          max={max}
          unitWidth={Math.max(1, 240 / max)}
          tickEvery={Math.max(1, Math.round(max / 40))}
          majorEvery={Math.max(1, Math.round(max / 8))}
          format={(v) => `${v}px`}
          {...live(labels.cornerRadius)}
          onChange={(v) =>
            store.getState().update(labels.cornerRadius, (draft) => {
              const s = draft.annotations.find((x) => x.id === selected.id);
              if (s?.type === 'rect') s.cornerRadius = v;
            })
          }
        />
      </Popover>,
    );
  }
  if (selected && !selected.locked) inspector.push(<AlignMenu key="align" ids={[selected.id]} />);
  if (kind) {
    inspector.push(
      <Popover
        key="opacity"
        label={labels.opacity}
        trigger={<IconButton label={labels.opacity} icon={<IconOpacity />} />}
      >
        <RulerSlider
          label={labels.opacity}
          value={Math.round(opacity * 100)}
          min={0}
          max={100}
          unitWidth={2.4}
          tickEvery={5}
          majorEvery={25}
          defaultValue={100}
          format={(v) => `${v}%`}
          onChangeStart={() => selected && store.getState().beginChange(labels.opacity)}
          onChangeEnd={() => selected && store.getState().endChange()}
          onChange={(v) =>
            apply(labels.opacity, { opacity: v / 100 }, (s) => {
              s.opacity = v / 100;
            })
          }
        />
      </Popover>,
    );
  }

  return (
    <div className="iu-annotate">
      <div className="iu-adjust__row">
        <div className="iu-toolgroup" role="radiogroup" aria-label={labels.annotateTools}>
          {MODES.map((mode) => {
            const Icon = MODE_ICONS[mode];
            const label = `${labels.annotateModes[mode]} (${MODE_SHORTCUTS[mode]})`;
            return (
              <IconButton
                key={mode}
                label={label}
                icon={<Icon />}
                role="radio"
                aria-checked={ui.mode === mode}
                data-active={ui.mode === mode ? '' : undefined}
                onClick={() => setUi((u) => ({ ...u, mode, editingId: null }))}
              />
            );
          })}
          <IconButton
            label={labels.insertImage}
            icon={<IconImagePlus />}
            onClick={() => fileInput.current?.click()}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="iu-sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void insertImage(file);
              e.target.value = '';
            }}
          />
        </div>
        <span />
        <div className="iu-toolgroup iu-toolgroup--end">
          <IconButton
            label={labels.layers}
            icon={<IconLayers />}
            aria-pressed={ui.layersOpen}
            data-active={ui.layersOpen ? '' : undefined}
            onClick={() => setUi((u) => ({ ...u, layersOpen: !u.layersOpen }))}
          />
        </div>
      </div>

      <div className="iu-inspector">
        {multi ? (
          <GroupInspector members={members} />
        ) : inspector.length > 0 ? (
          <div className="iu-toolgroup">{inspector}</div>
        ) : (
          <p className="iu-controlbar__hint">
            {ui.mode === 'polygon' ? labels.polygonHint : labels.annotateHint}
          </p>
        )}
        {(selected || multi) && (
          <div className="iu-toolgroup iu-toolgroup--end">
            {multi && (
              <span className="iu-controlbar__count" aria-live="polite">
                {labels.selectedCount.replace('{count}', String(members.length))}
              </span>
            )}
            <IconButton
              label={`${labels.duplicate} (⌘D)`}
              icon={<IconDuplicate />}
              onClick={duplicate}
            />
            <IconButton
              label={`${labels.deleteShape} (⌫)`}
              icon={<IconTrash />}
              onClick={(event) => {
                // The button disappears with the selection: keep keyboard focus in the editor.
                const root = event.currentTarget.closest('.iu-root');
                remove();
                root
                  ?.querySelector<HTMLElement>('.iu-annotate-layer')
                  ?.focus({ preventScroll: true });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SizeChooser({
  label,
  value,
  onStep,
}: {
  label: string;
  value: SizeStep | null;
  onStep: (s: SizeStep) => void;
}) {
  return (
    <PresetStrip
      label={label}
      value={value}
      onSelect={onStep}
      presets={STEPS.map((s) => ({ value: s, label: s }))}
    />
  );
}
