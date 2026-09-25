import { useEffect, useRef } from 'react';
import { useEditorState, useEditorStore, useLabels } from '../context';

/**
 * Every step since the image was opened, oldest first: "Original", then each change's label.
 * The current step is highlighted; later steps (undone, still redo-able) are muted. Click to jump.
 */
export function HistoryPanel() {
  const store = useEditorStore();
  const labels = useLabels();
  const history = useEditorState((s) => s.history);
  const listRef = useRef<HTMLOListElement>(null);
  const current = history.past.length;
  const rows = [
    labels.historyOriginal,
    ...history.past.map((entry) => entry.label),
    ...history.future.map((entry) => entry.label),
  ];

  // Open at the current step, however long the list is.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div className="iu-panel">
      <p className="iu-panel__title">{labels.history}</p>
      <ol ref={listRef} className="iu-history">
        {rows.map((label, index) => (
          <li key={index}>
            <button
              type="button"
              className="iu-history__row"
              aria-current={index === current ? 'step' : undefined}
              data-future={index > current ? '' : undefined}
              onClick={() => store.getState().jump(index - current)}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
