import type { ReactNode } from 'react';
import { getCanvasRect, type AlignEdge, type Shape } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../controls/Popover';
import { PresetStrip } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import {
  IconAlignEdgeBottom,
  IconAlignEdgeCenterX,
  IconAlignEdgeCenterY,
  IconAlignEdgeLeft,
  IconAlignEdgeRight,
  IconAlignEdgeTop,
  IconDistributeX,
  IconDistributeY,
  IconOpacity,
  IconStrokeWidth,
  type IconProps,
} from '../../icons/Icon';
import { shapeActions } from './actions';
import { WATERMARK_ELEMENT_ID } from './watermarkElement';
import { referenceSize, strokeWidthFor, type SizeStep } from './state';

const EDGES: [AlignEdge, (p: IconProps) => React.JSX.Element][] = [
  ['left', IconAlignEdgeLeft],
  ['centerX', IconAlignEdgeCenterX],
  ['right', IconAlignEdgeRight],
  ['top', IconAlignEdgeTop],
  ['centerY', IconAlignEdgeCenterY],
  ['bottom', IconAlignEdgeBottom],
];

/**
 * Align menu: a group lines up on its own bounds (and spreads out evenly, 3+ shapes); a single
 * shape lines up on the photo.
 */
export function AlignMenu({ ids }: { ids: readonly string[] }) {
  const labels = useLabels();
  const store = useEditorStore();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  if (!image) return null;
  const actions = shapeActions(store, labels);
  // A single shape aligns to the whole result (photo + any added space).
  const photo = getCanvasRect(image, edit);
  return (
    <Popover
      label={labels.arrange}
      trigger={<IconButton label={labels.arrange} icon={<IconAlignEdgeLeft />} />}
    >
      <div className="iu-alignmenu">
        {EDGES.map(([edge, Icon]) => (
          <IconButton
            key={edge}
            label={labels.alignEdges[edge]}
            icon={<Icon />}
            onClick={() => actions.align(ids, edge, photo)}
          />
        ))}
        {ids.length > 1 && (
          <>
            <IconButton
              label={labels.distributeX}
              icon={<IconDistributeX />}
              disabled={ids.length < 3}
              onClick={() => actions.distribute(ids, 'x')}
            />
            <IconButton
              label={labels.distributeY}
              icon={<IconDistributeY />}
              disabled={ids.length < 3}
              onClick={() => actions.distribute(ids, 'y')}
            />
          </>
        )}
      </div>
    </Popover>
  );
}

/** Shapes Annotate styles (not redaction areas or the watermark, styled in their own tools). */
const isDrawn = (s: Shape) => s.type !== 'redact' && s.id !== WATERMARK_ELEMENT_ID;
const hasStroke = (s: Shape) => isDrawn(s) && s.type !== 'image' && s.type !== 'text';
const hasFill = (s: Shape) =>
  s.type === 'rect' || s.type === 'ellipse' || s.type === 'text' || (s.type === 'path' && s.closed);
const STEPS: SizeStep[] = ['S', 'M', 'L', 'XL'];

/**
 * Styles several shapes at once: colour (text colour for text, outline for the rest), fill (text
 * background for text), outline width, opacity, and align. Each change is one undo step.
 */
export function GroupInspector({ members }: { members: Shape[] }) {
  const labels = useLabels();
  const store = useEditorStore();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  if (!image) return null;
  const ref = referenceSize(image, edit);
  const ids = members.map((s) => s.id);

  const patchAll = (label: string, patch: (s: Shape) => void) =>
    store.getState().update(label, (draft) => {
      for (const s of draft.annotations) if (ids.includes(s.id) && !s.locked) patch(s as Shape);
    });

  const first = members[0]!;
  const colored = members.filter((s) => isDrawn(s) && s.type !== 'image');
  const filled = members.filter(hasFill);
  const stroked = members.filter(hasStroke);
  const color =
    colored[0]?.type === 'text'
      ? colored[0].color
      : colored[0] && 'stroke' in colored[0]
        ? colored[0].stroke
        : null;
  const fill =
    filled[0]?.type === 'text'
      ? filled[0].background
      : filled[0] && 'fill' in filled[0]
        ? filled[0].fill
        : null;

  const items: ReactNode[] = [];
  if (colored.length > 0) {
    items.push(
      <Popover
        key="color"
        label={labels.strokeColor}
        trigger={<ColorButton swatch={color} label={labels.strokeColor} />}
      >
        <SwatchPicker
          value={color}
          onChange={(value) =>
            patchAll(labels.strokeColor, (s) => {
              if (s.type === 'text') s.color = value ?? s.color;
              else if (s.type === 'line') s.stroke = value ?? s.stroke;
              else if ('stroke' in s) s.stroke = value;
            })
          }
          allowNone={false}
        />
      </Popover>,
    );
  }
  if (filled.length > 0) {
    items.push(
      <Popover
        key="fill"
        label={labels.fillColor}
        trigger={<ColorButton swatch={fill ?? null} label={labels.fillColor} ring />}
      >
        <SwatchPicker
          value={fill ?? null}
          allowNone
          onChange={(value) =>
            patchAll(labels.fillColor, (s) => {
              if (s.type === 'text') s.background = value;
              else if (hasFill(s) && 'fill' in s) s.fill = value;
            })
          }
        />
      </Popover>,
    );
  }
  if (stroked.length > 0) {
    items.push(
      <Popover
        key="width"
        label={labels.strokeWidth}
        trigger={<IconButton label={labels.strokeWidth} icon={<IconStrokeWidth />} />}
      >
        <PresetStrip
          label={labels.strokeWidth}
          value={null}
          onSelect={(step: SizeStep) =>
            patchAll(labels.strokeWidth, (s) => {
              if ('strokeWidth' in s) s.strokeWidth = strokeWidthFor(step, ref);
            })
          }
          presets={STEPS.map((step) => ({ value: step, label: step }))}
        />
      </Popover>,
    );
  }
  items.push(
    <Popover
      key="opacity"
      label={labels.opacity}
      trigger={<IconButton label={labels.opacity} icon={<IconOpacity />} />}
    >
      <RulerSlider
        label={labels.opacity}
        value={Math.round(first.opacity * 100)}
        min={0}
        max={100}
        unitWidth={2.4}
        tickEvery={5}
        majorEvery={25}
        defaultValue={100}
        format={(v) => `${v}%`}
        onChangeStart={() => store.getState().beginChange(labels.opacity)}
        onChangeEnd={() => store.getState().endChange()}
        onChange={(v) =>
          patchAll(labels.opacity, (s) => {
            s.opacity = v / 100;
          })
        }
      />
    </Popover>,
    <AlignMenu key="align" ids={ids} />,
  );
  return <div className="iu-toolgroup">{items}</div>;
}
