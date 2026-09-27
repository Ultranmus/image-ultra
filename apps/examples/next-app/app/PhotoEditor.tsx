'use client';

import { useState } from 'react';
import { ImageEditor, type ExportResult, type ImageSource } from '@image-ultra/react';

const STORAGE_KEY = 'image-ultra-example:edits';

/** Open a photo, edit it, save it (download + keep the edits), reopen the saved edits. */
export function PhotoEditor() {
  const [src, setSrc] = useState<ImageSource>('/sample.jpg');
  // Saved edits to restore (untrusted JSON is fine: the editor validates it).
  const [initialState, setInitialState] = useState<unknown>(undefined);
  // Changing the key remounts the editor, so it reads `initialState` again.
  const [session, setSession] = useState(0);
  const [status, setStatus] = useState('Edit the photo, then press Done.');

  const open = (file: File) => {
    setSrc(file);
    setInitialState(undefined);
    setSession((n) => n + 1);
  };

  const save = (result: ExportResult) => {
    download(result.blob, result.fileName);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
    } catch {
      // Storage full or blocked: the download still happened.
    }
    setStatus(`Saved ${result.fileName} · ${result.width}×${result.height}`);
  };

  const reopen = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked.
    }
    if (!saved) {
      setStatus('Nothing saved yet.');
      return;
    }
    setInitialState(JSON.parse(saved));
    setSession((n) => n + 1);
    setStatus('Reopened the last saved edits.');
  };

  return (
    <div className="app">
      <header className="bar">
        <label className="button">
          Open photo
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) open(file);
            }}
          />
        </label>
        <button type="button" className="button" onClick={reopen}>
          Reopen last edits
        </button>
        <span role="status">{status}</span>
      </header>
      <main className="editor">
        <ImageEditor key={session} src={src} initialState={initialState} onSave={save} />
      </main>
    </div>
  );
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
