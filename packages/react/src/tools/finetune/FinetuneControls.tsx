import { useEffect, useState } from 'react';
import {
  autoEnhance,
  createCurvesState,
  createFinetuneState,
  createLevelsState,
  createLook,
  FINETUNE_KEYS,
  FINETUNE_RANGES,
  isNeutralCurves,
  isNeutralFinetune,
  isNeutralLevels,
  type FinetuneState,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, useLooks } from '../../context';
import { IconButton } from '../../components/IconButton';
import { PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { IconBookmark, IconReset, IconSparkle } from '../../icons/Icon';
import { useHistogram } from '../../hooks/useHistogram';
import { CurveEditor } from './CurveEditor';
import { LevelsEditor } from './LevelsEditor';
import { SaveLookForm } from './SaveLookForm';

type Mode = 'adjust' | 'curves' | 'levels';
type Key = keyof FinetuneState;

/** ControlBar for the Finetune tool: 16 adjustments, curves, levels, Auto and "Save look". */
export function FinetuneControls() {
  const labels = useLabels();
  const store = useEditorStore();
  const [looks, setLooks] = useLooks();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const [mode, setMode] = useState<Mode>('adjust');
  const [key, setKey] = useState<Key>('brightness');
  const [saving, setSaving] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  /** Name of the look just saved — shows a short confirmation with a link to the Filter tool. */
  const [savedName, setSavedName] = useState<string | null>(null);
  useEffect(() => {
    if (!savedName) return;
    const timer = setTimeout(() => setSavedName(null), 6000);
    return () => clearTimeout(timer);
  }, [savedName]);
  const histogram = useHistogram(mode === 'adjust' ? null : image, edit);

  const f = edit.finetune;
  const [min, max] = FINETUNE_RANGES[key];
  const untouched =
    isNeutralFinetune(f) && isNeutralLevels(edit.levels) && isNeutralCurves(edit.curves);

  const runAuto = async () => {
    const state = store.getState();
    const current = state.image;
    if (!current || autoBusy) return;
    setAutoBusy(true);
    try {
      const result = await state.runTask('Auto enhance', () => autoEnhance(current, state.edit));
      store.getState().update('Auto enhance', (draft) => {
        Object.assign(draft.finetune, result.finetune);
        draft.levels = result.levels;
      });
    } finally {
      setAutoBusy(false);
    }
  };

  const reset = () =>
    store.getState().update('Reset finetune', (draft) => {
      draft.finetune = createFinetuneState();
      draft.levels = createLevelsState();
      draft.curves = createCurvesState();
    });

  const presets: Preset<Key>[] = FINETUNE_KEYS.map((k) => ({
    value: k,
    label: labels.finetune[k],
    glyph: f[k] !== 0 ? <span className="iu-chip__dot" aria-hidden="true" /> : undefined,
  }));

  return (
    <div className="iu-finetune">
      <div className="iu-adjust__row">
        <SegmentedControl
          label={labels.tools.finetune}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'adjust', label: labels.modeAdjust },
            { value: 'curves', label: labels.modeCurves },
            { value: 'levels', label: labels.modeLevels },
          ]}
        />
        {savedName ? (
          <p className="iu-notice" role="status">
            {labels.lookSaved.replace('{name}', savedName)}
            <button
              type="button"
              className="iu-link"
              onClick={() => store.getState().setActiveTool('filter')}
            >
              {labels.viewInFilters}
            </button>
          </p>
        ) : (
          <span />
        )}
        <div className="iu-toolgroup iu-toolgroup--end">
          {saving ? (
            <SaveLookForm
              onSave={(name) => {
                setLooks([...looks, createLook(store.getState().edit, name)]);
                setSaving(false);
                setSavedName(name);
              }}
              onCancel={() => setSaving(false)}
            />
          ) : (
            <>
              <IconButton
                label={labels.auto}
                title={labels.autoHint}
                icon={<IconSparkle size={18} />}
                showLabel
                disabled={!image || autoBusy}
                aria-busy={autoBusy}
                onClick={() => void runAuto()}
              />
              <IconButton
                label={labels.saveLook}
                icon={<IconBookmark />}
                disabled={untouched && !edit.filter}
                onClick={() => setSaving(true)}
              />
              <IconButton
                label={labels.resetTool}
                icon={<IconReset />}
                disabled={untouched}
                onClick={reset}
              />
            </>
          )}
        </div>
      </div>

      {mode === 'adjust' && (
        <>
          <RulerSlider
            key={key}
            label={labels.finetune[key]}
            value={Math.round(f[key] * 100)}
            min={min * 100}
            max={max * 100}
            step={1}
            tickEvery={5}
            unitWidth={3}
            majorEvery={25}
            format={formatSigned}
            onChangeStart={() => store.getState().beginChange(labels.finetune[key])}
            onChange={(v) =>
              store.getState().update(labels.finetune[key], (draft) => {
                draft.finetune[key] = v / 100;
              })
            }
            onChangeEnd={() => store.getState().endChange()}
          />
          <PresetStrip label={labels.adjustments} presets={presets} value={key} onSelect={setKey} />
        </>
      )}
      {mode === 'curves' && <CurveEditor histogram={histogram} />}
      {mode === 'levels' && <LevelsEditor histogram={histogram} />}
    </div>
  );
}

/** `25` → `+25`, `-25` → `−25`, `0` → `0`. */
function formatSigned(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
