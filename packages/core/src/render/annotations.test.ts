import { describe, expect, it } from 'vitest';
import type { TextShape } from '../state/annotations';
import { breakTokens, layoutText, textIndexAt } from './annotations';

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

// A fake measurer: every character is 10px wide.
const mono = { font: '', measureText: (t: string) => ({ width: t.length * 10 }) };

describe('layoutText (same rules as the CSS text editor)', () => {
  it('breaks after spaces, hyphens and CJK characters', () => {
    expect(breakTokens('well-known  fact')).toEqual(['well-', 'known', '  ', 'fact']);
    expect(breakTokens('日本語')).toEqual(['日', '本', '語']);
    expect(breakTokens('-5 °C')).toEqual(['-5', ' ', '°C']);
  });

  it('wraps words; trailing spaces hang instead of wrapping', () => {
    const lines = (t: string, width: number) => layoutText(text({ text: t, width }), mono).lines;
    expect(lines('aaa bbb ccc', 70)).toEqual(['aaa bbb', 'ccc']);
    expect(lines('aaa    bbb', 30)).toEqual(['aaa', 'bbb']);
    expect(lines('well-known', 60)).toEqual(['well-', 'known']);
  });

  it('breaks a word wider than the box between characters, also mid-paragraph', () => {
    const lines = layoutText(text({ text: 'hi abcdefghij', width: 40 }), mono).lines;
    expect(lines).toEqual(['hi', 'abcd', 'efgh', 'ij']);
  });
});
