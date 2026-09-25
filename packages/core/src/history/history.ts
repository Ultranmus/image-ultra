/**
 * Snapshot history. Each entry stores a full immutable state; Immer's structural sharing makes
 * that cheap (unchanged parts are shared between snapshots). See DECISIONS.md #20.
 */
export interface HistoryEntry<T> {
  state: T;
  /** What the change *after* this snapshot did, e.g. "Rotate". Shown in the history panel. */
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export const DEFAULT_HISTORY_LIMIT = 250;

export function createHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Record that `previous` was replaced by a new state via the change `label`. Clears redo. */
export function pushHistory<T>(
  history: History<T>,
  previous: T,
  label: string,
  limit = DEFAULT_HISTORY_LIMIT,
): History<T> {
  const past = [...history.past, { state: previous, label }];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undoHistory<T>(
  history: History<T>,
  current: T,
): { history: History<T>; state: T } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    state: entry.state,
    history: {
      past: history.past.slice(0, -1),
      future: [{ state: current, label: entry.label }, ...history.future],
    },
  };
}

export function redoHistory<T>(
  history: History<T>,
  current: T,
): { history: History<T>; state: T } | null {
  const [entry, ...rest] = history.future;
  if (!entry) return null;
  return {
    state: entry.state,
    history: { past: [...history.past, { state: current, label: entry.label }], future: rest },
  };
}

/**
 * Moves `steps` through history in one go: negative = back (undo), positive = forward (redo).
 * Stops at either end. Returns `null` when nothing changes.
 */
export function jumpHistory<T>(
  history: History<T>,
  current: T,
  steps: number,
): { history: History<T>; state: T } | null {
  type Step = { history: History<T>; state: T };
  let at: Step = { history, state: current };
  let moved = false;
  for (let i = 0; i < Math.abs(steps); i++) {
    const next: Step | null =
      steps < 0 ? undoHistory(at.history, at.state) : redoHistory(at.history, at.state);
    if (!next) break;
    at = next;
    moved = true;
  }
  return moved ? at : null;
}
