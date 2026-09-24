# image-ultra — AI Spec (in plan: Phase 9, plus auto-enhance in Phase 4)

Status: **all 8 features are in scope** (owner decision, 2026-09-24).

## Principles

- **Optional package.** `@image-ultra/plugin-ai`. Apps that don't install it pay zero bytes.
- **Two modes per feature**, chosen by the consumer:
  - `browser` — ONNX Runtime Web (WebGPU → WASM fallback) in a Web Worker. Private, no server cost.
    Model downloaded on first use, cached in Cache Storage, URLs self-hostable.
  - `backend` — consumer passes an async function. We never ship or ask for API keys.
- **Never block the UI.** Progress shown, cancel always available, editor stays usable.
- **Everything undoable.** AI output is one history entry; results go into `EditState` (see below).
- **Editable results.** Where possible AI produces _parameters_ (finetune values, crop rect, redact
  regions) the user can tweak — not baked pixels.
- **Licenses first.** Default models must be MIT / Apache-2.0 / BSD. Non-commercial or AGPL models
  may only be offered as "bring your own model URL", never as defaults.

## How AI results fit the non-destructive model

| Result type        | Features                              | Stored as                                           |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| Parameters         | Auto-enhance, Smart crop, Auto redact | Normal `EditState` values (finetune, crop, redacts) |
| Mask               | Background removal                    | `assets[id]` alpha mask + `background` setting      |
| Replacement pixels | Object eraser, Prompt edit            | `assets[id]` raster patch + position                |
| Replaced source    | Upscale                               | `assets[id]` becomes the new base image             |
| Metadata           | Alt-text                              | `meta.altText`, returned in `onSave`                |

`EditState.assets` holds generated rasters by id (with input hash + model id). Saved states can
embed them or reference them; re-running is possible because the inputs are recorded.

## Features

### 1. Auto-enhance — Phase 4 (core, no model)

- **User:** taps "Auto" in Finetune → photo looks better instantly; sliders move to show what changed.
- **How:** histogram analysis → auto levels, white balance (gray-world / white-patch), contrast, vibrance.
- **Modes:** runs locally always (no ML).
- **Done when:** result is fully editable via the normal sliders; one undo step.

### 2. Background removal — 9B

- **User:** Magic → "Remove background" → subject cut out; then transparent, colour, image, or blurred bg.
- **How:** salient-object / portrait segmentation model → alpha mask; edge refinement (guided filter).
- **Modes:** browser (default), backend.
- **UI links:** Fill tool gets "Replace background" options when a mask exists.
- **Done when:** clean hair/edge quality on portraits, exports transparent PNG/WebP.

### 3. Smart crop — 9B

- **User:** in Adjust, crop presets (1:1, 9:16, social sizes) centre on faces/subject automatically.
- **How:** face detection + saliency map → best crop rect for each ratio.
- **Modes:** browser (light model), backend.
- **Done when:** produces a normal crop rect the user can still drag.

### 4. Object eraser — 9C

- **User:** Magic → "Erase" → brush over a person/object → it disappears with a natural fill.
- **How:** Phase 5 brush/mask tool → inpainting model on a tile around the mask, blended back.
- **Modes:** browser (WebGPU recommended), backend.
- **Done when:** works on 20MP images via tiling; each stroke-apply is one undo step.

### 5. Upscale — 9C

- **User:** Resize → "Enhance 2× / 4×" → bigger, sharper image.
- **How:** super-resolution model, tiled.
- **Modes:** browser for small images, backend recommended above ~4MP.
- **Done when:** output size and memory limits are guarded with a clear message.

### 6. Alt-text / captions — 9D

- **User:** on Done, an editable "Description" field is pre-filled for accessibility.
- **How:** consumer's vision-language endpoint (any provider).
- **Modes:** backend only.
- **Done when:** `onSave` result includes `altText`; the user can edit before saving.

### 7. Prompt edit (experimental) — 9D

- **User:** Magic → types "make the sky sunset" → preview with before/after → Accept or Discard.
- **How:** consumer's image-generation/edit endpoint, optional mask from the brush tool.
- **Modes:** backend only.
- **Done when:** accept = one undo step, discard leaves no trace.

### 8. Auto redact — 9B

- **User:** in Redact, "Detect" finds faces, licence plates and text; one tap blurs/pixelates all,
  each region toggleable.
- **How:** face + text + plate detection models → redact regions.
- **Modes:** browser (default), backend.
- **Done when:** regions are normal redact shapes the user can move/delete.

## Public API sketch

```ts
import { aiPlugin } from '@image-ultra/plugin-ai';

<ImageEditor
  plugins={[
    aiPlugin({
      removeBackground: { mode: 'browser' },
      smartCrop: { mode: 'browser' },
      autoRedact: { mode: 'browser', detect: ['faces', 'plates', 'text'] },
      eraser: { mode: 'backend', run: (req, signal) => myInpaint(req, signal) },
      upscale: { mode: 'backend', run: myUpscale },
      altText: { run: myCaption },
      promptEdit: { run: myImageEdit },
      modelBaseUrl: '/models', // optional self-hosting
    }),
  ]}
/>;
```

## Open questions (ask owner before Phase 9 starts)

- Which backend examples to ship in the docs (e.g. a Next.js route handler)?
- Should the playground host demo models, or document self-hosting only?
