import { useState } from 'react';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { AspectGlyph, PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { IconButton } from '../../components/IconButton';
import { IconFlipHorizontal, IconFlipVertical, IconReset, IconRotateLeft } from '../../icons/Icon';
import {
  getAngle,
  getAspectChoice,
  isDefaultGeometry,
  RATIO_CHOICES,
  ratioValue,
  useAdjust,
  type AngleKind,
  type AspectChoice,
} from './useAdjust';
import { undoStep } from '../../controls/undoStep';

const ANGLE_RANGE: Record<AngleKind, number> = {
  straighten: 45,
  tiltVertical: 30,
  tiltHorizontal: 30,
};

/** ControlBar for the Adjust tool: rotate/flip, the angle dial and aspect ratio chips. */
export function AdjustControls() {
  const labels = useLabels();
  const store = useEditorStore();
  const adjust = useAdjust();
  const image = useEditorState((s) => s.image);
  const geometry = useEditorState((s) => s.edit.geometry);
  const [kind, setKind] = useState<AngleKind>('straighten');

  const range = ANGLE_RANGE[kind];
  const angle = getAngle(geometry, kind);
  const aspect = getAspectChoice(image, geometry);

  const presets: Preset<AspectChoice>[] = [
    { value: 'free', label: labels.aspectFree, glyph: <AspectGlyph aspect={null} /> },
    {
      value: 'original',
      label: labels.aspectOriginal,
      glyph: <AspectGlyph aspect={image ? image.width / image.height : 1} />,
    },
    { value: 'circle', label: labels.aspectCircle, glyph: <AspectGlyph aspect={1} round /> },
    ...RATIO_CHOICES.map((choice) => ({
      value: choice,
      label: choice,
      glyph: <AspectGlyph aspect={ratioValue(choice)} />,
    })),
  ];

  return (
    <div className="iu-adjust">
      <div className="iu-adjust__row">
        <div className="iu-toolgroup">
          <IconButton
            label={labels.rotateLeft}
            icon={<IconRotateLeft />}
            onClick={adjust.rotateLeft}
          />
          <IconButton
            label={labels.flipHorizontal}
            icon={<IconFlipHorizontal />}
            onClick={() => adjust.flip('x')}
          />
          <IconButton
            label={labels.flipVertical}
            icon={<IconFlipVertical />}
            onClick={() => adjust.flip('y')}
          />
        </div>
        <SegmentedControl
          label={labels.straighten}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'straighten', label: labels.straighten },
            { value: 'tiltVertical', label: labels.tiltVertical },
            { value: 'tiltHorizontal', label: labels.tiltHorizontal },
          ]}
        />
        <div className="iu-toolgroup iu-toolgroup--end">
          <IconButton
            label={labels.resetTool}
            icon={<IconReset />}
            disabled={isDefaultGeometry(geometry)}
            onClick={adjust.reset}
          />
        </div>
      </div>

      <RulerSlider
        // Remount per kind so each dial keeps its own range and keyboard state.
        key={kind}
        label={labels[kind]}
        value={Number(angle.toFixed(1))}
        min={-range}
        max={range}
        step={0.1}
        tickEvery={1}
        unitWidth={8}
        majorEvery={5}
        format={formatDegrees}
        {...undoStep(store, kind === 'straighten' ? 'Straighten' : 'Perspective')}
        onChange={(v) => adjust.setAngle(kind, v)}
      />

      <PresetStrip
        label={labels.aspectRatio}
        presets={presets}
        value={aspect}
        onSelect={adjust.setAspect}
      />
    </div>
  );
}

/** `-4.5` → `−4.5°` (typographic minus). */
function formatDegrees(value: number): string {
  const rounded = Number(value.toFixed(1));
  return `${rounded < 0 ? '\u2212' : ''}${Math.abs(rounded)}°`;
}
