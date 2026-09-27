import { useLabels } from '../context';
import { MODE_SHORTCUTS, type AnnotateMode } from '../tools/annotate/state';

/** All keyboard shortcuts, in two groups. Keys show ⌘ on Apple devices and Ctrl elsewhere. */
export function ShortcutsPanel() {
  const labels = useLabels();
  const mod = isApple() ? '⌘' : labels.keys.ctrl;
  const general: [string, string[]][] = [
    [labels.undo, [mod, 'Z']],
    [labels.redo, [mod, '⇧', 'Z']],
    [labels.zoomIn, ['+']],
    [labels.zoomOut, ['−']],
    [labels.zoomFit, ['0']],
    [labels.zoomActual, ['1']],
    [labels.showOriginal, ['\\']],
    [labels.panPhoto, [labels.keys.space, labels.keys.drag]],
    [labels.shortcutsShow, ['?']],
  ];
  const annotate: [string, string[]][] = [
    ...(Object.entries(MODE_SHORTCUTS) as [AnnotateMode, string][]).map(
      ([mode, key]): [string, string[]] => [labels.annotateModes[mode], [key]],
    ),
    [labels.selectAll, [mod, 'A']],
    [labels.addToSelection, ['⇧', labels.keys.click]],
    [labels.copy, [mod, 'C']],
    [labels.cut, [mod, 'X']],
    [labels.paste, [mod, 'V']],
    [labels.duplicate, [mod, 'D']],
    [labels.deleteShape, ['⌫']],
    [labels.nudge, ['←', '→', '↑', '↓']],
    [labels.nextElement, [labels.keys.tab, `⇧ ${labels.keys.tab}`]],
    [labels.finishOrEdit, ['↵']],
    [labels.deselect, [labels.keys.esc]],
    [labels.shapeMenu, ['⇧', 'F10']],
  ];
  return (
    // It scrolls on short screens: focusable so the keyboard can scroll it too.
    <div className="iu-panel iu-shortcuts" role="region" aria-label={labels.shortcuts} tabIndex={0}>
      <p className="iu-panel__title">{labels.shortcuts}</p>
      <Group title={labels.shortcutsGeneral} rows={general} />
      <Group title={labels.tools.annotate} rows={annotate} />
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: [string, string[]][] }) {
  return (
    <section className="iu-shortcuts__group" aria-label={title}>
      <h3 className="iu-shortcuts__heading">{title}</h3>
      <dl className="iu-shortcuts__list">
        {rows.map(([action, keys]) => (
          <div key={action} className="iu-shortcuts__row">
            <dt>{action}</dt>
            <dd>
              {keys.map((key) => (
                <kbd key={key} className="iu-kbd">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}
