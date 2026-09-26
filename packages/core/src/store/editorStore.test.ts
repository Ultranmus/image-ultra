import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, selectCanRedo, selectCanUndo, selectIsDirty } from './editorStore';

describe('editor store edits', () => {
  it('records undoable steps and restores exact snapshots', () => {
    const store = createEditorStore();
    const s = () => store.getState();
    const original = s().edit;

    s().update('Rotate', (d) => {
      d.geometry.rotation = 90;
    });
    s().update('Flip', (d) => {
      d.geometry.flipX = true;
    });
    expect(s().history.past.map((e) => e.label)).toEqual(['Rotate', 'Flip']);
    expect(selectIsDirty(s())).toBe(true);

    s().undo();
    s().undo();
    expect(s().edit).toBe(original);
    expect(selectIsDirty(s())).toBe(false);
    expect(selectCanUndo(s())).toBe(false);

    s().redo();
    expect(s().edit.geometry.rotation).toBe(90);
    expect(selectCanRedo(s())).toBe(true);
  });

  it('ignores no-op updates', () => {
    const store = createEditorStore();
    store.getState().update('Nothing', () => {});
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('merges a continuous change into one step, and cancel restores it', () => {
    const store = createEditorStore();
    const s = () => store.getState();
    s().beginChange('Brightness');
    for (const v of [0.1, 0.2, 0.3]) {
      s().update('Brightness', (d) => {
        d.finetune.brightness = v;
      });
    }
    s().endChange();
    expect(s().history.past).toHaveLength(1);
    expect(s().edit.finetune.brightness).toBe(0.3);

    s().beginChange('Contrast');
    s().update('Contrast', (d) => {
      d.finetune.contrast = 0.5;
    });
    s().cancelChange();
    expect(s().edit.finetune.contrast).toBe(0);
    expect(s().history.past).toHaveLength(1);
  });

  describe('coalesced changes (arrow-key presses)', () => {
    afterEach(() => vi.useRealTimers());
    const press = (store: ReturnType<typeof createEditorStore>, label: string, v: number) => {
      store.getState().beginChange(label, { coalesce: true });
      store.getState().update(label, (d) => {
        d.finetune.brightness = v;
      });
      store.getState().endChange();
    };

    it('merges quick presses with the same label into one step', () => {
      vi.useFakeTimers();
      const store = createEditorStore();
      press(store, 'Brightness', 0.1);
      vi.advanceTimersByTime(300);
      press(store, 'Brightness', 0.2);
      vi.advanceTimersByTime(300);
      store.getState().update('Brightness', (d) => void (d.finetune.brightness = 0.3), {
        coalesce: true,
      });
      expect(store.getState().history.past.map((e) => e.label)).toEqual(['Brightness']);
      store.getState().undo();
      expect(store.getState().edit.finetune.brightness).toBe(0);
    });

    it('starts a new step after a pause, another label, or a step in between', () => {
      vi.useFakeTimers();
      const store = createEditorStore();
      press(store, 'Brightness', 0.1);
      vi.advanceTimersByTime(700);
      press(store, 'Brightness', 0.2);
      press(store, 'Contrast', 0.3);
      store.getState().update('Rotate', (d) => void (d.geometry.rotation = 90));
      press(store, 'Contrast', 0.4);
      expect(store.getState().history.past).toHaveLength(5);
      store.getState().undo();
      press(store, 'Contrast', 0.5); // after an undo: not merged into the undone step
      expect(store.getState().history.past).toHaveLength(5);
      expect(store.getState().history.future).toHaveLength(0);
    });

    it('cancel keeps the earlier press', () => {
      vi.useFakeTimers();
      const store = createEditorStore();
      press(store, 'Brightness', 0.1);
      store.getState().beginChange('Brightness', { coalesce: true });
      store.getState().update('Brightness', (d) => void (d.finetune.brightness = 0.2));
      store.getState().cancelChange();
      expect(store.getState().edit.finetune.brightness).toBe(0.1);
      expect(store.getState().history.past).toHaveLength(1);
    });

    it('never merges plain (pointer) changes', () => {
      const store = createEditorStore();
      store.getState().beginChange('Brightness');
      store.getState().update('Brightness', (d) => void (d.finetune.brightness = 0.1));
      store.getState().endChange();
      press(store, 'Brightness', 0.2);
      expect(store.getState().history.past).toHaveLength(2);
    });
  });

  it('reset is undoable', () => {
    const store = createEditorStore();
    const s = () => store.getState();
    s().update('Exposure', (d) => {
      d.finetune.exposure = 0.5;
    });
    s().reset();
    expect(s().edit).toBe(s().initialEdit);
    s().undo();
    expect(s().edit.finetune.exposure).toBe(0.5);
  });

  it('tracks tasks with progress and supports cancel', async () => {
    const store = createEditorStore();
    let seen: number | null = null;
    const promise = store.getState().runTask('Work', async ({ signal, progress }) => {
      progress(0.5);
      seen = store.getState().tasks[0]?.progress ?? null;
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')));
      });
    });
    const id = store.getState().tasks[0]!.id;
    store.getState().cancelTask(id);
    await expect(promise).rejects.toThrow('cancelled');
    expect(seen).toBe(0.5);
    expect(store.getState().tasks).toEqual([]);
  });
});

describe('editor store: jump & compare', () => {
  it('jumps through history as one change', () => {
    const store = createEditorStore();
    const s = store.getState;
    s().update('a', (d) => {
      d.finetune.brightness = 0.1;
    });
    s().update('b', (d) => {
      d.finetune.brightness = 0.2;
    });
    s().update('c', (d) => {
      d.finetune.brightness = 0.3;
    });
    let changes = 0;
    store.subscribe((next, prev) => {
      if (next.edit !== prev.edit) changes++;
    });
    s().jump(-3);
    expect(s().edit.finetune.brightness).toBe(0);
    expect(changes).toBe(1);
    s().jump(2);
    expect(s().edit.finetune.brightness).toBe(0.2);
    expect(s().history.future).toHaveLength(1);
  });

  it('keeps compare between 0 and 1, outside the edit', () => {
    const store = createEditorStore();
    const edit = store.getState().edit;
    store.getState().setCompare(1.4);
    expect(store.getState().compare).toBe(1);
    store.getState().setCompare(null);
    expect(store.getState().compare).toBeNull();
    expect(store.getState().edit).toBe(edit);
  });
});
