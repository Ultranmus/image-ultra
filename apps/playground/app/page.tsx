'use client';

import { useEffect, useState } from 'react';
import {
  ImageEditor,
  renderImage,
  useImageEditor,
  type EditState,
  type ExportMimeType,
  type ExportResult,
  type ThemeMode,
} from '@image-ultra/react';
import { DevPanel } from './DevPanel';

// `undefined` = the built-in plum brand accent (tuned per theme); the rest test `themeOverrides`.
const ACCENTS = [undefined, '#ff5a1f', '#10b981', '#0ea5e9', '#f43f5e'] as const;
const THEMES: ThemeMode[] = ['dark', 'light', 'auto'];
type Frame = 'full' | 'tablet' | 'phone';
// Demo of the `stickers` prop: the app's own stickers come first in the Sticker tool.
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
          <Segmented label="Theme" options={THEMES} value={theme} onChange={setTheme} />
          <Segmented
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

          <div className="pg-group">
            <button className="pg-btn" onClick={() => setSrc('/sample.jpg')}>
              Sample
            </button>
            <button className="pg-btn" onClick={() => setSrc('/does-not-exist.jpg')}>
              Broken URL
            </button>
            <button className="pg-btn" onClick={() => setSrc(undefined)}>
              Empty
            </button>
          </div>

          <Segmented
            label="App watermark"
            options={['off', 'on', 'locked'] as const}
            value={appWatermark}
            onChange={(v) => {
              setAppWatermark(v);
              setEditorKey((k) => k + 1); // the watermark prop is read when an image opens
            }}
          />

          <Segmented
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

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="pg-group" role="radiogroup" aria-label={label}>
      <span className="pg-label">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          className="pg-btn"
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
