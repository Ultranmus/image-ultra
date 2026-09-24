import { produce, type Draft } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { exportImage, type ExportOptions, type ExportResult } from '../export/exportImage';
import {
  createHistory,
  DEFAULT_HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from '../history/history';
import { loadImage } from '../loader/loadImage';
import { createEditState, type EditState } from '../state/editState';
import { getOutputSize } from '../state/geometry';
import type { EditorStatus, ImageSource, LoadedImage, Point, Size } from '../types';
import {
  clampViewport,
  fitViewport,
  type CropView,
  getScaleLimits,
  lerpViewport,
  zoomAt,
  type Viewport,
  type ViewportOptions,
} from '../viewport/viewport';

/**
 * Changes an `EditState`. Mutate the draft (Immer) or return a whole new state:
 * `store.update('Rotate', (s) => { s.geometry.rotation = 90; })`
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Immer recipes return nothing or a replacement
export type EditRecipe = (draft: Draft<EditState>) => void | EditState;

/** A long-running job (export, AI…) the UI can show progress for and cancel. */
export interface EditorTask {
  id: string;
  label: string;
  /** 0…1, or `null` when the duration is unknown. */
  progress: number | null;
}

export interface TaskContext {
  /** Aborted when the user cancels or the editor closes. Pass it to fetch/models. */
  signal: AbortSignal;
  progress(value: number | null): void;
}

export interface EditorState {
  status: EditorStatus;
  image: LoadedImage | null;
  error: Error | null;
  /** Id of the selected tool: a built-in `ToolId` or a custom tool's id. */
  activeTool: string;
  /**
   * Set while a crop-style tool is active: the stage then shows the whole image framed around the
   * crop instead of the edited result. `null` = normal result view.
   */
  cropView: CropView | null;
  /** Size of the stage element in CSS px. */
  stageSize: Size;
  /** Where the edited result sits on the stage. */
  viewport: Viewport;
  /** True while the result is shown at "fit" — it then re-fits when the stage resizes. */
  isFitted: boolean;
  /** Duration used for animated zooms. The UI sets 0 for `prefers-reduced-motion`. */
  animationMs: number;

  /** All current edits. Immutable — replace it through the actions below. */
  edit: EditState;
  /** The state the image was opened with; "Reset" returns here. */
  initialEdit: EditState;
  history: History<EditState>;
  /** An open continuous change (slider drag) that becomes one history step on `endChange`. */
  pendingChange: { base: EditState; label: string } | null;
  tasks: EditorTask[];
}

export interface ViewportChangeOptions {
  /** Stage point that stays fixed while zooming. Defaults to the stage centre. */
  anchor?: Point;
  /** Animate the change using `animationMs`. */
  animate?: boolean;
}

export interface EditorActions {
  /** Opens an image. `state` restores previously saved edits. Clears history. */
  load(source: ImageSource, options?: { state?: EditState }): Promise<void>;
  setActiveTool(tool: string): void;
  setCropView(view: CropView | null): void;
  setStageSize(size: Size): void;
  setViewport(viewport: Viewport, options?: Pick<ViewportChangeOptions, 'animate'>): void;
  zoomTo(scale: number, options?: ViewportChangeOptions): void;
  zoomBy(factor: number, options?: ViewportChangeOptions): void;
  fit(options?: Pick<ViewportChangeOptions, 'animate'>): void;
  setAnimationMs(ms: number): void;

  /** Applies one undoable change. During `beginChange`/`endChange` it applies live instead. */
  update(label: string, recipe: EditRecipe): void;
  /** Start a continuous change (e.g. slider drag). All `update` calls merge into one undo step. */
  beginChange(label: string): void;
  /** Finish the continuous change and record it (if anything changed). */
  endChange(): void;
  /** Abort the continuous change and restore the state from `beginChange`. */
  cancelChange(): void;
  undo(): void;
  redo(): void;
  /** Back to `initialEdit`, as an undoable step. */
  reset(): void;
  /** Replace the whole edit state, e.g. from saved JSON. Clears history. */
  replaceEdit(state: EditState): void;

  /** Renders and encodes the current result. */
  exportImage(options?: ExportOptions): Promise<ExportResult>;
  /** Runs a cancellable job and tracks its progress in `tasks`. */
  runTask<T>(label: string, run: (context: TaskContext) => Promise<T>): Promise<T>;
  cancelTask(id: string): void;

  /** Frees the decoded image, cancels tasks and animations. Call when unmounting. */
  destroy(): void;
}

export type EditorStoreState = EditorState & EditorActions;
export type EditorStore = StoreApi<EditorStoreState>;

export interface CreateEditorStoreOptions {
  defaultTool?: string;
  viewport?: ViewportOptions;
  /** Maximum undo steps kept. Default 250. */
  historyLimit?: number;
}

const EMPTY_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

/** Selectors for common derived values. */
export const selectCanUndo = (s: EditorState): boolean => s.history.past.length > 0;
export const selectCanRedo = (s: EditorState): boolean => s.history.future.length > 0;
export const selectIsDirty = (s: EditorState): boolean => s.edit !== s.initialEdit;

export function createEditorStore(options: CreateEditorStoreOptions = {}): EditorStore {
  const viewportOptions = options.viewport ?? {};
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  let loadController: AbortController | null = null;
  let animationFrame: number | null = null;
  const taskControllers = new Map<string, AbortController>();
  let taskCounter = 0;

  const stopAnimation = (): void => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const initial = createEditState();

  return createStore<EditorStoreState>()((set, get) => {
    /** Size of the edited result — what the viewport frames. */
    const contentSize = (state: EditState = get().edit): Size | null => {
      const { image } = get();
      return image ? getOutputSize(image, state) : null;
    };

    const applyViewport = (target: Viewport, isFitted: boolean, animate: boolean): void => {
      stopAnimation();
      const { viewport: from, animationMs } = get();
      if (!animate || animationMs <= 0 || typeof requestAnimationFrame === 'undefined') {
        set({ viewport: target, isFitted });
        return;
      }
      const start = performance.now();
      set({ isFitted });
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / animationMs);
        set({ viewport: lerpViewport(from, target, easeOut(t)) });
        animationFrame = t < 1 ? requestAnimationFrame(step) : null;
      };
      animationFrame = requestAnimationFrame(step);
    };

    const clamped = (viewport: Viewport): Viewport => {
      const content = contentSize();
      return content
        ? clampViewport(viewport, content, get().stageSize, viewportOptions)
        : viewport;
    };

    /** Sets a new edit state and re-fits the view when the result's size changed. */
    const commitEdit = (next: EditState, patch: Partial<EditorState> = {}): void => {
      const before = contentSize();
      set({ edit: next, ...patch });
      const after = contentSize(next);
      if (after && (!before || before.width !== after.width || before.height !== after.height)) {
        stopAnimation();
        set({ viewport: fitViewport(after, get().stageSize, viewportOptions), isFitted: true });
      }
    };

    const zoomTo: EditorActions['zoomTo'] = (scale, { anchor, animate = false } = {}) => {
      const content = contentSize();
      if (!content) return;
      const { stageSize, viewport } = get();
      const { min } = getScaleLimits(content, stageSize, viewportOptions);
      const point = anchor ?? { x: stageSize.width / 2, y: stageSize.height / 2 };
      const target = clamped(zoomAt(viewport, scale, point));
      applyViewport(target, target.scale <= min, animate);
    };

    const endPending = (): void => {
      if (get().pendingChange) get().endChange();
    };

    return {
      status: 'idle',
      image: null,
      error: null,
      activeTool: options.defaultTool ?? 'adjust',
      cropView: null,
      stageSize: { width: 0, height: 0 },
      viewport: EMPTY_VIEWPORT,
      isFitted: true,
      animationMs: 320,
      edit: initial,
      initialEdit: initial,
      history: createHistory(),
      pendingChange: null,
      tasks: [],

      async load(source, loadOptions = {}) {
        loadController?.abort();
        const controller = new AbortController();
        loadController = controller;
        set({ status: 'loading', error: null });
        try {
          const image = await loadImage(source, { signal: controller.signal });
          if (controller.signal.aborted) {
            image.bitmap.close();
            return;
          }
          get().image?.bitmap.close();
          stopAnimation();
          const edit = loadOptions.state ?? createEditState();
          set({
            status: 'ready',
            image,
            edit,
            initialEdit: edit,
            history: createHistory(),
            pendingChange: null,
            viewport: fitViewport(getOutputSize(image, edit), get().stageSize, viewportOptions),
            isFitted: true,
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          set({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },

      setActiveTool(tool) {
        set({ activeTool: tool });
      },

      setCropView(view) {
        set({ cropView: view });
      },

      setStageSize(size) {
        const { isFitted, viewport, stageSize } = get();
        if (size.width === stageSize.width && size.height === stageSize.height) return;
        set({ stageSize: size });
        const content = contentSize();
        if (!content) return;
        stopAnimation();
        if (isFitted) {
          set({ viewport: fitViewport(content, size, viewportOptions) });
        } else {
          // Keep the same point in the centre while the stage resizes.
          const dx = (size.width - stageSize.width) / 2;
          const dy = (size.height - stageSize.height) / 2;
          set({ viewport: clamped({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }) });
        }
      },

      setViewport(viewport, { animate = false } = {}) {
        const content = contentSize();
        if (!content) return;
        const target = clamped(viewport);
        const { min } = getScaleLimits(content, get().stageSize, viewportOptions);
        applyViewport(target, target.scale <= min, animate);
      },

      zoomTo,

      zoomBy(factor, changeOptions) {
        zoomTo(get().viewport.scale * factor, changeOptions);
      },

      fit({ animate = false } = {}) {
        const content = contentSize();
        if (!content) return;
        applyViewport(fitViewport(content, get().stageSize, viewportOptions), true, animate);
      },

      setAnimationMs(ms) {
        set({ animationMs: Math.max(0, ms) });
      },

      update(label, recipe) {
        const { edit: current, pendingChange, history } = get();
        const next = produce(current, recipe);
        if (next === current) return;
        if (pendingChange) {
          commitEdit(next);
        } else {
          commitEdit(next, { history: pushHistory(history, current, label, historyLimit) });
        }
      },

      beginChange(label) {
        endPending();
        set({ pendingChange: { base: get().edit, label } });
      },

      endChange() {
        const { pendingChange, edit, history } = get();
        if (!pendingChange) return;
        if (edit === pendingChange.base) {
          set({ pendingChange: null });
          return;
        }
        set({
          pendingChange: null,
          history: pushHistory(history, pendingChange.base, pendingChange.label, historyLimit),
        });
      },

      cancelChange() {
        const { pendingChange } = get();
        if (!pendingChange) return;
        commitEdit(pendingChange.base, { pendingChange: null });
      },

      undo() {
        endPending();
        const result = undoHistory(get().history, get().edit);
        if (result) commitEdit(result.state, { history: result.history });
      },

      redo() {
        endPending();
        const result = redoHistory(get().history, get().edit);
        if (result) commitEdit(result.state, { history: result.history });
      },

      reset() {
        endPending();
        const { initialEdit } = get();
        get().update('Reset', () => initialEdit);
      },

      replaceEdit(state) {
        commitEdit(state, { initialEdit: state, history: createHistory(), pendingChange: null });
      },

      async exportImage(exportOptions) {
        endPending();
        const { image, edit } = get();
        if (!image) throw new Error('image-ultra: no image loaded.');
        return exportImage(image, edit, exportOptions);
      },

      async runTask(label, run) {
        const id = `task-${++taskCounter}`;
        const controller = new AbortController();
        taskControllers.set(id, controller);
        set({ tasks: [...get().tasks, { id, label, progress: null }] });
        try {
          return await run({
            signal: controller.signal,
            progress(value) {
              set({
                tasks: get().tasks.map((task) =>
                  task.id === id
                    ? { ...task, progress: value === null ? null : Math.min(1, Math.max(0, value)) }
                    : task,
                ),
              });
            },
          });
        } finally {
          taskControllers.delete(id);
          set({ tasks: get().tasks.filter((task) => task.id !== id) });
        }
      },

      cancelTask(id) {
        taskControllers.get(id)?.abort();
      },

      destroy() {
        stopAnimation();
        loadController?.abort();
        for (const controller of taskControllers.values()) controller.abort();
        get().image?.bitmap.close();
        set({ image: null, status: 'idle' });
      },
    };
  });
}

/** Matches the `--iu-ease` curve closely enough for viewport tweens. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
