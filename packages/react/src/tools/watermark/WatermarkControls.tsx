import { useRef } from 'react';
import {
  DEFAULT_WATERMARK,
  WATERMARK_POSITIONS,
  type WatermarkPosition,
  type WatermarkState,
} from '@image-ultra/core/internal';
import {
  useEditorState,
  useEditorStore,
  useFonts,
  useLabels,
  useToolState,
  useWatermarkLocked,
} from '../../context';
import { IconButton } from '../../components/IconButton';
import { Popover } from '../../controls/Popover';
import { RulerSlider } from '../../controls/RulerSlider';
import { SegmentedControl } from '../../controls/SegmentedControl';
import { ColorButton, SwatchPicker } from '../../controls/SwatchPicker';
import { IconBold, IconFont, IconOpacity, IconPosition } from '../../icons/Icon';
import { fileToAsset } from '../assets';
import { undoStep } from '../../controls/undoStep';

type Kind = 'none' | 'text' | 'logo';
const KINDS: Kind[] = ['none', 'text', 'logo'];
/** The nine spots (not `custom` = dragged, not `tile`). */
const GRID = WATERMARK_POSITIONS.filter(
  (p): p is Exclude<WatermarkPosition, 'tile' | 'custom'> => p !== 'tile' && p !== 'custom',
);

/** The last watermark the user had, so switching to None and back restores it. */
interface WatermarkUi {
  last: WatermarkState;
  logoAssetId: string | null;
}

/**
 * Watermark ControlBar (UI_VISION §5b): None · Text · Logo; text, colour, bold or the logo on row
 * 1; position, size and opacity on row 2. A watermark locked by the app shows no controls.
 */
export function WatermarkControls() {
  const store = useEditorStore();
  const labels = useLabels();
  const locked = useWatermarkLocked();
  const fonts = useFonts();
  const watermark = useEditorState((s) => s.edit.watermark);
  const assets = useEditorState((s) => s.edit.assets);
  const [ui, setUi] = useToolState<WatermarkUi>({ last: DEFAULT_WATERMARK, logoAssetId: null });
  const fileInput = useRef<HTMLInputElement>(null);

  if (locked) {
    return <p className="iu-controlbar__hint">{labels.watermarkLocked}</p>;
  }

  const kind: Kind = !watermark ? 'none' : watermark.kind === 'image' ? 'logo' : 'text';
  const current = watermark ?? ui.last;
  const logoSrc = current.assetId ? assets[current.assetId]?.src : undefined;

  /** One undoable change to the watermark; also remembered for None → back. */
  const change = (label: string, patch: Partial<WatermarkState>) => {
    const next = { ...current, ...patch };
    setUi((u) => ({ ...u, last: next }));
    store.getState().update(label, (draft) => {
      draft.watermark = next;
    });
  };

  const choose = (next: Kind) => {
    const label = labels.watermarkKinds[next];
    if (next === 'none') {
      store.getState().update(label, (draft) => {
        draft.watermark = null;
        draft.annotations = draft.annotations.filter((s) => s.type !== 'watermark');
      });
    } else if (next === 'text') {
      change(label, { kind: 'text' });
    } else if (ui.logoAssetId && assets[ui.logoAssetId]) {
      change(label, { kind: 'image', assetId: ui.logoAssetId });
    } else {
      fileInput.current?.click();
    }
  };

  const pickLogo = async (file: File) => {
    const asset = await fileToAsset(file, 'watermark', 1200);
    if (!asset) return;
    const next = { ...current, kind: 'image' as const, assetId: asset.id };
    setUi({ last: next, logoAssetId: asset.id });
    store.getState().update(labels.watermarkKinds.logo, (draft) => {
      draft.assets[asset.id] = asset.value;
      draft.watermark = next;
    });
  };

  return (
    <div className="iu-annotate">
      <div className="iu-inspector iu-row-centered">
        <SegmentedControl
          label={labels.watermarkKind}
          value={kind}
          options={KINDS.map((value) => ({ value, label: labels.watermarkKinds[value] }))}
          onChange={choose}
        />
        {kind === 'text' && (
          <div className="iu-toolgroup iu-watermark__textrow">
            <label className="iu-field iu-watermark__text">
              <span className="iu-sr-only">{labels.watermarkText}</span>
              <input
                className="iu-field__input"
                dir="auto"
                value={current.text}
                maxLength={200}
                // Typing is one undo step: opened on focus, closed on blur.
                onFocus={() => store.getState().beginChange(labels.watermarkText)}
                onBlur={() => store.getState().endChange()}
                onChange={(e) => change(labels.watermarkText, { text: e.target.value })}
              />
            </label>
            <Popover
              label={labels.watermarkColor}
              trigger={<ColorButton swatch={current.color} label={labels.watermarkColor} />}
            >
              <SwatchPicker
                value={current.color}
                onChange={(v) => v && change(labels.watermarkColor, { color: v })}
              />
            </Popover>
            <Popover
              label={labels.font}
              trigger={<IconButton label={labels.font} icon={<IconFont />} />}
            >
              <div className="iu-menu" role="listbox" aria-label={labels.font}>
                {fonts.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    role="option"
                    aria-selected={f.family === current.fontFamily}
                    className="iu-menu__item"
                    style={{ fontFamily: f.family }}
                    onClick={() => change(labels.font, { fontFamily: f.family })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Popover>
            <IconButton
              label={labels.watermarkBold}
              icon={<IconBold />}
              aria-pressed={current.fontWeight === 700}
              data-active={current.fontWeight === 700 ? '' : undefined}
              onClick={() =>
                change(labels.watermarkBold, { fontWeight: current.fontWeight === 700 ? 400 : 700 })
              }
            />
          </div>
        )}
        {kind === 'logo' && (
          <div className="iu-fill__image">
            {logoSrc && <img className="iu-fill__preview" src={logoSrc} alt="" />}
            <button
              type="button"
              className="iu-button iu-button--text"
              data-variant="secondary"
              onClick={() => fileInput.current?.click()}
            >
              <span className="iu-button__label">{labels.watermarkChooseLogo}</span>
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="iu-sr-only"
          tabIndex={-1}
          // Opened by the visible button next to it: hidden from screen readers.
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickLogo(file);
            e.target.value = '';
          }}
        />
      </div>

      {watermark && (
        <div className="iu-inspector iu-row-centered iu-watermark__place">
          {/* Where and how strong: position and opacity together, then the size. */}
          <div className="iu-toolgroup">
            <Popover
              label={labels.watermarkPosition}
              trigger={<IconButton label={labels.watermarkPosition} icon={<IconPosition />} />}
            >
              <div
                className="iu-watermark__grid"
                role="radiogroup"
                aria-label={labels.watermarkPosition}
              >
                {GRID.map((position) => (
                  <button
                    key={position}
                    type="button"
                    role="radio"
                    aria-checked={current.position === position}
                    aria-label={labels.watermarkPositions[position]}
                    className="iu-watermark__spot"
                    onClick={() => change(labels.watermarkPosition, { position })}
                  />
                ))}
              </div>
              <button
                type="button"
                role="radio"
                aria-checked={current.position === 'tile'}
                className="iu-menu__item iu-watermark__tile"
                data-active={current.position === 'tile' ? '' : undefined}
                onClick={() => change(labels.watermarkPosition, { position: 'tile' })}
              >
                {labels.watermarkPositions.tile}
              </button>
            </Popover>
            <Popover
              label={labels.opacity}
              trigger={<IconButton label={labels.opacity} icon={<IconOpacity />} />}
            >
              <RulerSlider
                label={labels.opacity}
                value={Math.round(current.opacity * 100)}
                min={0}
                max={100}
                unitWidth={2.4}
                tickEvery={5}
                majorEvery={25}
                defaultValue={70}
                format={(v) => `${v}%`}
                {...undoStep(store, labels.opacity)}
                onChange={(v) => change(labels.opacity, { opacity: v / 100 })}
              />
            </Popover>
          </div>
          <div className="iu-rulerfield">
            <RulerSlider
              label={labels.watermarkSize}
              value={Math.round(current.size * 100)}
              min={1}
              max={100}
              unitWidth={3}
              tickEvery={5}
              majorEvery={5}
              defaultValue={25}
              format={(v) => `${v}%`}
              {...undoStep(store, labels.watermarkSize)}
              onChange={(v) => change(labels.watermarkSize, { size: v / 100 })}
            />
            <span className="iu-rulerfield__label" aria-hidden="true">
              {labels.watermarkSize}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
