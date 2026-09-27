import type { CurvesState, EditState, FilterState, FinetuneState, LevelsState } from './editState';
import { parseEditState } from './editState';

/**
 * A saved colour "look": finetune + levels + curves + filter. Geometry is not part of a look, so
 * it can be applied to any photo.
 */
export interface Look {
  id: string;
  name: string;
  finetune: FinetuneState;
  levels: LevelsState;
  curves: CurvesState;
  filter: FilterState | null;
}

/** Saves the colour part of `state` (finetune, levels, curves, filter) as a named look. */
export function createLook(state: EditState, name: string, id: string = randomId()): Look {
  return {
    id,
    name: name.trim() || 'Look',
    finetune: { ...state.finetune },
    levels: { ...state.levels },
    curves: structuredClone(state.curves),
    filter: state.filter ? structuredClone(state.filter) : null,
  };
}

/** `state` with the look's colour settings (geometry, resize and assets untouched). */
export function applyLook(state: EditState, look: Look): EditState {
  return {
    ...state,
    finetune: { ...look.finetune },
    levels: { ...look.levels },
    curves: structuredClone(look.curves),
    filter: look.filter ? structuredClone(look.filter) : null,
  };
}

/** `true` when the state's colour settings are exactly the look's. */
export function lookMatches(state: EditState, look: Look): boolean {
  return (
    JSON.stringify([state.finetune, state.levels, state.curves, state.filter]) ===
    JSON.stringify([look.finetune, look.levels, look.curves, look.filter])
  );
}

/** Validates untrusted looks (e.g. from localStorage); invalid entries are dropped. */
export function parseLooks(input: unknown): Look[] {
  if (!Array.isArray(input)) return [];
  const looks: Look[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string') continue;
    try {
      const state = parseEditState(item);
      looks.push({
        id,
        name,
        finetune: state.finetune,
        levels: state.levels,
        curves: state.curves,
        filter: state.filter,
      });
    } catch {
      // skip
    }
  }
  return looks;
}

function randomId(): string {
  return `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
