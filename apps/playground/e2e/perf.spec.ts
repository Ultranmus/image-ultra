import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';

// The Canvas2D fallback: a browser without WebGL (Phase 7.7b, PERF.md).
test.use({ launchOptions: { args: ['--disable-webgl'] } });

/** Backing-store widths of the photo and redaction canvases, and the full-quality width. */
function canvasWidths(page: Page) {
  return page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const [photo, redactions] = [
      document.querySelector<HTMLCanvasElement>('.iu-stage__canvas:not(.iu-stage__background)')!,
      document.querySelector<HTMLCanvasElement>('.iu-stage__redactions')!,
    ];
    return {
      photo: photo.width,
      redactions: redactions.width,
      full: Math.round(photo.getBoundingClientRect().width * devicePixelRatio),
    };
  });
}

test('Canvas2D preview draws fewer pixels while dragging, sharp again on release', async ({
  page,
}) => {
  await openEditor(page);
  expect(await page.evaluate(() => !document.createElement('canvas').getContext('webgl2'))).toBe(
    true,
  );

  const before = await canvasWidths(page);
  expect(before.photo).toBe(before.full);

  await page.evaluate(() => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    // A redaction area, so its layer is drawn (an unused layer is 1×1).
    editor.update('Redact', (s) => {
      s.annotations.push({
        type: 'redact',
        kind: 'box',
        id: 'r',
        style: 'pixelate',
        strength: 0.1,
        color: '#000',
        rotation: 0,
        opacity: 1,
        x: 10,
        y: 10,
        width: 200,
        height: 200,
      });
    });
    const store = editor.store;
    store.getState().beginChange('Exposure');
    store.getState().update('Exposure', (s) => {
      s.finetune.exposure = 0.5;
    });
  });
  const dragging = await canvasWidths(page);
  expect(dragging.photo).toBeLessThan(before.full);
  // Redaction layer follows the photo canvas (it's drawn from it).
  expect(dragging.redactions).toBe(dragging.photo);

  await page.evaluate(() =>
    (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState().endChange(),
  );
  const released = await canvasWidths(page);
  expect(released.photo).toBe(before.full);
  expect(released.redactions).toBe(before.full);
});
