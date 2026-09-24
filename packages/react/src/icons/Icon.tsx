import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered size in CSS px. Icons are drawn on a 24px grid. */
  size?: number;
}

/**
 * image-ultra icon set: 24px grid, 1.75px stroke, round caps and joins (see UI_VISION.md §7).
 * Keep every new icon in this style.
 */
function createIcon(name: string, paths: ReactNode) {
  function IconComponent({ size = 20, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  }
  IconComponent.displayName = `Icon${name}`;
  return IconComponent;
}

export const IconClose = createIcon('Close', <path d="M6 6l12 12M18 6L6 18" />);
export const IconReset = createIcon(
  'Reset',
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4v5h5" />
  </>,
);
export const IconUndo = createIcon(
  'Undo',
  <>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
);
export const IconRedo = createIcon(
  'Redo',
  <>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </>,
);
export const IconMinus = createIcon('Minus', <path d="M5 12h14" />);
export const IconPlus = createIcon('Plus', <path d="M12 5v14M5 12h14" />);
export const IconCheck = createIcon('Check', <path d="M5 12.5l4.5 4.5L19 7" />);
export const IconAlert = createIcon(
  'Alert',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </>,
);
export const IconImage = createIcon(
  'Image',
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-5-5L5 21" />
  </>,
);
export const IconUpload = createIcon(
  'Upload',
  <>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);

/* ── Tools ─────────────────────────────────────────────── */
export const IconAdjust = createIcon(
  'Adjust',
  <>
    <path d="M6 2.5V16a2 2 0 0 0 2 2h13.5" />
    <path d="M18 21.5V8a2 2 0 0 0-2-2H2.5" />
  </>,
);
export const IconFinetune = createIcon(
  'Finetune',
  <>
    <path d="M3.5 7H13M17 7h3.5M3.5 17H7M11 17h9.5" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);
export const IconFilter = createIcon(
  'Filter',
  <>
    <circle cx="12" cy="8.5" r="4.5" />
    <circle cx="8.5" cy="15" r="4.5" />
    <circle cx="15.5" cy="15" r="4.5" />
  </>,
);
export const IconAnnotate = createIcon(
  'Annotate',
  <>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z" />
    <path d="M14.5 5.5l3 3" />
  </>,
);
export const IconRedact = createIcon(
  'Redact',
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
  </>,
);
export const IconSticker = createIcon(
  'Sticker',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </>,
);
export const IconFrame = createIcon(
  'Frame',
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </>,
);
export const IconFill = createIcon(
  'Fill',
  <>
    <path d="M18.5 11L11 3.5 3.3 11.2a2 2 0 0 0 0 2.8l4.7 4.7a2 2 0 0 0 2.8 0z" />
    <path d="M5.5 2.5l4 4M3 12.5h15" />
    <path d="M21.5 19.5a1.75 1.75 0 1 1-3.5 0c0-1.4 1.75-3.5 1.75-3.5s1.75 2.1 1.75 3.5z" />
  </>,
);
export const IconResize = createIcon(
  'Resize',
  <>
    <path d="M14.5 3.5h6v6M9.5 20.5h-6v-6" />
    <path d="M20.5 3.5l-7 7M3.5 20.5l7-7" />
  </>,
);
export const IconWatermark = createIcon(
  'Watermark',
  <path d="M12 2.8S6 9 6 14a6 6 0 0 0 12 0c0-5-6-11.2-6-11.2z" />,
);

/* ── Adjust / Resize controls ───────────────────────────── */
export const IconRotateLeft = createIcon(
  'RotateLeft',
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M4 13V9.5A5.5 5.5 0 0 1 9.5 4H13" />
    <path d="M10.5 1.5L13 4l-2.5 2.5" />
  </>,
);
export const IconFlipHorizontal = createIcon(
  'FlipHorizontal',
  <>
    <path d="M12 3v18" strokeDasharray="2 2.5" />
    <path d="M8.5 6.5L3.5 17.5h5z" />
    <path d="M15.5 6.5l5 11h-5z" />
  </>,
);
export const IconFlipVertical = createIcon(
  'FlipVertical',
  <>
    <path d="M3 12h18" strokeDasharray="2 2.5" />
    <path d="M6.5 8.5L17.5 3.5v5z" />
    <path d="M6.5 15.5l11 5v-5z" />
  </>,
);
export const IconLink = createIcon(
  'Link',
  <>
    <path d="M9.5 14.5l5-5" />
    <path d="M11 6.5l1.5-1.5a4 4 0 0 1 5.7 5.7L16.7 12.2" />
    <path d="M13 17.5L11.5 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
  </>,
);
export const IconUnlink = createIcon(
  'Unlink',
  <>
    <path d="M11 6.5l1.5-1.5a4 4 0 0 1 5.7 5.7L16.7 12.2" />
    <path d="M13 17.5L11.5 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    <path d="M4 4l16 16" />
  </>,
);

/* ── Finetune / Filter controls ─────────────────────────── */
export const IconSparkle = createIcon(
  'Sparkle',
  <>
    <path d="M12 3.5l1.7 4.6a2 2 0 0 0 1.2 1.2l4.6 1.7-4.6 1.7a2 2 0 0 0-1.2 1.2L12 18.5l-1.7-4.6a2 2 0 0 0-1.2-1.2L4.5 11l4.6-1.7a2 2 0 0 0 1.2-1.2z" />
    <path d="M19 3v3M17.5 4.5h3" />
  </>,
);
export const IconBookmark = createIcon(
  'Bookmark',
  <path d="M6.5 4.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5V20l-5.5-3.5L6.5 20z" />,
);
