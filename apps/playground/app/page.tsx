'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ImageEditor,
  renderImage,
  useImageEditor,
  type EditState,
  type ExportMimeType,
  type ExportResult,
  type LabelOverrides,
  type ThemeMode,
} from '@image-ultra/react';
import { DevPanel } from './DevPanel';
import { arabicLabels } from './locales/ar';
import { hindiLabels } from './locales/hi';
import { pseudoLabels } from './pseudoLabels';

// `undefined` = the built-in plum brand accent (tuned per theme); the rest test `themeOverrides`.
const ACCENTS = [undefined, '#ff5a1f', '#10b981', '#0ea5e9', '#f43f5e'] as const;
const THEMES: ThemeMode[] = ['dark', 'light', 'auto'];
type Frame = 'full' | 'tablet' | 'phone';
// Demo of the `stickers` prop: the app's own stickers come first in the Sticker tool.
const LANGUAGES = ['english', 'hindi', 'arabic', 'pseudo'] as const;
type Language = (typeof LANGUAGES)[number];
const LANGUAGE_NAMES: Record<Language, string> = {
  english: 'English',
  hindi: 'हिन्दी (Hindi)',
  arabic: 'العربية (Arabic)',
  pseudo: 'Pseudo ⟦test⟧',
};
/** Labels per language (`undefined` = the built-in English). */
const LANGUAGE_LABELS: Record<Language, LabelOverrides | undefined> = {
  english: undefined,
  hindi: hindiLabels,
  arabic: arabicLabels,
  pseudo: pseudoLabels,
};
const DIRECTIONS = ['auto', 'ltr', 'rtl'] as const;
type Direction = (typeof DIRECTIONS)[number];
const IMAGES = { sample: '/sample.jpg', 'broken URL': '/does-not-exist.jpg', empty: undefined };
type ImageChoice = keyof typeof IMAGES;
/** The URL doesn't change while the page is open. */
const noSubscribe = () => () => {};

const PLAYGROUND_STICKERS = [{ id: 'logo', label: 'Playground logo', src: '/icon.svg' }];
const FRAME_WIDTH: Record<Frame, string> = { full: '100%', tablet: '820px', phone: '390px' };

export default function PlaygroundPage() {
  const editor = useImageEditor();
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [accent, setAccent] = useState<string | undefined>(ACCENTS[0]);
  const [frame, setFrame] = useState<Frame>('full');
  const [src, setSrc] = useState<string | undefined>('/sample.jpg');
  const [format, setFormat] = useState<ExportMimeType>('image/jpeg');
  const [initialState, setInitialState] = useState<EditState | undefined>(undefined);
  const [editorKey, setEditorKey] = useState(0);
  const [saved, setSaved] = useState<{ result: ExportResult; url: string } | null>(null);
  const [log, setLog] = useState('Ready');
  const [appWatermark, setAppWatermark] = useState<'off' | 'on' | 'locked'>('off');
  const [metadata, setMetadata] = useState<'strip' | 'keep' | 'keep + GPS'>('strip');
  // Phones: the settings sit behind a button so the editor gets the screen.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Language switch; `/?locale=pseudo` starts in the pseudo-locale (every label wrapped in ⟦ ⟧,
  // which shows any text that can't be translated). Arabic and right-to-left come in 7.6b / 7.6c.
  const urlPseudo = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get('locale') === 'pseudo',
    () => false,
  );
  const [pickedLanguage, setLanguage] = useState<Language | null>(null);
  const [direction, setDirection] = useState<Direction>('auto');
  const language: Language = pickedLanguage ?? (urlPseudo ? 'pseudo' : 'english');
  // Direction "auto" follows the language (Arabic reads right-to-left).
  const editorDir = dirFor(direction, language);

  // Test hook for Playwright (e2e) — not part of the package API.
  useEffect(() => {
    (window as unknown as { __iu: unknown }).__iu = { editor, renderImage };
  }, [editor]);

  const reopenWith = (state: EditState | undefined) => {
    setInitialState(state);
    setEditorKey((k) => k + 1);
  };

  return (
    <div className="pg">
      <header className="pg-bar">
        <strong className="pg-logo">image-ultra</strong>
        <button
          className="pg-btn pg-settings-toggle"
          aria-expanded={settingsOpen}
          aria-controls="pg-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Settings
        </button>

        <div id="pg-settings" className="pg-settings" data-open={settingsOpen || undefined}>
          <Dropdown label="Theme" options={THEMES} value={theme} onChange={setTheme} />
          <Dropdown
            label="Frame"
            options={['full', 'tablet', 'phone'] as const}
            value={frame}
            onChange={setFrame}
          />

          <div className="pg-group" aria-label="Accent">
            {ACCENTS.map((color) => (
              <button
                key={color ?? 'default'}
                className="pg-swatch"
                style={{ background: color ?? '#4d194d' }}
                aria-pressed={accent === color}
                aria-label={color ? `Accent ${color}` : 'Default accent'}
                onClick={() => setAccent(color)}
              />
            ))}
          </div>

          <Dropdown
            label="Image"
            options={Object.keys(IMAGES) as ImageChoice[]}
            value={imageChoice(src)}
            onChange={(choice) => setSrc(IMAGES[choice])}
          />

          <Dropdown
            label="App watermark"
            options={['off', 'on', 'locked'] as const}
            value={appWatermark}
            onChange={(v) => {
              setAppWatermark(v);
              setEditorKey((k) => k + 1); // the watermark prop is read when an image opens
            }}
          />

          <Dropdown
            label="Language"
            options={LANGUAGES}
            names={LANGUAGE_NAMES}
            value={language}
            onChange={setLanguage}
          />

          <Dropdown
            label="Direction"
            options={DIRECTIONS}
            value={direction}
            onChange={setDirection}
          />

          <Dropdown
            label="Metadata"
            options={['strip', 'keep', 'keep + GPS'] as const}
            value={metadata}
            onChange={setMetadata}
          />
        </div>

        <span className="pg-log" data-testid="log">
          {log}
        </span>
      </header>

      <main className="pg-main">
        <div className="pg-stage">
          <div className="pg-frame" style={{ width: FRAME_WIDTH[frame] }}>
            <ImageEditor
              // Remount when the source or the restored state changes.
              key={`${src ?? 'empty'}-${editorKey}`}
              ref={editor}
              src={src}
              initialState={initialState}
              theme={theme}
              {...(editorDir && { dir: editorDir })}
              {...(LANGUAGE_LABELS[language] && { labels: LANGUAGE_LABELS[language] })}
              themeOverrides={accent ? { accent } : {}}
              exportOptions={{
                mimeType: format,
                fileName: 'edited',
                keepMetadata:
                  metadata === 'strip' ? false : { location: metadata === 'keep + GPS' },
              }}
              onChange={(state) =>
                setLog(`Changed · ${JSON.stringify(state).length} bytes of JSON`)
              }
              onSave={async (result) => {
                setSaved((previous) => {
                  if (previous) URL.revokeObjectURL(previous.url);
                  return { result, url: URL.createObjectURL(result.blob) };
                });
                const exif = (await hasExif(result.blob)) ? 'with EXIF' : 'no EXIF';
                setLog(`Saved ${result.fileName} · ${result.width}×${result.height} · ${exif}`);
              }}
              onCancel={() => setLog('Cancel pressed')}
              onError={(error) => setLog(`Error: ${error.message}`)}
              {...(appWatermark !== 'off' && {
                watermark: { text: '© image-ultra playground', position: 'bottom-left' },
                lockWatermark: appWatermark === 'locked',
              })}
              stickers={PLAYGROUND_STICKERS}
            />
          </div>
        </div>

        <DevPanel
          editor={editor}
          format={format}
          onFormatChange={setFormat}
          saved={saved}
          onReopen={reopenWith}
          onLog={setLog}
        />
      </main>
    </div>
  );
}

/** Whether a saved file carries EXIF (looks for the `Exif\0\0` header near the start). */
async function hasExif(blob: Blob): Promise<boolean> {
  const head = new TextDecoder('latin1').decode(await blob.slice(0, 0x20000).arrayBuffer());
  return head.includes('Exif\0\0');
}

/** A labelled dropdown for the settings toolbar (`names`: display text per option). */
export function Dropdown<T extends string>({
  label,
  options,
  names,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  names?: Partial<Record<T, string>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label className="pg-group">
      <span className="pg-label">{label}</span>
      <select
        className="pg-select"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {names?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Which Image choice a source is (for the dropdown). */
function imageChoice(src: string | undefined): ImageChoice {
  return (Object.keys(IMAGES) as ImageChoice[]).find((key) => IMAGES[key] === src) ?? 'sample';
}

/** The editor's `dir` for the playground's Direction choice (`undefined` = inherit the page's). */
function dirFor(direction: Direction, language: Language): 'ltr' | 'rtl' | undefined {
  if (direction !== 'auto') return direction;
  return language === 'arabic' ? 'rtl' : undefined;
}
