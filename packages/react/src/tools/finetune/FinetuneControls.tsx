import { useEffect, useRef, useState } from 'react';
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
} from '@image-ultra/core/internal';
import { useEditorState, useEditorStore, useLabels, useLooks } from '../../context';
import { IconButton } from '../../components/IconButton';
import { PresetStrip, type Preset } from '../../controls/PresetStrip';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { IconBookmark, IconReset, IconSparkle } from '../../icons/Icon';
import { useHistograms } from '../../hooks/useHistogram';
import { useThumbnailRenderer } from '../../hooks/useThumbnailRenderer';
import { CurveEditor } from './CurveEditor';
import { LevelsEditor } from './LevelsEditor';
import { SaveLookForm } from './SaveLookForm';
import { undoStep } from '../../controls/undoStep';

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
  const saveLookButton = useRef<HTMLButtonElement>(null);
  /** The name form closed: give keyboard focus back to "Save look" (the form is gone). */
  const refocusSaveLook = useRef(false);
  useEffect(() => {
    if (saving || !refocusSaveLook.current) return;
    refocusSaveLook.current = false;
    saveLookButton.current?.focus({ preventScroll: true });
  }, [saving]);
  const [autoBusy, setAutoBusy] = useState(false);
  /** Name of the look just saved — shows a short confirmation with a link to the Filter tool. */
  const [savedName, setSavedName] = useState<string | null>(null);
  useEffect(() => {
    if (!savedName) return;
    const timer = setTimeout(() => setSavedName(null), 6000);
    return () => clearTimeout(timer);
  }, [savedName]);
  const histogram = useHistograms(useThumbnailRenderer(mode === 'adjust' ? null : image), edit);

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
      store.getState().update(labels.steps.autoEnhance, (draft) => {
        Object.assign(draft.finetune, result.finetune);
        draft.levels = result.levels;
      });
    } finally {
      setAutoBusy(false);
    }
  };

  const reset = () =>
    store.getState().update(labels.steps.resetFinetune, (draft) => {
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
                refocusSaveLook.current = true;
                setSaving(false);
                setSavedName(name);
              }}
              onCancel={() => {
                refocusSaveLook.current = true;
                setSaving(false);
              }}
            />
          ) : (
            <>
              <IconButton
                className="iu-finetune__auto"
                label={labels.auto}
                title={labels.autoHint}
                icon={<IconSparkle size={18} />}
                showLabel
                // While it runs it stays focusable (aria-disabled), so focus stays on it.
                disabled={!image}
                aria-disabled={autoBusy || undefined}
                aria-busy={autoBusy}
                onClick={() => {
                  if (!autoBusy) void runAuto();
                }}
              />
              <IconButton
                ref={saveLookButton}
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
            {...undoStep(store, labels.finetune[key])}
            onChange={(v) =>
              store.getState().update(labels.finetune[key], (draft) => {
                draft.finetune[key] = v / 100;
              })
            }
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
