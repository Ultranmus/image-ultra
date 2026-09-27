# @image-ultra/react

A free, fully typed image editor component for React and Next.js. Crop, rotate, adjust, filter,
annotate, redact, add stickers, frames and watermarks, then save the result. Every edit is
non-destructive and serializable, so you can store it as JSON and open it again later.

- **Typed end to end**: TypeScript strict, no `any` in the public API.
- **Non-destructive**: edits are a JSON `EditState`; the source photo is never changed.
- **Fast**: WebGL2 rendering with a Canvas2D fallback. Tested with 48MP photos on desktop and iPhone.
- **Themeable**: plain CSS variables (`--iu-*`) in a CSS layer; dark, light or follow the OS.
- **Accessible**: keyboard and screen-reader support, reduced motion, tested with axe (WCAG 2.2 AA).
- **Any language**: every string is a typed label; right-to-left layouts.
- **Next.js ready**: SSR-safe, ships as a Client Component.

MIT licensed.

## Install

```sh
npm install @image-ultra/react
# or: pnpm add @image-ultra/react / yarn add @image-ultra/react
```

React 18.2 or 19 is required.

## Quick start

```tsx
import { ImageEditor } from '@image-ultra/react';
import '@image-ultra/react/styles.css';

export function PhotoEditor() {
  return (
    <div style={{ height: 600 }}>
      <ImageEditor
        src="/photo.jpg"
        onSave={(result) => {
          // result.blob is the edited image; result.state is the edits as JSON.
          const url = URL.createObjectURL(result.blob);
          window.open(url);
        }}
      />
    </div>
  );
}
```

The editor fills its container, so give the container a height (at least 480 × 320 px).
Import the stylesheet once, anywhere in your app.

### Next.js (App Router)

The package is marked `'use client'`, so you can render `<ImageEditor>` from a Server Component
page. Import `@image-ultra/react/styles.css` in your root layout.

## Save and restore edits

`onSave` gives you the exported image and the edits that produced it. Store the edits (they're
plain JSON) and pass them back to open the photo with every edit still editable:

```tsx
<ImageEditor
  src={photoUrl}
  initialState={savedEdits} // result.state from an earlier onSave, or its JSON
  exportOptions={{ mimeType: 'image/jpeg', quality: 0.9, maxWidth: 4000 }}
  onSave={async ({ blob, state }) => {
    await upload(blob);
    await saveEdits(JSON.stringify(state));
  }}
/>
```

`initialState` accepts untrusted JSON: it's validated, and anything unknown is dropped.

### Render without the editor

Apply saved edits to a photo with no UI, for example to regenerate an image at another size:

```ts
import { renderImage } from '@image-ultra/react';

const { blob } = await renderImage('/photo.jpg', savedEdits, { mimeType: 'image/webp' });
```

## Control it from your own UI

```tsx
import { ImageEditor, useImageEditor } from '@image-ultra/react';

const editor = useImageEditor();

<ImageEditor ref={editor} src={src} />
<button onClick={() => editor.current?.undo()}>Undo</button>
<button onClick={() => editor.current?.save()}>Save</button>
```

The handle has `getState`, `setState`, `update`, `undo`, `redo`, `reset`, `exportImage`, `save`
and `store` (the underlying state store, for advanced use).

## Choose the tools

```tsx
<ImageEditor src={src} tools={['adjust', 'finetune', 'filter', 'annotate']} defaultTool="adjust" />
```

Built-in tools: `adjust` (crop, rotate, flip, straighten), `finetune` (light, colour, curves,
levels), `filter`, `annotate`, `redact`, `sticker`, `frame`, `fill`, `resize`, `watermark`. You can
add your own with `defineTool`, using the same controls the built-in tools use (`RulerSlider`,
`SegmentedControl`, `PresetStrip` and more).

## Theme

```tsx
<ImageEditor theme="light" themeOverrides={{ accent: '#ff5a1f', radius: '10px' }} />
```

`theme` is `'dark'` (default), `'light'` or `'auto'`. For full control, set any `--iu-*` CSS
variable on `.iu-root`. All styles live in the `image-ultra` CSS layer, so your own CSS wins
without `!important`.

## Languages

English is built in. Pass `labels` to translate or rename any text; pass the full `Labels` type
to have TypeScript catch missing strings. Counts can be functions for plural rules.

```tsx
import type { LabelOverrides } from '@image-ultra/react';

const labels: LabelOverrides = { done: 'Fertig', cancel: 'Abbrechen' };

<ImageEditor labels={labels} dir="ltr" />;
```

For right-to-left languages pass `dir="rtl"` (or let the editor inherit the page's direction).

## Good to know

- **Big photos**: the preview uses a smaller copy of very large photos and loads full detail when
  you zoom in. Exports are full size. Photos above the GPU's texture limit are exported in tiles.
  If the browser can't hold the output canvas (about 16.7 MP on iPhones), the result is scaled down
  and `result.downscaled` is `true`.
- **Formats**: anything the browser can decode (JPEG, PNG, WebP, GIF, AVIF, BMP, ICO, SVG; HEIC in
  Safari). Output is JPEG, PNG or WebP. Safari on iOS can't encode WebP and gives PNG instead;
  `result.mimeType` says which you got.
- **Metadata**: exports carry no EXIF by default. `exportOptions.keepMetadata: true` keeps the
  source JPEG's EXIF (without GPS unless you pass `{ location: true }`).

## License

MIT
