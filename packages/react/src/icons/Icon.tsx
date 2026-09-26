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

/* ── Annotate ───────────────────────────────────────────── */
export const IconPointer = createIcon('Pointer', <path d="M5 3.5l13 6.2-5.6 1.8-2.2 5.8z" />);
export const IconPen = createIcon(
  'Pen',
  <>
    <path d="M4 20c2.5-.5 4-2 5-4.5 1.2-3 3-6.5 7-10.5l2 2c-4 4-7.5 5.8-10.5 7-2.5 1-4 2.5-4.5 5z" />
    <path d="M15 6l3 3" />
  </>,
);
export const IconLine = createIcon('Line', <path d="M5 19L19 5" />);
export const IconArrow = createIcon(
  'Arrow',
  <>
    <path d="M5 19L19 5" />
    <path d="M10 5h9v9" />
  </>,
);
export const IconSquare = createIcon(
  'Square',
  <rect x="4" y="4" width="16" height="16" rx="2.5" />,
);
export const IconCircle = createIcon('Circle', <circle cx="12" cy="12" r="8.5" />);
export const IconPolygon = createIcon('Polygon', <path d="M12 3.5l8 6-3 10H7l-3-10z" />);
export const IconText = createIcon('Text', <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />);
export const IconImagePlus = createIcon(
  'ImagePlus',
  <>
    <path d="M13 3.5H6a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-6" />
    <circle cx="9" cy="9.5" r="1.8" />
    <path d="M20.5 15.5l-4.5-4.5-10 9.5M18 2.5v6M15 5.5h6" />
  </>,
);
export const IconLayers = createIcon(
  'Layers',
  <>
    <path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z" />
    <path d="M3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5" />
  </>,
);
export const IconDuplicate = createIcon(
  'Duplicate',
  <>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </>,
);
export const IconTrash = createIcon(
  'Trash',
  <>
    <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13" />
    <path d="M10 10.5v5.5M14 10.5v5.5" />
  </>,
);
export const IconEye = createIcon(
  'Eye',
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IconEyeOff = createIcon(
  'EyeOff',
  <>
    <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 7.2C4 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4" />
    <path d="M3.5 3.5l17 17M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
);
export const IconLock = createIcon(
  'Lock',
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
);
export const IconUnlock = createIcon(
  'Unlock',
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 7.7-1.5" />
  </>,
);
export const IconBold = createIcon(
  'Bold',
  <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
);
/* Align / distribute shapes (not text alignment): a guide line and two bars. */
export const IconAlignEdgeLeft = createIcon(
  'AlignEdgeLeft',
  <path d="M4 3v18M8 6h11v4H8zM8 14h7v4H8z" />,
);
export const IconAlignEdgeCenterX = createIcon(
  'AlignEdgeCenterX',
  <path d="M12 3v3M12 10v4M12 18v3M6 6h12v4H6zM8 14h8v4H8z" />,
);
export const IconAlignEdgeRight = createIcon(
  'AlignEdgeRight',
  <path d="M20 3v18M5 6h11v4H5zM9 14h7v4H9z" />,
);
export const IconAlignEdgeTop = createIcon(
  'AlignEdgeTop',
  <path d="M3 4h18M6 8h4v11H6zM14 8h4v7h-4z" />,
);
export const IconAlignEdgeCenterY = createIcon(
  'AlignEdgeCenterY',
  <path d="M3 12h3M10 12h4M18 12h3M6 6h4v12H6zM14 8h4v8h-4z" />,
);
export const IconAlignEdgeBottom = createIcon(
  'AlignEdgeBottom',
  <path d="M3 20h18M6 5h4v11H6zM14 9h4v7h-4z" />,
);
export const IconDistributeX = createIcon(
  'DistributeX',
  <path d="M4 3v18M20 3v18M10 7h4v10h-4z" />,
);
export const IconDistributeY = createIcon('DistributeY', <path d="M3 4h18M3 20h18M7 10h10v4H7z" />);

export const IconAlignLeft = createIcon('AlignLeft', <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />);
export const IconAlignCenter = createIcon(
  'AlignCenter',
  <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
);
export const IconAlignRight = createIcon(
  'AlignRight',
  <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
);
export const IconStrokeWidth = createIcon(
  'StrokeWidth',
  <>
    <path d="M4 6h16" strokeWidth={1} />
    <path d="M4 11h16" strokeWidth={2} />
    <path d="M4 17h16" strokeWidth={3.5} />
  </>,
);
export const IconOpacity = createIcon(
  'Opacity',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" />
  </>,
);
export const IconCorner = createIcon('Corner', <path d="M5 19V11a6 6 0 0 1 6-6h8" />);
export const IconFont = createIcon(
  'Font',
  <path d="M3.5 18l5-12 5 12M5.5 13.5h6M15 18v-5.5a2.5 2.5 0 0 1 5 0V18M15 15h5" />,
);
export const IconArrowStart = createIcon(
  'ArrowStart',
  <>
    <path d="M19 12H5" />
    <path d="M10 7l-5 5 5 5" />
  </>,
);
export const IconArrowEnd = createIcon(
  'ArrowEnd',
  <>
    <path d="M5 12h14" />
    <path d="M14 7l5 5-5 5" />
  </>,
);
export const IconChevronUp = createIcon('ChevronUp', <path d="M6 15l6-6 6 6" />);
export const IconChevronDown = createIcon('ChevronDown', <path d="M6 9l6 6 6-6" />);
export const IconTextSize = createIcon(
  'TextSize',
  <path d="M3.5 7V5.5h10V7M8.5 5.5V19M6.5 19h4M14 12.5v-1h6.5v1M17.25 11.5V19M15.75 19h3" />,
);
export const IconMore = createIcon(
  'More',
  <>
    <circle cx="5.5" cy="12" r="0.9" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    <circle cx="18.5" cy="12" r="0.9" fill="currentColor" />
  </>,
);
export const IconCompare = createIcon(
  'Compare',
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M12 2.5v19M7 9.5l-2 2.5 2 2.5M17 9.5l2 2.5-2 2.5" />
  </>,
);
export const IconHistory = createIcon(
  'History',
  <>
    <path d="M3.75 12a8.25 8.25 0 1 0 2.5-5.9" />
    <path d="M3.5 4v4h4M12 7.5V12l3 2" />
  </>,
);
export const IconKeyboard = createIcon(
  'Keyboard',
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
  </>,
);
export const IconBrush = createIcon(
  'Brush',
  <>
    <path d="M19.5 4.5l-8.3 8.3" />
    <path d="M11.2 12.8c-2.2-.6-4.2.9-4.5 3.1-.2 1.3-.9 2.3-2.2 2.9 2.6 1.3 6.3 1 7.8-1.4.9-1.4.7-3.1-1.1-4.6z" />
  </>,
);
export const IconPosition = createIcon(
  'Position',
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" />
    <circle cx="16" cy="8" r="0.9" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    <circle cx="8" cy="16" r="0.9" fill="currentColor" />
    <circle cx="16" cy="16" r="1.8" fill="currentColor" />
  </>,
);
