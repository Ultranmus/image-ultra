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

- [x] 16 adjustments: brightness, contrast, saturation, vibrance, exposure, highlights, shadows,
      temperature, tint, hue, gamma, clarity, sharpen, blur, grain, vignette (dial + chip strip)
- [x] Curves (RGB + per channel, monotone cubic) & Levels (black / mid / white + histogram)
- [x] 28 filter presets (colour matrix + curves, stored in full in EditState) with live thumbnails,
      intensity dial
- [x] User-saved looks ("Save look" → shown in Filter tool; localStorage or controlled via props)
- [x] **AI #1 Auto-enhance** (no model): auto levels, gray-world white balance, vibrance/contrast/
      shadows/highlights — one undo step, fully editable afterwards
- [x] Multi-pass GPU pipeline for detail effects + matching CPU fallback
      **Exit:** real-time slider response on 20MP images. ✅ (single pass for colour; detail uses
      downsampled blurs — formal 20MP benchmark in Phase 7)

### Phase 5 — Annotate

- [x] Shapes: rectangle, ellipse, line, arrow, pen (smoothed + simplified), polygon, text, image
      (stickers/emoji reuse text + image shapes in Phase 6)
- [x] Select / move / resize (anchored opposite corner, rotated boxes) / rotate (snap 0/90, Shift 15°)
      / duplicate / delete; snapping + guides to frame and other shapes (Alt disables)
- [x] Inspector: colour, fill, width (S/M/L/XL + exact), opacity, corner radius, font, size, bold,
      alignment, arrow heads — popovers (Radix) + SwatchPicker with HSV, hex, eyedropper
- [x] Layers panel: select, show/hide, lock, bring forward / send backward
- [x] Annotations follow rotate/flip; stay sharp (vector) in preview and export; clipped by round crop
- [x] **AI-ready hook:** `MaskBrushOverlay` + core `drawMask` / `rasterizeMask` / `simplifyPoints`
      **Exit:** draw, edit text inline, layer ordering. ✅

### Phase 5.1 — Owner fixes (before Phase 6)

Details and suggested fixes in `BACKLOG.md` → "Next — fix before Phase 6".

- [x] Tooltips never clipped (portalled Tooltip component, replaces CSS `data-tooltip`)
- [x] Unsupported/broken images show the editor's own clear error (ICO etc.), never a framework error
- [x] Clicking an existing shape with any drawing tool switches to Select and selects it
- [x] New text boxes never vanish (start with "Text", selected)
- [x] Text tool: clicking an existing text box edits it instead of creating a new one
- [x] Context menu on shapes (canvas right-click + Layers "⋯"): unlock, show/hide, order,
      duplicate, delete, show in Layers — works for locked shapes too
      **Exit:** all six fixed + 4 from owner review, 46 e2e green. ✅ Approved 2026-09-25.

### Phase 6 — Extras

Approved 2026-09-25 (order below). Multi-select moved to Phase 7; Sticker added here (DECISIONS #62).

- [x] **6.1** Before/after compare (hold `\` or the Compare button; click = split view with a
      draggable divider), History popover (jump to any step), keyboard shortcuts popover (`?`)
- [x] **6.2** Redact (pixelate default / blur / solid; Box + Brush; select, move, resize, delete)
- [x] **6.3** Frames & borders; Fill = background colour/image behind transparent areas
- [x] **6.4** Watermark (text/image, position presets, tile, opacity); Sticker (built-in set + own
      images, placed like shapes)
- [x] **6.5** EXIF: stripped by default, `keepMetadata` export option; copy / paste shapes
      (⌘C / ⌘X / ⌘V, also between photos)

### Phase 7 — Polish

Approved 2026-09-26 (order below, commit after each step, owner review at the end; DECISIONS #80).

- [x] **7.1** Selection & layers: multi-select (Shift-click, marquee, ⌘A); the group moves,
      resizes, rotates, deletes, duplicates, copies/pastes as one; align & distribute; style
      several shapes at once. Layers: drag to reorder, rename, "Show all hidden", ⌘C/⌘X in the
      panel. Line endpoint handles clear of the arrow head; in-place text editor wraps like the canvas.
- [x] **7.2** Canvas & crop: Extend canvas in Resize (square / 4:5 / 16:9 / custom padding +
      anchor, Fill shows on the sides); zoom in crop view (wheel + pinch); vignette preview uses
      the crop; paste images from the system clipboard as image shapes. Group menu: right-click a
      multi-selection → group actions (owner, BACKLOG).
- [x] **7.2b** Unified elements (owner, 2026-09-26; DECISIONS #88): redaction areas and the watermark
      become elements in one ordered list with shapes — select, group, move, align, copy/paste,
      Layers, bring forward / send backward across types. A redact area blurs everything drawn
      below it (Canva-style). An app-locked watermark stays on top and isn't selectable. Old saved
      edits migrate (redactions at the bottom, watermark on top).
- [x] **7.3** Colour tools: histogram Before/After; filter thumbnails "on my edits"; arrow-key
      presses on one control coalesce into one undo step.
- [x] **7.4** Mobile (owner's phone test done 2026-09-27): 320–430px layouts, thumb-zone controls, no sideways-scrolling rows (Annotate,
      Adjust header), pinch / two-finger pan / long-press; owner tests on a real phone.
- [x] **7.5** A11y & motion (owner VoiceOver check pending) — approved 2026-09-27 (owner: "go"), commit after each step:
  - [x] **7.5a** axe in e2e: zero WCAG 2.2 A/AA violations in every tool + mode, every popover /
        panel, dark + light, desktop + 390px; fix findings (contrast → tokens + THEMING).
  - [x] **7.5b** Keyboard & focus: tab order, popover focus in/out, focus never lost when a button
        disappears (Crop, Watermark, mask brush overlays), unclipped focus rings, keyboard-only e2e
        flow; **Tab / Shift+Tab steps through elements in Select mode** (owner's choice).
  - [x] **7.5c** Screen readers: live announcements (undo/redo step, zoom, selection count, saving /
        saved, errors), slider value text, curve points, crop size, photo name + `?` hint; aria
        snapshots; owner VoiceOver spot check.
  - [x] **7.5d** Motion & touch: shimmer and every animation off with reduced motion (e2e checks),
        forced-colors outlines, **segmented switches + chips 36px on touch devices** (owner's choice).
- [x] **7.6** i18n & RTL — approved 2026-09-27 (owner: "go"), commit after each step:
  - [x] **7.6a** Every string through the typed labels: history step names, filter / size-preset /
        sticker / font / shape names (keyed by id; core takes names from the app), `filterPresets` +
        `sizePresets` props; **count labels may be `(count) => string`** (plurals, owner's choice);
        pseudo-locale e2e that fails on any unlabelled visible text or accessible name.
  - [x] **7.6b** RTL: `dir` prop (default: the page's), logical CSS properties, mirrored layout;
        photo / sliders / curves / levels / histograms / compare stay LTR; arrow keys follow the
        direction in rows; undo/redo icons swap; RTL text in text shapes + watermark (preview +
        export); axe + keyboard + layout checks in RTL. **Owner added (2026-09-27):** Hindi and Arabic
        in the playground Language switch (drafted translations, need native review), and the
        playground settings toolbar uses dropdowns for every option except the accent colours.
  - [x] **7.6c** (language part done in 7.6b — English · Hindi · Arabic · Pseudo; owner: the package ships English only, apps add languages — DECISIONS #99) Playground language switch: English · Arabic (RTL demo, drafted — needs native
        review) · pseudo-locale. English only ships. (The switch with English · pseudo was added in
        7.6a, owner asked to test from the UI.)
- [ ] **7.7** Perf: 20–24MP benchmark, downscaled preview while dragging, memory cleanup, tiled
      export above the GPU texture limit (preview stays downscaled). Approved 2026-09-27 (owner: "go"), commit after each step:
  - [x] **7.7a** Benchmark first (measure, don't guess): a playground page `/bench` + a Playwright
        script (`pnpm bench`, not part of `pnpm e2e`) using generated 12 / 24 / 48MP test photos
        (made at run time, not committed). Records: load → first paint, frame times while dragging
        Exposure / Sharpen / Curves / Rotate / crop (WebGL2 **and** Canvas2D fallback), export time
        per format, and JS heap / GPU memory estimate. Results table in `docs/internal/PERF.md`.
        Targets: first paint < 1s, drag ≥ 50fps median on WebGL2 and ≥ 20fps on Canvas2D, export of
        24MP JPEG < 3s — on the owner's Mac; the phone numbers are recorded, not gated.
        **Result (PERF.md):** WebGL2 meets every target at 12–48MP; the Canvas2D fallback drags
        colour at 3–9 fps (any photo size); WebP export 4s at 24MP (browser encoder).
  - [ ] **7.7b** _Proposed change after 7.7a (needs owner OK): lead with "fewer pixels while
        dragging" for the Canvas2D fallback (3 fps → target 20 fps); the screen-sized copy only if the
        owner's phone run of `/bench` shows GPU drags below 50 fps._ Preview-sized image: the preview samples a copy of the photo sized to the screen
        (about 2× the stage, "mipmap"), not the full 24MP texture. The full texture is used only when
        zoomed in past ~50%. Why: the preview cost follows the canvas size, but sampling a huge texture
        is slow and grainy when zoomed out; the Canvas2D fallback draws the full bitmap every frame.
        If 7.7a shows drags are still slow: a lower-resolution frame **only while dragging**, sharp
        again on release. Same for the histogram, redaction preview and "before" compare.
  - [ ] **7.7c** Memory cleanup: an audit that every `ImageBitmap`, texture, framebuffer and
        object URL is freed — photo swap, reset, tool change, unmount, StrictMode remount, fill /
        sticker / logo caches (Stage's fill-image cache is never closed today). e2e: load 10 photos in a
        row → heap stays flat (within ~1 photo). Undo history keeps JSON only (already true — check).
  - [ ] **7.7d** Tiled export: photos or outputs bigger than the GPU texture limit (16384px desktop,
        4096–8192 phones) export at **full size** — the output is rendered in tiles, each reading only
        its part of the source (with a margin for blur / sharpen so seams never show; grain and
        vignette use output coordinates, so they line up). Tiles go onto one 2D canvas, then encode.
        Limit: the browser's biggest canvas (~268MP Chrome/Firefox, ~16MP iOS Safari) — above it the
        export is scaled down and `ExportResult` says so (`downscaled: true`). e2e: a 20000px-wide
        photo exports at full size with no seams (pixel check across a tile edge vs. a small render).
  - Not in 7.7: Web Worker / OffscreenCanvas export and WebGPU (Phase 9 runtime may bring them).

### Phase 8 — Release

- [ ] Docs site in playground (guides, API reference, theming playground) — incl. a **Localization**
      guide: `labels` / full `Labels` typing / plurals / `dir` / app content names (DECISIONS #99)
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
