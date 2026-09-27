# @image-ultra/core

The framework-independent engine behind [`@image-ultra/react`](https://www.npmjs.com/package/@image-ultra/react):
the edit state, image loading, WebGL2 / Canvas2D rendering, export and the editor store.

Docs and API reference: [imageultra.ashvattech.com](https://imageultra.ashvattech.com/reference)

**Most apps only need `@image-ultra/react`**, which re-exports the parts of this package you're
likely to use. Install `@image-ultra/core` directly to render saved edits without React (for
example a script that regenerates images from saved edits), or to build your own editor UI on the
store.

MIT licensed.

## Install

```sh
npm install @image-ultra/core
```

## Apply saved edits without a UI

```ts
import { renderImage } from '@image-ultra/core';

// `savedEdits` is an EditState, or its JSON from an earlier save (it's validated).
const result = await renderImage('/photo.jpg', savedEdits, {
  mimeType: 'image/jpeg',
  quality: 0.9,
  maxWidth: 2000,
});
result.blob; // the edited image
```

Rendering runs in the browser (it needs a canvas). Importing the package is safe on the server:
nothing touches `window` until you call a browser function.

## Work with edit state

Edits are plain, versioned JSON (`EditState`): geometry, colour, filter, elements on the photo,
frame, fill, watermark and output size. The source image is never changed.

```ts
import { createEditState, parseEditState, EditStateError } from '@image-ultra/core';

const state = createEditState();
state.geometry.rotation = 90;
state.finetune.exposure = 0.2;

const json = JSON.stringify(state);

try {
  const restored = parseEditState(JSON.parse(json)); // validates untrusted input
} catch (error) {
  if (error instanceof EditStateError) console.warn(error.message);
}
```

## The editor store

`createEditorStore()` holds everything an editor UI needs (image, edits, undo history, viewport,
active tool) with no UI attached. `@image-ultra/react` is built on it.

## Stable API

Everything exported from `@image-ultra/core` follows semantic versioning. The
`@image-ultra/core/internal` entry point exists for `@image-ultra/react` and may change in any
release; don't depend on it.

## License

MIT
