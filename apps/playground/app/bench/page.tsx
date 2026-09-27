'use client';

import { useEffect, useState } from 'react';
import { ImageEditor, useImageEditor } from '@image-ultra/react';
import { PHOTO_SIZES, runBench, toMarkdown, type BenchResult, type PhotoSize } from './bench';

const SIZES = Object.keys(PHOTO_SIZES) as PhotoSize[];

/** `/bench` — performance benchmark (Phase 7.7a). `pnpm bench` drives the same code headless. */
export default function BenchPage() {
  const editor = useImageEditor();
  const [step, setStep] = useState('Ready');
  const [running, setRunning] = useState(false);
  const [markdown, setMarkdown] = useState('');

  const run = async (sizes: PhotoSize[]): Promise<BenchResult[]> => {
    const handle = editor.current;
    if (!handle) throw new Error('editor not mounted');
    setRunning(true);
    setMarkdown('');
    const results: BenchResult[] = [];
    try {
      for (const size of sizes) results.push(await runBench(handle, size, setStep));
      setMarkdown(toMarkdown(results));
      setStep('Done');
    } catch (error) {
      setStep(`Failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      setRunning(false);
    }
    return results;
  };

  // Hook for `pnpm bench` (Playwright).
  useEffect(() => {
    (window as unknown as { __bench: unknown }).__bench = { run, toMarkdown };
  });

  return (
    <div className="pg">
      <div className="pg-bar">
        <strong className="pg-logo">Benchmark</strong>
        <button
          type="button"
          className="pg-btn"
          disabled={running}
          onClick={() => void run(SIZES).catch(() => {})}
        >
          Run 12 / 24 / 48MP
        </button>
        <span className="pg-log" role="status">
          {step}
        </span>
      </div>
      <main className="pg-main">
        <div className="pg-stage">
          <div className="pg-frame" style={{ width: '100%' }}>
            <ImageEditor ref={editor} theme="dark" />
          </div>
        </div>
        {/* Always shown, so the stage keeps one size for every run. */}
        <aside className="pg-panel">
          <h3>Results</h3>
          {markdown ? (
            <pre className="pg-json" style={{ maxHeight: 'none', whiteSpace: 'pre-wrap' }}>
              {markdown}
            </pre>
          ) : (
            <p className="pg-panel__note">
              Generates test photos, loads each one, drags six controls for 90 frames and exports
              JPEG / WebP / PNG. Keep this tab in front while it runs.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
