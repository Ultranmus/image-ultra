'use client';

import { useEffect, useState, type RefObject } from 'react';
import type {
  EditState,
  ExportMimeType,
  ExportResult,
  FinetuneState,
  ImageEditorHandle,
} from '@image-ultra/react';

/**
 * Playground-only test harness for the Phase 2 engine. Finetune sliders are replaced by the real
 * Finetune tool in Phase 4. Everything here goes through the public `ImageEditorHandle`.
 */

const FINETUNE: { key: keyof FinetuneState; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'tint', label: 'Tint' },
  { key: 'gamma', label: 'Gamma' },
  { key: 'vignette', label: 'Vignette' },
];

const FORMATS: { value: ExportMimeType; label: string }[] = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
];

export interface DevPanelProps {
  editor: RefObject<ImageEditorHandle | null>;
  format: ExportMimeType;
  onFormatChange: (format: ExportMimeType) => void;
  saved: { result: ExportResult; url: string } | null;
  onReopen: (state: EditState | undefined) => void;
  onLog: (message: string) => void;
}

export function DevPanel({
  editor,
  format,
  onFormatChange,
  saved,
  onReopen,
  onLog,
}: DevPanelProps) {
  const state = useEditState(editor);
  const [snapshot, setSnapshot] = useState<EditState | null>(null);

  const update = (label: string, recipe: (s: EditState) => void) =>
    editor.current?.update(label, recipe);

  return (
    <aside className="pg-panel" aria-label="Dev panel">
      <p className="pg-panel__note">
        Dev panel — drives the engine through <code>ref</code>. Finetune sliders here are temporary
        until Phase 4.
      </p>

      <section>
        <h3>Finetune</h3>
        {FINETUNE.map(({ key, label }) => (
          <label key={key} className="pg-slider">
            <span>{label}</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={Math.round((state?.finetune[key] ?? 0) * 100)}
              aria-label={label}
              // One undo step per drag: begin on press, live updates, commit on release.
              onPointerDown={() => editor.current?.store.getState().beginChange(label)}
              onPointerUp={() => editor.current?.store.getState().endChange()}
              onChange={(e) => {
                const value = Number(e.target.value) / 100;
                update(label, (s) => void (s.finetune[key] = value));
              }}
              onDoubleClick={() => update(label, (s) => void (s.finetune[key] = 0))}
            />
            <output>{Math.round((state?.finetune[key] ?? 0) * 100)}</output>
          </label>
        ))}
      </section>

      <section>
        <h3>History</h3>
        <div className="pg-row">
          <button className="pg-btn" onClick={() => editor.current?.undo()}>
            Undo
          </button>
          <button className="pg-btn" onClick={() => editor.current?.redo()}>
            Redo
          </button>
          <button className="pg-btn" onClick={() => editor.current?.reset()}>
            Reset
          </button>
        </div>
      </section>

      <section>
        <h3>State (non-destructive)</h3>
        <div className="pg-row">
          <button
            className="pg-btn"
            onClick={() => {
              const current = editor.current?.getState() ?? null;
              setSnapshot(current);
              onLog('State snapshot kept');
            }}
          >
            Keep state
          </button>
          <button
            className="pg-btn"
            disabled={!snapshot}
            onClick={() => onReopen(snapshot ?? undefined)}
          >
            Reopen with it
          </button>
          <button className="pg-btn" onClick={() => onReopen(undefined)}>
            Reopen clean
          </button>
        </div>
        <pre className="pg-json" data-testid="state-json">
          {state
            ? JSON.stringify(
                { geometry: state.geometry, finetune: nonZero(state.finetune) },
                null,
                1,
              )
            : '—'}
        </pre>
      </section>

      <section>
        <h3>Export (Done button)</h3>
        <div className="pg-row" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              role="radio"
              aria-checked={format === f.value}
              className="pg-btn"
              onClick={() => onFormatChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {saved && (
          <div className="pg-result" data-testid="export-result">
            <img src={saved.url} alt="Exported result" />
            <div>
              {saved.result.fileName}
              <br />
              {saved.result.width}×{saved.result.height} ·{' '}
              {(saved.result.blob.size / 1024).toFixed(0)} KB · {saved.result.renderer}
              <br />
              <a href={saved.url} download={saved.result.fileName}>
                Download
              </a>
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}

/** Re-renders when the editor's edit state changes. */
function useEditState(editor: RefObject<ImageEditorHandle | null>): EditState | null {
  const [state, setState] = useState<EditState | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let subscribed: unknown = null;
    // The handle is attached after the editor mounts; re-subscribe when it remounts.
    const timer = setInterval(() => {
      const store = editor.current?.store;
      if (!store || store === subscribed) return;
      unsubscribe?.();
      subscribed = store;
      setState(store.getState().edit);
      unsubscribe = store.subscribe((s) => setState(s.edit));
    }, 100);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [editor]);
  return state;
}

function nonZero(finetune: FinetuneState): Partial<FinetuneState> {
  return Object.fromEntries(Object.entries(finetune).filter(([, v]) => v !== 0));
}
