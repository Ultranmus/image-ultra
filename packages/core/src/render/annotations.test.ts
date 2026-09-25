import { describe, expect, it } from 'vitest';
import type { TextShape } from '../state/annotations';
import { textIndexAt } from './annotations';

// No canvas in Node: layout falls back to one line per paragraph, 0.55em per character.
const text = (overrides: Partial<TextShape> = {}): TextShape => ({
  id: 't',
  type: 'text',
  rotation: 0,
  opacity: 1,
  x: 0,
  y: 0,
  width: 200,
  text: 'hello\nworld',
  fontFamily: 'sans-serif',
  fontSize: 20,
  fontWeight: 400,
  fontStyle: 'normal',
  align: 'left',
  lineHeight: 1.25,
  color: '#fff',
  background: null,
  ...overrides,
});

describe('textIndexAt', () => {
  it('finds the character under a point, line by line', () => {
    expect(textIndexAt(text(), { x: 0, y: 5 })).toBe(0);
    expect(textIndexAt(text(), { x: 22, y: 30 })).toBe(8); // "wo|rld"
    expect(textIndexAt(text(), { x: 999, y: 5 })).toBe(5); // end of "hello"
    expect(textIndexAt(text(), { x: 5, y: 999 })).toBe(6); // below the box → last line
  });

  it('respects alignment', () => {
    // "hello" is 55px wide; right-aligned it starts at 145.
    expect(textIndexAt(text({ align: 'right' }), { x: 145, y: 5 })).toBe(0);
    expect(textIndexAt(text({ align: 'right' }), { x: 200, y: 5 })).toBe(5);
  });
});
