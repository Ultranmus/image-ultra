import { useRef, type RefObject } from 'react';
import type { ImageEditorHandle } from '../components/ImageEditor';

/**
 * A typed ref for controlling the editor from your own UI:
 * ```tsx
 * const editor = useImageEditor();
 * <ImageEditor ref={editor} … />
 * <button onClick={() => editor.current?.undo()}>Undo</button>
 * ```
 */
export function useImageEditor(): RefObject<ImageEditorHandle | null> {
  return useRef<ImageEditorHandle>(null);
}
