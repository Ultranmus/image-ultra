import { createContext, useCallback, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStore, EditorStoreState, FilterPreset, Look } from '@image-ultra/core/internal';
import type { SizePreset } from './tools/resize/presets';
import type { Labels } from './i18n';

export interface EditorContextValue {
  store: EditorStore;
  labels: Labels;
  /** Saved colour looks (see `ImageEditorProps.looks`). */
  looks: readonly Look[];
  setLooks: (looks: Look[]) => void;
  /** Element inside `.iu-root` that popovers portal into (keeps theme variables). */
  portalContainer: HTMLElement | null;
  /** Fonts offered for text annotations. */
  fonts: readonly FontOption[];
  /** The app locked its watermark: the Watermark tool shows no controls. */
  watermarkLocked: boolean;
  /** App-provided stickers (see `ImageEditorProps.stickers`). */
  stickers: readonly StickerOption[];
  /** Base URL of the 3D sticker library, or `null` when turned off. */
  stickerLibraryUrl: string | null;
  /** Filter looks in the Filter tool (see `ImageEditorProps.filterPresets`). */
  filterPresets: readonly FilterPreset[];
  /** Output sizes in Resize (see `ImageEditorProps.sizePresets`). */
  sizePresets: readonly SizePreset[];
}

export interface StickerOption {
  id: string;
  /** Accessible name / tooltip. */
  label: string;
  /** Image URL (same-origin or CORS-enabled so exports can read it) or data URL. */
  src: string;
}

export interface FontOption {
  /** Shown in the font menu. */
  label: string;
  /** CSS font-family value. Web fonts must be loaded by your app (e.g. next/font). */
  family: string;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error('image-ultra: editor hooks must be used inside <ImageEditor>.');
  return context;
}

/** Subscribe to a slice of editor state; re-renders only when that slice changes. */
export function useEditorState<T>(selector: (state: EditorStoreState) => T): T {
  return useStore(useEditorContext().store, selector);
}

export function useEditorStore(): EditorStore {
  return useEditorContext().store;
}

export function useLabels(): Labels {
  return useEditorContext().labels;
}

export function useLooks(): [readonly Look[], (looks: Look[]) => void] {
  const { looks, setLooks } = useEditorContext();
  return [looks, setLooks];
}

export function usePortalContainer(): HTMLElement | null {
  return useEditorContext().portalContainer;
}

export function useFonts(): readonly FontOption[] {
  return useEditorContext().fonts;
}

/** Id of the tool whose Controls / StageOverlay is rendering. */
export const ToolIdContext = createContext<string>('');

/**
 * Transient UI state shared by a tool's Controls and StageOverlay (e.g. current drawing tool,
 * selection). Lives in the store, outside the edit history.
 */
export function useToolState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const toolId = useContext(ToolIdContext);
  const store = useEditorStore();
  const value = useStore(store, (s) => s.toolState[toolId] as T | undefined) ?? initial;
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = (store.getState().toolState[toolId] as T | undefined) ?? initial;
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      store.getState().setToolState(toolId, resolved);
    },
    // `initial` is only a fallback for the first read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, toolId],
  );
  return [value, setValue];
}

export function useWatermarkLocked(): boolean {
  return useEditorContext().watermarkLocked;
}

export function useStickers(): readonly StickerOption[] {
  return useEditorContext().stickers;
}

export function useFilterPresets(): readonly FilterPreset[] {
  return useEditorContext().filterPresets;
}

export function useSizePresets(): readonly SizePreset[] {
  return useEditorContext().sizePresets;
}

export function useStickerLibraryUrl(): string | null {
  return useEditorContext().stickerLibraryUrl;
}
