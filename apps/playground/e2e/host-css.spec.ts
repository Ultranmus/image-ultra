import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';

// The app's own CSS can't reach inside the editor (DECISIONS #112). Found in the 0.1.0 install check:
// create-next-app's default globals.css squashed every button, because unlayered CSS beats
// @layer image-ultra.

/** create-next-app's reset plus the parts of Tailwind v3's preflight that touch our elements. */
const HOSTILE_CSS = `
  * { box-sizing: border-box; padding: 0; margin: 0; }
  *, ::before, ::after { border: 0 solid; }
  button, input, select { font: inherit; color: inherit; background-color: transparent; }
  button { text-transform: none; }
  img, svg, canvas { display: block; max-width: 100%; height: auto; }
  ol, ul { list-style: none; }
  ::placeholder { opacity: 1; color: #9ca3af; }
`;

const TOOLS = [
  'adjust',
  'finetune',
  'filter',
  'annotate',
  'redact',
  'sticker',
  'frame',
  'fill',
  'resize',
];

/** Position, size and look of every element in the editor, for each tool. */
async function snapshot(page: Page) {
  const shots: Record<string, { at: number[]; look: string }[]> = {};
  for (const tool of TOOLS) {
    await page.evaluate((tool) => {
      const store = (window as unknown as { __iu: TestHook }).__iu.editor.current!.store;
      store.getState().setActiveTool(tool as never);
    }, tool);
    await page.waitForTimeout(150);
    shots[tool] = await page.evaluate(() =>
      [...document.querySelectorAll('.iu-root *')].map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const name =
          el.className instanceof SVGAnimatedString ? el.className.baseVal : el.className;
        return {
          at: [r.x, r.y],
          look: [
            el.tagName,
            name,
            Math.round(r.width),
            Math.round(r.height),
            s.padding,
            s.margin,
            s.borderWidth,
            s.backgroundColor,
            s.font,
          ].join(' '),
        };
      }),
    );
  }
  return shots;
}

test('an app-wide CSS reset outside any layer changes nothing in the editor', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  // No transitions or enter animations mid-way through a snapshot (DECISIONS #96).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEditor(page);
  // The first visit to each tool settles a pixel differently (chip glyphs); compare warm visits.
  await snapshot(page);
  const before = await snapshot(page);

  await page.addStyleTag({ content: HOSTILE_CSS });
  const after = await snapshot(page);

  for (const tool of TOOLS) {
    // Sizes and styles must match exactly; positions within a pixel (sub-pixel rounding).
    const changed = after[tool]!.flatMap((a, i) => {
      const b = before[tool]![i]!;
      const moved = a.at.some((v, k) => Math.abs(v - b.at[k]!) > 1);
      return a.look === b.look && !moved ? [] : [`${b.look} @${b.at}\n  → ${a.look} @${a.at}`];
    });
    expect(changed, `${tool}: elements that moved or changed`).toEqual([]);
  }
});
