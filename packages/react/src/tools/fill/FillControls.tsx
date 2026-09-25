import { useRef } from 'react';
import type { BackgroundState } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, useToolState } from '../../context';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { ColorStrip } from '../../controls/ColorStrip';
import { fileToAsset } from '../assets';

type FillKind = 'none' | BackgroundState['kind'];
const KINDS: FillKind[] = ['none', 'color', 'image', 'blur'];

/** Remembered while switching kinds: the last colour and the last chosen image. */
interface FillUi {
  color: string;
  assetId: string | null;
}

/** ControlBar for the Fill tool: what shows through transparent parts (UI_VISION §5b). */
export function FillControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const background = useEditorState((s) => s.edit.background);
  const assets = useEditorState((s) => s.edit.assets);
  const [ui, setUi] = useToolState<FillUi>({ color: '#ffffff', assetId: null });
  const fileInput = useRef<HTMLInputElement>(null);
  const kind: FillKind = background?.kind ?? 'none';
  const color = background?.kind === 'color' ? background.color : ui.color;
  const assetId = background?.kind === 'image' ? background.assetId : ui.assetId;
  const preview = assetId ? assets[assetId]?.src : undefined;

  const set = (label: string, next: BackgroundState | null) =>
    store.getState().update(label, (draft) => {
      draft.background = next;
    });

  const choose = (next: FillKind) => {
    const label = labels.fillKinds[next];
    if (next === 'none') set(label, null);
    else if (next === 'color') set(label, { kind: 'color', color });
    else if (next === 'blur') set(label, { kind: 'blur' });
    else if (assetId && assets[assetId]) set(label, { kind: 'image', assetId });
    else fileInput.current?.click();
  };

  const pickImage = async (file: File) => {
    const asset = await fileToAsset(file, 'fill');
    if (!asset) return;
    setUi((u) => ({ ...u, assetId: asset.id }));
    store.getState().update(labels.fillKinds.image, (draft) => {
      draft.assets[asset.id] = asset.value;
      draft.background = { kind: 'image', assetId: asset.id };
    });
  };

  return (
    <div className="iu-fill">
      <div className="iu-fill__kinds">
        <SegmentedControl
          label={labels.fillKind}
          value={kind}
          options={KINDS.map((value) => ({ value, label: labels.fillKinds[value] }))}
          onChange={choose}
        />
      </div>
      <div className="iu-fill__options">
        {kind === 'color' && (
          <ColorStrip
            label={labels.backgroundColor}
            value={color}
            onChange={(v) => {
              setUi((u) => ({ ...u, color: v }));
              set(labels.backgroundColor, { kind: 'color', color: v });
            }}
          />
        )}
        {kind === 'image' && (
          <div className="iu-fill__image">
            {preview && <img className="iu-fill__preview" src={preview} alt="" />}
            <button
              type="button"
              className="iu-button iu-button--text"
              data-variant="secondary"
              onClick={() => fileInput.current?.click()}
            >
              <span className="iu-button__label">{labels.fillChooseImage}</span>
            </button>
          </div>
        )}
        {(kind === 'none' || kind === 'blur') && (
          <p className="iu-controlbar__hint iu-fill__hint">{labels.fillHint}</p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="iu-sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickImage(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
