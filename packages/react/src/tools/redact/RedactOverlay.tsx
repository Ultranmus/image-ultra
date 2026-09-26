import { useEditorState } from '../../context';
import { AnnotateOverlay } from '../annotate/AnnotateOverlay';
import { redactRef, useRedactState, type RedactDraw } from './state';

/**
 * The Redact stage (UI_VISION §5b): the shared element overlay (DECISIONS #88) — Box / Brush draw
 * redaction areas, Select picks and groups anything on the photo; moving, resizing, rotating and
 * the menus work as in Annotate.
 */
export function RedactOverlay() {
  const [ui] = useRedactState();
  const ref = useEditorState((s) => (s.image ? redactRef(s.image, s.edit) : 1000));
  const draw: RedactDraw | null =
    ui.redactMode === 'select'
      ? null
      : {
          mode: ui.redactMode,
          style: ui.redactStyle,
          strength: ui.strength,
          color: ui.color,
          brushSize: (ui.brushSize / 100) * ref,
        };
  return <AnnotateOverlay redact={draw} selectOnly={ui.redactMode === 'select'} />;
}
