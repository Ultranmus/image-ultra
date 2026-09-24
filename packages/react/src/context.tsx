import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStore, EditorStoreState } from '@image-ultra/core';
import type { Labels } from './i18n';

export interface EditorContextValue {
  store: EditorStore;
  labels: Labels;
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
