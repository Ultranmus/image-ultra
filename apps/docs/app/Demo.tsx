'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageEditor, type ImageEditorProps } from '@image-ultra/react';

type Device = 'desktop' | 'tablet' | 'phone';

const DEVICES: { id: Device; label: string; icon: string }[] = [
  { id: 'desktop', label: 'Desktop', icon: 'M3 4h18v12H3zM8 20h8M12 16v4' },
  { id: 'tablet', label: 'Tablet', icon: 'M5 2h14v20H5zM11 18h2' },
  { id: 'phone', label: 'Phone', icon: 'M7 2h10v20H7zM11 18h2' },
];

const EXPAND = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
const CLOSE = 'M6 6l12 12M18 6L6 18';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A live editor inside a docs page, with a bar to preview it at desktop / tablet / phone width
 * (wide screens only) and to open it full screen. Full screen uses the Fullscreen API where the
 * browser has it for elements, and a fixed overlay where it doesn't (iPhone Safari).
 */
export function Demo(props: ImageEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [full, setFull] = useState(false);

  // Leaving browser full screen (Esc, or the browser's own UI) closes ours too.
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // The overlay fallback: Esc closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setFull(false);
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('demo-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('demo-open');
    };
  }, [full]);

  const open = () => {
    setFull(true);
    ref.current?.requestFullscreen?.().catch(() => {});
  };
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    setFull(false);
  };

  return (
    <div
      ref={ref}
      className="demo"
      data-device={full ? 'desktop' : device}
      data-full={full || undefined}
    >
      <div className="demo__bar">
        <div className="demo__devices" role="group" aria-label="Preview size">
          {DEVICES.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              disabled={full}
              onClick={() => setDevice(id)}
            >
              <Icon d={icon} />
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="demo__full" onClick={full ? close : open}>
          <Icon d={full ? CLOSE : EXPAND} />
          {full ? 'Close full screen' : 'Full screen'}
        </button>
      </div>
      <div className="demo__stage">
        <div className="demo__frame">
          <ImageEditor src="/sample.jpg" theme="auto" {...props} />
        </div>
      </div>
    </div>
  );
}
