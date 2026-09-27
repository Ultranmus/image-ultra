import { describe, expect, it } from 'vitest';
import { textDirection } from './textDirection';

describe('textDirection', () => {
  it('reads the first letter', () => {
    expect(textDirection('Hello')).toBe('ltr');
    expect(textDirection('مرحبا')).toBe('rtl');
    expect(textDirection('שלום')).toBe('rtl');
    expect(textDirection('नमस्ते')).toBe('ltr');
    expect(textDirection('2024 مرحبا')).toBe('rtl'); // digits are not letters
    expect(textDirection('© Watermark')).toBe('ltr');
    expect(textDirection('123 !?')).toBe('ltr');
    expect(textDirection('')).toBe('ltr');
  });
});
