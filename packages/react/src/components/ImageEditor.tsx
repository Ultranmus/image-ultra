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
  createEditorStore,
  parseEditState,
  type EditorStore,
  type EditRecipe,
  type EditState,
  type ExportOptions,
  type ExportResult,
  type ImageSource,
  type Look,
  type ToolId,
} from '@image-ultra/core';
import { useLooksState } from '../hooks/useLooksState';
import { resolveTools, type ToolInput } from '../tools/builtins';
import { toolLabel } from '../tools/toolLabel';
import { EditorContext, type EditorContextValue } from '../context';
import { mergeLabels, type LabelOverrides } from '../i18n';
import { themeOverridesToStyle, type ThemeMode, type ThemeOverrides } from '../theme';
import { ControlBar } from './ControlBar';
import { Stage } from './Stage';
import { ToolRail } from './ToolRail';
import { TopBar } from './TopBar';

const MOTION_MS = 320;

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
  /** Shows a Cancel button in the TopBar when provided. */
  onCancel?: () => void;
  /** Load, export or `initialState` errors. Defaults to `console.error`. */
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

export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor(
  {
    src,
    initialState,
    theme = 'dark',
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
    onCancel,
    onError,
    className,
    style,
  },
  ref,
) {
  const idPrefix = `iu${useId().replace(/:/g, '')}`;
  const resolvedTools = useMemo(() => resolveTools(tools), [tools]);
  const [store] = useState(() =>
    createEditorStore({ defaultTool: defaultTool ?? resolvedTools[0]?.id ?? 'adjust' }),
  );
  const labels = useMemo(() => mergeLabels(labelOverrides), [labelOverrides]);
  const [looks, setLooks] = useLooksState(controlledLooks, onLooksChange, persistLooks);
  const context = useMemo<EditorContextValue>(
    () => ({ store, labels, looks, setLooks }),
    // setLooks is recreated each render but only reads refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, labels, looks],
  );
  const [saving, setSaving] = useState(false);

  // Latest callbacks/options without re-running effects when parents pass new closures.
  const latest = useRef({ initialState, exportOptions, onSave, onChange, onError });
  useEffect(() => {
    latest.current = { initialState, exportOptions, onSave, onChange, onError };
  });

  const reportError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (latest.current.onError) latest.current.onError(err);
    else console.error(err);
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
    const state = parseInitial();
    void store.getState().load(src, state ? { state } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialState is read on src change only
  }, [src, store]);

  useEffect(() => () => store.getState().destroy(), [store]);

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
    try {
      const result = await store.getState().exportImage(latest.current.exportOptions);
      await latest.current.onSave?.(result);
      return result;
    } catch (error) {
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
    reset: () => store.getState().reset(),
    exportImage: (options) => store.getState().exportImage(options),
    save,
  }));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target) || event.altKey) return;
    const state = store.getState();
    if (state.status !== 'ready') return;
    const key = event.key.toLowerCase();
    const mod = event.metaKey || event.ctrlKey;
    if (mod) {
      // Only claim undo/redo; leave every other browser shortcut alone.
      if (key === 'z' && !event.shiftKey) state.undo();
      else if ((key === 'z' && event.shiftKey) || key === 'y') state.redo();
      else return;
      event.preventDefault();
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

  return (
    <EditorContext.Provider value={context}>
      <div
        className={['iu-root', className].filter(Boolean).join(' ')}
        data-iu-theme={theme === 'auto' ? undefined : theme}
        style={{ ...themeOverridesToStyle(themeOverrides), ...style }}
        onKeyDown={onKeyDown}
      >
        <TopBar onCancel={onCancel} onDone={() => void save()} saving={saving} />
        <div className="iu-body">
          <ToolRail tools={resolvedTools} idPrefix={idPrefix} />
          <main className="iu-main">
            <Stage overlay={activeTool?.StageOverlay} />
            {activeTool && <ControlBar idPrefix={idPrefix} tool={activeTool} />}
          </main>
        </div>
        <div className="iu-sr-only" aria-live="polite">
          {activeTool ? toolLabel(activeTool, labels) : ''}
        </div>
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
