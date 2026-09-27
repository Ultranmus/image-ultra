/** Scripts written right-to-left. */
const RTL =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u;
const LETTER = /\p{L}/u;

/**
 * The direction a piece of text reads in, from its first letter (like `dir="auto"`): Arabic or
 * Hebrew text draws right-to-left on the canvas, so mixed text (a number, a Latin word) lands in
 * the right order. No letters → left-to-right.
 */
export function textDirection(text: string): 'ltr' | 'rtl' {
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    return RTL.test(char) ? 'rtl' : 'ltr';
  }
  return 'ltr';
}
