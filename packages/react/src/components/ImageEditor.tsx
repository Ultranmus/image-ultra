import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useStore } from 'zustand';
import {
  createEditState,
  createEditorStore,
  exportImage,
  parseEditState,
  type EditorStore,
  type EditRecipe,
  type EditState,
  type ExportOptions,
  type ExportResult,
  type ImageSource,
  type Look,
  type ToolId,
  FILTER_PRESETS,
  type FilterPreset,
} from '@image-ultra/core/internal';
import { SIZE_PRESETS, type SizePreset } from '../tools/resize/presets';
import { useCompareHold } from '../hooks/useCompareHold';
import { useLooksState } from '../hooks/useLooksState';
import { resolveTools, type ToolInput } from '../tools/builtins';
import { toolLabel } from '../tools/toolLabel';
import {
  EditorContext,
  type EditorContextValue,
  type FontOption,
  type StickerOption,
} from '../context';
import { applyWatermarkInput, type WatermarkInput } from '../tools/watermark/input';
import { setWatermarkLocked } from '../tools/annotate/watermarkElement';
import { DEFAULT_STICKER_LIBRARY_URL } from '../tools/sticker/emojiData';
import { ELEMENT_TOOLS } from '../tools/annotate/layers';
import { defaultFonts } from '../fonts';
import {
  clipboardMarker,
  copySelection,
  pasteFromSystem,
  pasteSelection,
  setPastePoint,
} from '../clipboard';
import { mergeLabels, type LabelOverrides } from '../i18n';
import { themeOverridesToStyle, type ThemeMode, type ThemeOverrides } from '../theme';
import { ControlBar } from './ControlBar';
import { Stage } from './Stage';
import { ToolRail } from './ToolRail';
import { TooltipLayer } from './TooltipLayer';
import { TopBar } from './TopBar';
import { useAnnouncer, useStoreAnnouncements } from '../hooks/useAnnouncer';

const MOTION_MS = 320;
const NO_STICKERS: StickerOption[] = [];

/** Props for `<ImageEditor>`. */
export interface ImageEditorProps {
  /** Image to edit. Omit to show the drop zone. */
  src?: ImageSource | undefined;
  /**
   * Edits to restore when the image opens — an `EditState` or its JSON (e.g. from `onSave`'s
   * `result.state`). Read whenever `src` changes.
   */
  initialState?: EditState | unknown;
  /** `'dark'` (default), `'light'`, or `'auto'` to follow the OS setting. */
  theme?: ThemeMode;
  /**
   * Text direction. Default: the page's (inherited). `rtl` mirrors the layout (tool rail on the
   * right, rows reversed); the photo, sliders and curves stay left-to-right.
   */
  dir?: 'ltr' | 'rtl';
  /** Typed shortcuts for common design tokens, e.g. `{ accent: '#ff5a1f' }`. */
  themeOverrides?: ThemeOverrides;
  /**
   * Tools shown in the ToolRail, in this order: built-in ids and/or your own `defineTool(...)`
   * definitions. Defaults to all built-in tools.
   */
  tools?: readonly ToolInput[];
  /** Tool selected when the editor opens. Defaults to the first of `tools`. */
  defaultTool?: ToolId | (string & {});
  /** Translate or rename any text. */
  labels?: LabelOverrides;
  /** Output format, quality and size used when the user presses Done. */
  exportOptions?: ExportOptions;
  /** Called with the exported image when the user presses Done. */
  onSave?: (result: ExportResult) => void | Promise<void>;
  /** Called after every committed edit (not on every frame of a slider drag). */
  onChange?: (state: EditState) => void;
  /**
   * Saved colour looks shown in the Filter tool. Pass with `onLooksChange` to store them yourself
   * (e.g. per user in your database); otherwise they're kept in this browser's localStorage.
   */
  looks?: Look[];
  onLooksChange?: (looks: Look[]) => void;
  /** localStorage key for uncontrolled looks; `false` keeps them in memory only. */
  persistLooks?: boolean | string;
  /** Fonts offered for text annotations (default: system font stacks). */
  fonts?: FontOption[];
  /**
   * Looks in the Filter tool (default: `FILTER_PRESETS`). A built-in id shows its name from
   * `labels.filterNames`; your own presets show their `name`.
   */
  filterPresets?: readonly FilterPreset[];
  /**
   * Output sizes in Resize (default: `SIZE_PRESETS`). A built-in id shows its name from
   * `labels.sizePresetNames`; your own sizes show their `label`.
   */
  sizePresets?: readonly SizePreset[];
  /**
   * A watermark to start with — text, or a logo via `logo` (image URL). With `lockWatermark` the
   * user can't change or remove it, and every export applies it.
   */
  watermark?: WatermarkInput;
  lockWatermark?: boolean;
  /** Your own stickers, shown first in the Sticker tool. */
  stickers?: StickerOption[];
  /**
   * The 3D sticker library (Microsoft Fluent Emoji 3D, MIT), loaded on demand. Default: the pinned
   * jsDelivr copy. Pass your own base URL to self-host the `assets/` folder, or `false` to turn it off.
   */
  stickerLibrary?: string | false;
  /** Shows a Cancel button in the TopBar when provided. */
  onCancel?: () => void;
  /**
   * Load, export or `initialState` errors. The editor already shows load errors on screen, so
   * without this they're only logged with `console.warn`.
   */
  onError?: (error: Error) => void;
  className?: string;
  style?: CSSProperties;
}

/** Control the editor from your own code: `const editor = useImageEditor()` + `ref={editor}`. */
export interface ImageEditorHandle {
  /** The underlying store, for advanced use (subscribe, custom tools). */
  readonly store: EditorStore;
  /** Current edits. Serializable — `JSON.stringify` it to save. */
  getState(): EditState;
  /** Replace all edits (e.g. restore saved JSON). Clears undo history. */
  setState(state: EditState | unknown): void;
  /** One undoable change: `update('Rotate', (s) => { s.geometry.rotation = 90; })`. */
  update(label: string, recipe: EditRecipe): void;
  undo(): void;
  redo(): void;
  reset(): void;
  /** Render and encode without triggering `onSave`. */
  exportImage(options?: ExportOptions): Promise<ExportResult>;
  /** Same as pressing Done: exports with `exportOptions` and calls `onSave`. */
  save(): Promise<ExportResult | null>;
}

/**
 * The image editor. Give it a photo (`src`); get the edited image and the edits as JSON
 * (`onSave`).
 */
export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor(
  {
    src,
    initialState,
    theme = 'dark',
    dir,
    themeOverrides,
    tools,
    defaultTool,
    labels: labelOverrides,
    exportOptions,
    onSave,
    onChange,
    looks: controlledLooks,
    onLooksChange,
    persistLooks = true,
    fonts: fontsProp,
    filterPresets = FILTER_PRESETS,
    sizePresets = SIZE_PRESETS,
    watermark: watermarkInput,
    lockWatermark = false,
    stickers = NO_STICKERS,
    stickerLibrary = DEFAULT_STICKER_LIBRARY_URL,
    onCancel,
    onError,
    className,
    style,
  },
  ref,
) {
  const idPrefix = `iu${useId().replace(/:/g, '')}`;
  const resolvedTools = useMemo(() => resolveTools(tools), [tools]);
  // Layers opens in the first tool that shows elements (Annotate, else Sticker, else Redact).
  const layersTool =
    ELEMENT_TOOLS.find((id) => resolvedTools.some((tool) => tool.id === id)) ?? null;
  const [store] = useState(() =>
    createEditorStore({ defaultTool: defaultTool ?? resolvedTools[0]?.id ?? 'adjust' }),
  );
  const labels = useMemo(() => mergeLabels(labelOverrides), [labelOverrides]);
  const fonts = useMemo(() => fontsProp ?? defaultFonts(labels), [fontsProp, labels]);
  const [looks, setLooks] = useLooksState(controlledLooks, onLooksChange, persistLooks);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);
  const watermarkLocked = lockWatermark && watermarkInput !== undefined;
  const context = useMemo<EditorContextValue>(
    () => ({
      store,
      labels,
      looks,
      setLooks,
      portalContainer,
      fonts,
      watermarkLocked,
      stickers,
      stickerLibraryUrl: stickerLibrary || null,
      filterPresets,
      sizePresets,
    }),
    // setLooks is recreated each render but only reads refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      store,
      labels,
      looks,
      portalContainer,
      fonts,
      watermarkLocked,
      stickers,
      stickerLibrary,
      filterPresets,
      sizePresets,
    ],
  );
  const [saving, setSaving] = useState(false);
  const [announcements, announce] = useAnnouncer();
  useStoreAnnouncements(store, labels, announce, watermarkLocked);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const compareHold = useCompareHold(store);

  // Latest callbacks/options without re-running effects when parents pass new closures.
  const latest = useRef({
    initialState,
    exportOptions,
    onSave,
    onChange,
    onError,
    watermarkInput,
    watermarkLocked,
  });
  useEffect(() => {
    latest.current = {
      initialState,
      exportOptions,
      onSave,
      onChange,
      onError,
      watermarkInput,
      watermarkLocked,
    };
  });

  /** The edit with the app's watermark: added when missing, forced when locked. */
  const withAppWatermark = (state: EditState): EditState => {
    const { watermarkInput: input, watermarkLocked: locked } = latest.current;
    if (!input || (state.watermark && !locked)) return state;
    return applyWatermarkInput(state, input);
  };
  /** Exports the current edit; a locked watermark is always applied, whatever the state says. */
  const exportCurrent = (options?: ExportOptions): Promise<ExportResult> => {
    const { image, edit } = store.getState();
    if (!image) return Promise.reject(new Error('image-ultra: no image loaded.'));
    const state = latest.current.watermarkLocked ? withAppWatermark(edit) : edit;
    return exportImage(image, state, options);
  };

  const reportError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (latest.current.onError) latest.current.onError(err);
    // warn, not error: a bad file is a user mistake, not a crash (and dev overlays treat
    // console.error as an application error).
    else console.warn(err);
  };

  const parseInitial = (): EditState | undefined => {
    const value = latest.current.initialState;
    if (value === undefined || value === null) return undefined;
    try {
      return parseEditState(value);
    } catch (error) {
      reportError(error);
      return undefined;
    }
  };

  useEffect(() => {
    if (src === undefined) return;
    const parsed = parseInitial();
    const state = latest.current.watermarkInput
      ? withAppWatermark(parsed ?? createEditState())
      : parsed;
    void store.getState().load(src, state ? { state } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialState is read on src change only
  }, [src, store]);

  useEffect(() => () => store.getState().destroy(), [store]);

  // Element actions need to know whether the watermark is the app's (never selectable).
  useEffect(() => setWatermarkLocked(store, watermarkLocked), [store, watermarkLocked]);

  // Surface load errors.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.error && s.error !== prev.error) reportError(s.error);
      }),
    [store],
  );

  // onChange: once per committed edit — not during slider drags, not on image load.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.image !== prev.image || s.pendingChange) return;
        const committedDrag = prev.pendingChange !== null && s.edit !== prev.pendingChange.base;
        if (s.edit !== prev.edit || committedDrag) latest.current.onChange?.(s.edit);
      }),
    [store],
  );

  // Honour the OS "reduce motion" setting for animated zooms.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => store.getState().setAnimationMs(query.matches ? 0 : MOTION_MS);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [store]);

  const save = async (): Promise<ExportResult | null> => {
    if (saving || store.getState().status !== 'ready') return null;
    setSaving(true);
    announce(labels.saving);
    try {
      const result = await exportCurrent(latest.current.exportOptions);
      await latest.current.onSave?.(result);
      announce(labels.announceSaved);
      return result;
    } catch (error) {
      announce(labels.saveFailed, true);
      reportError(error);
      return null;
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, (): ImageEditorHandle => ({
    store,
    getState: () => store.getState().edit,
    setState: (state) => store.getState().replaceEdit(parseEditState(state)),
    update: (label, recipe) => store.getState().update(label, recipe),
    undo: () => store.getState().undo(),
    redo: () => store.getState().redo(),
    reset: () => store.getState().reset(labels.reset),
    exportImage: (options) => exportCurrent(options),
    save,
  }));

  /**
   * ⌘C / ⌘X let the browser's copy event through, which puts our marker on the system clipboard;
   * ⌘V waits briefly for the browser's paste event (it may carry an image from another app) and
   * pastes our own copy if none comes (DECISIONS #84).
   */
  const clip = useRef({ copied: false, pasteTimer: 0 });
  const clipDeps = useRef({ labels, tools: resolvedTools.map((t) => t.id) });
  useEffect(() => {
    clipDeps.current = { labels, tools: resolvedTools.map((t) => t.id) };
  });
  useEffect(() => {
    const root = rootElement;
    if (!root) return;
    const c = clip.current;
    const inEditor = (event: Event) =>
      event.target instanceof Node && root.contains(event.target) && !isTypingTarget(event.target);
    const onCopy = (event: ClipboardEvent) => {
      if (!c.copied || !inEditor(event)) return;
      c.copied = false;
      const marker = clipboardMarker();
      if (!marker || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', marker);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!inEditor(event) || !event.clipboardData) return;
      if (store.getState().status !== 'ready') return;
      window.clearTimeout(c.pasteTimer);
      event.preventDefault();
      const { labels: l, tools: t } = clipDeps.current;
      void pasteFromSystem(store, l, t, event.clipboardData).catch(reportError);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      window.clearTimeout(c.pasteTimer);
    };
  }, [rootElement, store]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target) || event.altKey) return;
    const state = store.getState();
    if (state.status !== 'ready') return;
    const key = event.key.toLowerCase();
    const mod = event.metaKey || event.ctrlKey;
    if (mod) {
      // Only claim undo/redo and copy/paste of shapes; leave every other browser shortcut alone.
      if (key === 'z' && !event.shiftKey) state.undo();
      else if ((key === 'z' && event.shiftKey) || key === 'y') state.redo();
      else if (key === 'c' || key === 'x') {
        if (!copySelection(store, labels, key === 'x')) return;
        // No preventDefault: the copy / cut event that follows writes our marker.
        clip.current.copied = true;
        window.setTimeout(() => (clip.current.copied = false), 0);
        return;
      } else if (key === 'v') {
        const ids = resolvedTools.map((t) => t.id);
        window.clearTimeout(clip.current.pasteTimer);
        clip.current.pasteTimer = window.setTimeout(() => pasteSelection(store, labels, ids), 50);
        return;
      } else return;
      event.preventDefault();
      return;
    }
    if (event.key === '\\') {
      event.preventDefault();
      if (!event.repeat) compareHold.start();
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      setShortcutsOpen(true);
      return;
    }
    const handled: Record<string, () => void> = {
      '+': () => state.zoomBy(1.25, { animate: true }),
      '=': () => state.zoomBy(1.25, { animate: true }),
      '-': () => state.zoomBy(0.8, { animate: true }),
      '0': () => state.fit({ animate: true }),
      '1': () => state.zoomTo(1, { animate: true }),
    };
    const action = handled[key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const activeToolId = useStore(store, (s) => s.activeTool);
  const activeTool = resolvedTools.find((t) => t.id === activeToolId) ?? resolvedTools[0];

  // Say the tool's name when it changes (not when the editor opens).
  const announcedTool = useRef(activeToolId);
  useEffect(() => {
    if (announcedTool.current === activeToolId || !activeTool) return;
    announcedTool.current = activeToolId;
    announce(toolLabel(activeTool, labels));
  }, [activeToolId, activeTool, labels, announce]);

  return (
    <EditorContext.Provider value={context}>
      <div
        ref={setRootElement}
        className={['iu-root', className].filter(Boolean).join(' ')}
        dir={dir}
        data-iu-theme={theme === 'auto' ? undefined : theme}
        style={{ ...themeOverridesToStyle(themeOverrides), ...style }}
        onKeyDown={onKeyDown}
        onPointerMove={(event) => {
          // Menus and popovers sit over the stage: keep the last point (a right-click → Paste
          // lands where the menu was opened).
          const target = event.target as Element;
          if (target.closest('.iu-popover')) return;
          const rect = target.closest('.iu-stage')?.getBoundingClientRect();
          setPastePoint(
            store,
            rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
          );
        }}
        onPointerLeave={() => setPastePoint(store, null)}
        onKeyUp={(event) => {
          if (event.key === '\\') compareHold.end();
        }}
        onBlur={(event) => {
          // Focus left the editor while holding \ (e.g. switched window): stop comparing.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) compareHold.end();
        }}
      >
        <TopBar
          onCancel={onCancel}
          onDone={() => void save()}
          saving={saving}
          shortcutsOpen={shortcutsOpen}
          onShortcutsOpenChange={setShortcutsOpen}
          layersTool={layersTool}
        />
        <div className="iu-body">
          <ToolRail tools={resolvedTools} idPrefix={idPrefix} />
          <main className="iu-main">
            <Stage overlay={activeTool?.StageOverlay} toolId={activeTool?.id} />
            {activeTool && <ControlBar idPrefix={idPrefix} tool={activeTool} />}
          </main>
        </div>
        {/* Popovers render here so they inherit the theme variables. */}
        <div ref={setPortalContainer} className="iu-portal" />
        <TooltipLayer root={rootElement} container={portalContainer} />
        {announcements}
      </div>
    </EditorContext.Provider>
  );
});

function isTypingTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
