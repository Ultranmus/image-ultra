import { describe, expect, it } from 'vitest';
import { createHistory, pushHistory, redoHistory, undoHistory } from './history';

describe('history', () => {
  it('undoes and redoes in order, and a new change clears redo', () => {
    let h = createHistory<number>();
    h = pushHistory(h, 0, 'one'); // 0 → 1
    h = pushHistory(h, 1, 'two'); // 1 → 2
    const u1 = undoHistory(h, 2)!;
    expect(u1.state).toBe(1);
    const u2 = undoHistory(u1.history, u1.state)!;
    expect(u2.state).toBe(0);
    expect(undoHistory(u2.history, 0)).toBeNull();
    const r1 = redoHistory(u2.history, 0)!;
    expect(r1.state).toBe(1);
    expect(r1.history.future[0]?.label).toBe('two');
    expect(pushHistory(r1.history, 1, 'three').future).toEqual([]);
  });

  it('drops the oldest entries beyond the limit', () => {
    let h = createHistory<number>();
    for (let i = 0; i < 5; i++) h = pushHistory(h, i, `s${i}`, 3);
    expect(h.past.map((e) => e.state)).toEqual([2, 3, 4]);
  });
});
