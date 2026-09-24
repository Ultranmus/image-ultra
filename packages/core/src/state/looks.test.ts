import { describe, expect, it } from 'vitest';
import { createEditState } from './editState';
import { applyLook, createLook, lookMatches, parseLooks } from './looks';

describe('looks', () => {
  it('saves colour settings and re-applies them without touching geometry', () => {
    const source = createEditState();
    source.finetune.contrast = 0.3;
    source.levels.black = 0.1;
    source.filter = { id: 'mono', name: 'Mono', intensity: 0.5 };
    const look = createLook(source, '  Moody ', 'l1');
    expect(look.name).toBe('Moody');

    const target = createEditState();
    target.geometry.rotation = 90;
    const applied = applyLook(target, look);
    expect(applied.geometry.rotation).toBe(90);
    expect(applied.finetune.contrast).toBe(0.3);
    expect(lookMatches(applied, look)).toBe(true);
    expect(lookMatches(target, look)).toBe(false);
  });

  it('round-trips through JSON and drops junk', () => {
    const look = createLook(createEditState(), 'A', 'a');
    const parsed = parseLooks(JSON.parse(JSON.stringify([look, { id: 1 }, null, 'x'])));
    expect(parsed).toEqual([look]);
  });
});
