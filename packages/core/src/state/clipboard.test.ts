import { describe, expect, it } from 'vitest';
import { copyRedaction, copyShape, pasteClipboard } from './clipboard';
import { createEditState, type EditState } from './editState';
import type { ImageShape, RectShape } from './annotations';
import type { RedactBox } from './redactions';

const rect: RectShape = {
  id: 'r',
  type: 'rect',
  rotation: 15,
  opacity: 1,
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: null,
  stroke: '#ff0000',
  strokeWidth: 4,
  cornerRadius: 8,
  locked: true,
};

const sticker: ImageShape = {
  id: 'i',
  type: 'image',
  rotation: 0,
  opacity: 1,
  x: 0,
  y: 0,
  width: 50,
  height: 50,
  assetId: 'asset-1',
};

const area = { x: 0, y: 0, width: 1000, height: 500 };

function withShapes(): EditState {
  const state = createEditState();
  state.annotations.push(rect, sticker);
  state.assets['asset-1'] = { kind: 'raster', src: 'data:a', width: 1, height: 1, mimeType: 'x' };
  return state;
}

describe('clipboard', () => {
  it('returns null for an unknown id', () => {
    expect(copyShape(createEditState(), 'nope', area)).toBeNull();
    expect(copyRedaction(createEditState(), 'nope', area)).toBeNull();
  });

  it('pasting into the same photo offsets the copy, and again for a second paste', () => {
    const state = withShapes();
    const entry = copyShape(state, 'r', area)!;
    const first = pasteClipboard(state, entry, area);
    const second = pasteClipboard(state, entry, area);
    const a = state.annotations.find((s) => s.id === first) as RectShape;
    const b = state.annotations.find((s) => s.id === second) as RectShape;
    expect(a.x).toBeCloseTo(115); // 3% of the short side (500)
    expect(b.x).toBeCloseTo(130);
    expect(a.width).toBe(200);
    expect(a.rotation).toBe(15);
    expect(a.locked).toBeUndefined();
    expect(new Set([rect.id, first, second]).size).toBe(3);
  });

  it('pastes at the same relative spot and size into a photo of another size', () => {
    const entry = copyShape(withShapes(), 'r', area)!;
    const target = createEditState();
    const other = { x: 100, y: 0, width: 2000, height: 1000 };
    const id = pasteClipboard(target, entry, other);
    const pasted = target.annotations.find((s) => s.id === id) as RectShape;
    // Centre (200, 150) = (20%, 30%) of the area → (100 + 400, 300); size ×2.
    expect(pasted.width).toBe(400);
    expect(pasted.height).toBe(200);
    expect(pasted.x + pasted.width / 2).toBeCloseTo(500);
    expect(pasted.y + pasted.height / 2).toBeCloseTo(300);
    expect(pasted.strokeWidth).toBe(8);
    expect(pasted.cornerRadius).toBe(16);
  });

  it('centres the copy on a given point (the mouse pointer)', () => {
    const state = withShapes();
    const entry = copyShape(state, 'r', area)!;
    const id = pasteClipboard(state, entry, area, { x: 700, y: 400 });
    const pasted = state.annotations.find((s) => s.id === id) as RectShape;
    expect(pasted.x + pasted.width / 2).toBeCloseTo(700);
    expect(pasted.y + pasted.height / 2).toBeCloseTo(400);
    expect(pasted.width).toBe(200);
  });

  it('brings a sticker image along, and renames it if the id is taken by another image', () => {
    const entry = copyShape(withShapes(), 'i', area)!;
    const empty = createEditState();
    const id = pasteClipboard(empty, entry, area);
    expect(empty.assets['asset-1']?.src).toBe('data:a');
    expect((empty.annotations.find((s) => s.id === id) as ImageShape).assetId).toBe('asset-1');

    const clash = createEditState();
    clash.assets['asset-1'] = { kind: 'raster', src: 'data:b', width: 1, height: 1, mimeType: 'x' };
    const id2 = pasteClipboard(clash, entry, area);
    const assetId = (clash.annotations.find((s) => s.id === id2) as ImageShape).assetId;
    expect(assetId).not.toBe('asset-1');
    expect(clash.assets[assetId]?.src).toBe('data:a');
    expect(clash.assets['asset-1']?.src).toBe('data:b');
  });

  it('copies redaction areas', () => {
    const box: RedactBox = {
      id: 'x',
      kind: 'box',
      style: 'blur',
      strength: 0.4,
      color: '#000000',
      rotation: 0,
      x: 10,
      y: 10,
      width: 100,
      height: 50,
    };
    const state = createEditState();
    state.redactions.push(box);
    const entry = copyRedaction(state, 'x', area)!;
    const id = pasteClipboard(state, entry, area);
    const pasted = state.redactions.find((r) => r.id === id) as RedactBox;
    expect(state.redactions).toHaveLength(2);
    expect(pasted.x).toBeCloseTo(25);
    expect(pasted.style).toBe('blur');
    expect(pasted.strength).toBe(0.4);
  });

  it("the clipboard is a snapshot: later edits to the original don't change it", () => {
    const state = withShapes();
    const entry = copyShape(state, 'r', area)!;
    (state.annotations[0] as RectShape).width = 1;
    expect((entry.item.kind === 'shape' && (entry.item.shape as RectShape).width) || 0).toBe(200);
  });
});
