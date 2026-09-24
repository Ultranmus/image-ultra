# image-ultra — Master Plan

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done
> Update checkboxes as work lands. Log details in `PROGRESS.md`.

## Product in one sentence

A drop-in, fully typed React image editor that feels like a native pro photo app — Pintura-level polish,
Filerobot-level features plus more, free (MIT), themeable with CSS variables, SSR-safe for Next.js.

## Owner decisions (2026-09-24)

| Topic           | Decision                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Name            | `image-ultra` — packages `@image-ultra/core`, `@image-ultra/react` (npm org `image-ultra` must be created by owner before publish) |
| License         | MIT (free, incl. commercial use)                                                                                                   |
| Frameworks      | React/Next first. Web Component (Vue/Svelte/Angular) in Phase 9                                                                    |
| AI              | Future scope only — see `AI_ROADMAP.md`                                                                                            |
| Package manager | pnpm (via corepack)                                                                                                                |

## Stack (pinned at setup, 2026-09-24)

TypeScript 6.0 strict (see DECISIONS #11) · React 19 (peer `^18 || ^19`) · Next.js 16 playground · Zustand 5 + Immer (state, snapshot history) ·
Radix primitives (a11y behaviour only, unstyled) · plain CSS + tokens · tsup (ESM+CJS+d.ts) ·
pnpm workspaces + Turborepo · Vitest · Playwright · ESLint flat + Prettier · Changesets · GitHub Actions.

## Architecture

```
@image-ultra/react   <ImageEditor/>, <ImageEditorModal/>, useImageEditor(), CSS theme, icons
        │ depends on
@image-ultra/core    EditState types · store + history · renderer (WebGL2 → Canvas2D fallback)
                     · export · loaders (EXIF) · plugin API · headless renderImage()
```

- **EditState** = the single serializable JSON describing all edits. Source image never mutated.
- Render pipeline order: orientation → crop/rotate/flip/perspective → resize → finetune → filter
  → redact → fill/frame → annotations → watermark.
- Tools are plugins internally too (`defineTool`) so built-ins and user tools share one API.

## Repo layout

```
packages/core  packages/react  packages/plugin-ai (later)
apps/playground (Next.js)  apps/storybook (later)
docs/internal (these notes)
```

## Phases

### Phase 1 — Foundation

- [x] Monorepo: pnpm workspace, turbo, tsconfig base, eslint, prettier, changesets, CI
- [x] `@image-ultra/core` + `@image-ultra/react` package skeletons building ESM/CJS/d.ts
- [x] Theme tokens CSS (dark/light/auto) per `THEMING.md`
- [x] Editor shell: TopBar, ToolRail, Stage, ControlBar per `UI_VISION.md`
- [x] Image loading (URL / File / Blob / HTMLImageElement), EXIF orientation
- [x] Stage zoom / pan / fit (wheel, pinch, keyboard)
- [x] Next.js playground rendering the editor
      **Exit:** load an image in playground, zoom/pan smoothly, switch theme.

### Phase 2 — Core engine

- [x] `EditState` types + defaults + validation (`parseEditState`)
- [x] Store (Zustand vanilla) + undo/redo with Immer **snapshots** (DECISIONS #20), `beginChange`/`endChange` so a slider drag = one step
- [x] WebGL2 renderer + Canvas2D fallback, render-on-demand (rAF batching), pixel-parity e2e test
- [x] Export: PNG/JPEG/WebP, quality, max size, filename, `onSave` typed result
- [x] Headless `renderImage(src, state)`
- [x] **AI-ready hooks:** `runTask` (progress + cancel via `AbortSignal`), `EditState.assets` registry
- [ ] Plugin/tool registration API (`defineTool`) — moved to Phase 3, where the first real tool needs it
      **Exit:** undo/redo works, export matches preview.

### Phase 3 — Adjust

- [x] Crop box (8 handles, drag-anywhere move, free/fixed ratio, 9 ratio presets + Original + Circle),
      view animates back to centre after a handle drag
- [x] Straighten dial (RulerSlider, −45…45°, 0.1° precision, snaps to 0), rotate left, flip H/V
      — all exact "as seen on screen", even combined with crop/tilt (unit-tested)
- [x] Perspective / tilt (vertical + horizontal, ±30°) — auto-crop keeps corners filled
- [x] Resize with ratio lock, 50%, 8 social size presets (crop + resize in one step), upscale warning
- [x] `defineTool` plugin API — built-in tools use it; custom tools can be passed to `tools`
- [x] Signature controls: RulerSlider, SegmentedControl, PresetStrip (+AspectGlyph), NumberField
      **Exit:** crop experience at Pintura level on desktop + touch. ✅ (mobile row polish → Phase 7)

### Phase 4 — Finetune + Filters

- [ ] Finetune sliders: brightness, contrast, saturation, exposure, temperature/warmth, tint, hue,
      gamma, clarity, sharpen, blur, noise/grain, vignette
- [ ] Curves & levels (advanced)
- [ ] ~30 filter presets (LUT/matrix based) with live thumbnails, intensity slider
- [ ] User-saved adjustment presets
- [ ] **AI #1 Auto-enhance** (no model, lives in core): histogram auto-levels, auto white balance,
      auto contrast/vibrance → sets finetune values (fully editable afterwards). "Auto" button in Finetune
      **Exit:** real-time slider response on 20MP images.

### Phase 5 — Annotate

- [ ] Shapes: rect, ellipse, polygon, line, arrow, pen (smoothed), text, image, sticker/emoji
- [ ] Select / move / resize / rotate / duplicate / delete, snapping & guides
- [ ] Inspector: fill, stroke, width, opacity, corner radius, font, alignment
- [ ] Layers panel: reorder, lock, hide
- [ ] **AI-ready hook:** reusable brush/mask tool (paint + erase mask) — needed later by Object eraser
      **Exit:** draw, edit text inline, layer ordering.

### Phase 6 — Extras

- [ ] Watermark (text/image, position presets, tile, opacity)
- [ ] Redact (blur / pixelate / solid)
- [ ] Frames & borders, background fill (color/image)
- [ ] Before/after compare (hold + split slider)
- [ ] History panel, keyboard shortcuts + help overlay
- [ ] EXIF strip option on export

### Phase 7 — Polish

- [ ] Mobile layout & thumb-zone controls, gestures
- [ ] Motion pass, reduced-motion
- [ ] A11y audit (WCAG AA), focus management, screen-reader labels
- [ ] i18n (typed translation object), RTL
- [ ] Perf: large images (tiling/downscaled preview), memory cleanup

### Phase 8 — Release

- [ ] Docs site in playground (guides, API reference, theming playground)
- [ ] Examples: Next App Router, Vite, Remix/React Router
- [ ] Changesets, npm publish, README, LICENSE

### Phase 9 — AI (`@image-ultra/plugin-ai`, optional package)

Full spec per feature in `AI_ROADMAP.md`. Every feature: works in-browser **or** via the consumer's own
backend, downloads models only on first use, shows progress, is cancellable, and its result is undoable.

**9A — AI foundation**

- [ ] Package skeleton, `aiPlugin({...})` typed config, per-feature `mode: 'browser' | 'backend'`
- [ ] Model runtime: ONNX Runtime Web with WebGPU → WASM fallback, runs in a Web Worker
- [ ] Model loader: lazy download, progress events, Cache Storage caching, self-hostable model URLs
- [ ] Backend adapter type: `(input: AiRequest, signal: AbortSignal) => Promise<AiResult>`
- [ ] Capability detection (WebGPU / memory) → auto-pick mode or hide feature
- [ ] UI: "Magic" tool in ToolRail + progress/cancel pattern (UI_VISION §10)
- [ ] License audit of every model before adoption (MIT / Apache-2.0 / BSD only for defaults)

**9B — Detection features (lighter models)**

- [ ] **AI #2 Background removal** — cut-out, transparent PNG, or replace with colour/image/blur (links to Fill)
- [ ] **AI #3 Smart crop** — face/subject detection → crop presets keep subject in frame (links to Adjust)
- [ ] **AI #8 Auto redact** — detect faces / licence plates / text → one tap blur/pixelate (links to Redact)

**9C — Generative pixel features (heavy models)**

- [ ] **AI #4 Object eraser** — paint mask (Phase 5 brush) → inpaint; tiled for large images
- [ ] **AI #5 Upscale** — 2× / 4× super-resolution; backend recommended above ~4MP

**9D — Language features (backend only, consumer brings the model/API)**

- [ ] **AI #6 Alt-text / captions** — generated on save, returned in `onSave` result, editable before save
- [ ] **AI #7 Prompt edit** (experimental) — "make the sky sunset" → consumer's image-gen endpoint,
      result shown as a before/after preview the user accepts or discards

**Exit:** each feature demoed in the playground in both modes (where applicable), no increase in
`@image-ultra/react` bundle size when the plugin isn't installed.

### Phase 10 — Later

- [ ] `@image-ultra/vanilla` Web Component (Vue/Svelte/Angular)
