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
 * Playground-only test harness: history, saved state and export through the public
 * `ImageEditorHandle`. All editing happens in the real tools.
 */

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

  return (
    <aside className="pg-panel" aria-label="Dev panel">
      <p className="pg-panel__note">
        Dev panel — drives the engine through <code>ref</code> (history, saved state, export).
      </p>

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
