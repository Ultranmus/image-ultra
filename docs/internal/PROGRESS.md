# image-ultra — Progress Log

Append one entry per work session: date · phase · what was done · what's next · open issues.

## 2026-09-24 · Planning

- Plan agreed with owner. Decisions recorded in `DECISIONS.md` (name, MIT, React-first, AI later, pnpm).
- Wrote internal docs: `PLAN.md`, `UI_VISION.md`, `THEMING.md`, `DECISIONS.md`, `AI_ROADMAP.md`, root `CLAUDE.md`.
- Enabled pnpm 12.6 via corepack. Verified `image-ultra`, `@image-ultra/core`, `@image-ultra/react` unclaimed on npm.
- Latest versions seen: react 19.3.0, next 16.3.6, typescript 7.0.2, zustand 5.0.15, immer 11.1.18, turbo 2.11.3, vitest 5.0.1, tsup 8.5.1.
- **Next:** Phase 1 — Foundation.

## 2026-09-24 · Phase 1 — Foundation ✅ (awaiting owner review)

**Done**

- Monorepo: pnpm 12 workspace + Turborepo, `tsconfig.base.json` (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESLint flat config in TS (`eslint.config.ts`), Prettier, Changesets (core+react versioned together), GitHub Actions CI, MIT LICENSE.
- `@image-ultra/core` (no React): `loadImage` (URL/Blob/File/img/canvas/bitmap, EXIF via `createImageBitmap`, abortable, CORS fallback to `<img>`), viewport math (`fitViewport`, `zoomAt`, `clampViewport`, …) with 4 Vitest tests, `createEditorStore` (Zustand vanilla: status, image, activeTool, stageSize, viewport, animated zoom/fit, reduced-motion aware, cleans up bitmaps).
- `@image-ultra/react`: `<ImageEditor>` with props `src, theme, themeOverrides, tools, defaultTool, labels, onCancel, onDone`; `TopBar`, `ToolRail` (WAI-ARIA tabs, arrow keys), `Stage` (DPR-aware canvas, checkerboard, wheel/pinch zoom, drag pan, double-click, drop zone + file picker, delayed skeleton, error state), `ControlBar` placeholder; own icon set (`icons/Icon.tsx`); typed `Labels` for i18n; `ThemeOverrides` → CSS vars.
- CSS: `tokens.css` (dark/light/auto, matches THEMING.md), `layout.css` (container-query mobile layout, rail at bottom < 768px), `controls.css` (buttons, CSS tooltip), `stage.css`. Shipped as `@image-ultra/react/styles.css`, all in `@layer image-ultra`. JS bundle has a `'use client'` banner.
- Playground (`apps/playground`, Next 16, port 3100): theme / frame-width / accent switchers, sample / broken URL / empty sources. Static prerender passes, so SSR is safe.
- Verified: lint, prettier, build, typecheck, tests all green. Playwright screenshots checked for dark, zoomed, light+phone, empty, error.

**Notes / open issues**

- Tokens added beyond THEMING.md: `--iu-checker-a/b`, `--iu-font-fallback`, `--iu-size-rail-mobile` → add to THEMING.md.
- Tooltips are CSS-only (`data-tooltip`), placed below the element. Revisit placement for the bottom rail in Phase 7.
- Reset/Undo/Redo buttons are rendered but disabled until Phase 2.
- Sample image: `apps/playground/public/sample.jpg` from picsum.photos (Unsplash license), dev only.

**Next:** Phase 2 — EditState types, history (undo/redo), WebGL2 renderer, export + `onSave`.

## 2026-09-24 · Plan update — AI in scope

- Owner asked for all AI features to be part of the plan.
- `PLAN.md`: new Phase 9 (9A foundation, 9B detection, 9C generative, 9D language); Web Component moved
  to Phase 10; auto-enhance added to Phase 4; AI hooks added to Phase 2 (async actions, assets) and
  Phase 5 (brush/mask).
- `AI_ROADMAP.md` rewritten as a full spec per feature. `UI_VISION.md` §10 covers AI UI.
  `DECISIONS.md` #17–18.
- **Next:** still Phase 2 (after owner reviews Phase 1).

## 2026-09-24 · Brand accent → plum `#4d194d`

- Tokens updated (dark tints + light exact), new `--iu-accent-text` token (+ `accentText` override), rail
  selected state uses it. THEMING.md has the contrast table. Playground's first swatch = built-in default.

## 2026-09-24 · Phase 2 — Core engine ✅ (awaiting owner review)

**Done**

- `EditState` v1 (`state/editState.ts`): geometry (rotation 90° steps, flipX/Y, straighten ±45°, crop),
  finetune (brightness, contrast, saturation, exposure, temperature, tint, gamma, vignette), `assets`
  registry for future AI rasters. `parseEditState` validates/clamps untrusted JSON.
- Geometry math (`state/geometry.ts`): affine helpers + `getOutputToSource` — one matrix drives both renderers.
- Renderers (`render/`): `WebGLRenderer` (single-pass shader, mipmaps, crisp pixels ≥300% zoom, context-loss
  handling, oversize downscale) and `Canvas2DRenderer` fallback (CPU colour pass); `createRenderer` picks.
- Export (`export/exportImage.ts`): PNG/JPEG/WebP, quality, max size, file name, JPEG background;
  headless `renderImage(source, state, options)`.
- Store: `edit`, `initialEdit`, snapshot `history`, `update`, `beginChange/endChange/cancelChange`,
  `undo/redo/reset`, `replaceEdit`, `exportImage`, `runTask/cancelTask` (+ `tasks`), selectors
  `selectCanUndo/CanRedo/IsDirty`. Viewport now frames the edited output and re-fits when its size changes.
- React: Stage renders through the core renderer; TopBar Undo/Redo/Reset live, Done exports ("Saving…" after
  300ms); `ImageEditor` props `initialState`, `exportOptions`, `onSave`, `onChange`, `onError`; ref handle
  `ImageEditorHandle` + `useImageEditor()`; ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z, Ctrl+Y. React package re-exports core API.
- Playground dev panel (geometry buttons, finetune sliders, history, keep/reopen state, export format + result).
- Tests: 25 unit (Vitest) + 6 e2e (Playwright: renderer parity, undo/redo + shortcuts, one-step slider drag,
  Done export size, restore saved state). E2E wired into turbo (`pnpm e2e`) and CI.

**Notes / open issues**

- Straighten currently leaves transparent corners unless cropped — Phase 3 auto-fits the crop.
- Plugin/tool registration API moved to Phase 3.
- Playwright webServer runs `next` directly: `pnpm start` didn't forward SIGTERM and stalled teardown.
- `apps/playground/AGENTS.md` + `CLAUDE.md` were generated by Next 16; `agentRules: false` is set, owner can delete them.

**Next:** Phase 3 — Adjust (crop box, rotation dial, flip, perspective, resize, `defineTool`).

## 2026-09-24 · Phase 3 — Adjust ✅ (awaiting owner review)

**Done**

- Core: `EditState.geometry` gained `perspective`, `cropAspect`, `cropShape` (`rect`/`ellipse`);
  top-level `resize`. Geometry moved to projective `Mat3` (`getSourceToOriented`, `getImageQuad`,
  `getImageBounds`, `getOutputToSource(image, state)`). New `cropMath.ts`: `cropFits`, `largestFit`,
  `fitCrop`, `moveCrop`, `resizeCrop`, `cropForAspect`, `rotateGeometry`, `flipGeometry`,
  `syncResizeToCrop`. Store: `activeTool: string`, `cropView` + `setCropView`.
- Renderers: shader perspective divide + ellipse mask (anti-aliased), transparent (no checker) outside
  the image; Canvas2D mesh warp for perspective, ellipse clip, checker clipped to the image.
- React: `defineTool` + `BUILT_IN_TOOLS` + `resolveTools`; `Adjust` (AdjustControls + CropOverlay) and
  `Resize` (ResizeControls) tools; other tools are "coming soon" placeholders. New shared controls:
  `RulerSlider`, `SegmentedControl`, `PresetStrip` + `AspectGlyph`, `NumberField` (all exported for
  custom tools). New tokens: `--iu-warning`, `--iu-crop-shade/frame/grid`; ControlBar 136px.
- Playground: dev panel lost its geometry buttons (real UI now); finetune sliders stay until Phase 4.
- Tests: 41 unit (incl. exact rotate/flip equivalence with crop + straighten + tilt) + 17 e2e
  (handle drag = 1 undo step + re-centre, move stops at edges, aspect chips, straighten/tilt keep
  corners opaque, circle export, rotate/flip/reset, resize width/lock, social preset, upscale warning,
  GPU vs mesh-fallback perspective parity).

**Notes / open issues**

- Phone width: the Adjust top row scrolls horizontally (labels clipped) → Phase 7 mobile pass.
- Vignette in crop view is computed over the whole image, not the crop (result view is correct).
- Crop view has no zoom (wheel/pinch) — Pintura-style "zoom into crop" could come in Phase 7.
- Keyboard: each arrow press on the dial/crop is its own undo step (press+release = one change).

**Next:** Phase 4 — Finetune + Filters (real Finetune tool with RulerSliders, curves/levels, ~30
filter presets with thumbnails, user presets, AI #1 auto-enhance).

## 2026-09-24 · Phase 4 — Finetune + Filters ✅ (awaiting owner review)

**Done**

- Core state: 16 finetune keys with per-key ranges (`FINETUNE_RANGES`), `levels`, `curves`, self-contained
  `filter`; `parseEditState` validates all of it. New modules: `state/curves.ts` (monotone cubic curves,
  levels, tone LUT), `filters/presets.ts` (28 looks: colour / film / mono), `state/looks.ts`,
  `analysis/analyze.ts` (histogram, Auto-enhance, `renderAnalysisPixels`), `render/thumbnails.ts`
  (one GPU context for all thumbnails), `render/blur.ts` (CPU Gaussian approximation).
- Colour pipeline rewritten around `compileColor` → `ColorProgram` (`colorPixel`, `detailPixel`,
  `finishPixel`) mirrored in GLSL; WebGL renderer now has 3 programs (main / blur / finish), render
  targets, LUT texture; Canvas2D renderer runs the same stages on the CPU. Export refactored into
  `renderToCanvas` + encode.
- React: Finetune tool (Adjust chips + dial, Curves editor, Levels editor, ✨ Auto, inline Save look),
  Filter tool (live thumbnails, intensity, My looks with remove), `useLooks`, `useHistogram`,
  `useThumbnailRenderer`; props `looks` / `onLooksChange` / `persistLooks`; labels for everything.
  Tokens: `--iu-channel-*`; ControlBar 148px; `IconButton size="sm"`.
- Playground dev panel is now only history / state / export.
- Tests: 60 unit + 25 e2e (new: colour-stage parity ≤3/255 incl. filter/levels/curves/grain/round
  crop, detail parity, dial drag = 1 step, finetune dial, Auto = 1 step + undo, curve point add/delete,
  levels keyboard, filter + intensity, looks save/apply/persist/delete).

**Notes / open issues**

- Histogram (Curves/Levels) shows the image before colour edits (geometry only) — by design, like an
  input histogram; could add an "after" toggle later.
- Filter thumbnails show each look on the plain image (not on top of the user's finetune).
- `SIZE_PRESETS` and filter preset names are English-only (see #34).
- Keyboard: each arrow press on dials/points is its own undo step.

**Next:** Phase 5 — Annotate (shapes, text, pen, arrows, selection/transform, inspector, layers,
brush/mask tool for the future AI eraser).

## 2026-09-24 · Backlog created

- Moved all "fix later" notes from Phases 2–4 into `docs/internal/BACKLOG.md` (11 items, most
  planned for Phase 7). CLAUDE.md now points to it; Phase 7 includes working through it.

## 2026-09-24 · Phase 4 follow-up (owner feedback)

- Saved looks were hard to find (end of the Filter strip). Now: own looks right after "Original" with
  a bookmark badge + divider; Finetune shows "Saved “Name” · View in Filters" after saving.
  Storage unchanged: browser localStorage `image-ultra:looks`, or app-controlled via props.
- Fixed Adjust/Curves/Levels segmented box stretching to fill its grid column (extra empty space).
- New shared bits: `Preset.separatorBefore`, `Preset.badge`, `.iu-notice` / `.iu-link`.
- 25/25 e2e pass (looks test now covers the notice, the link and the order).

## 2026-09-24 · Phase 5 — Annotate ✅ (awaiting owner review)

**Done**

- Core: `state/annotations.ts` (shape types, boxes/corners/bounds, hit testing, move/resize incl.
  rotated anchor, rotate/flip with the photo, names), `state/parseAnnotations.ts` (safe parsing),
  `state/strokes.ts` (RDP simplify, smooth tracing, `drawMask`, `rasterizeMask`),
  `render/annotations.ts` (drawing, text layout/wrap, arrow heads, assets + fonts loading,
  `getOrientedToOutput`). Export draws annotations (clipped by round crop). Store: `toolState`.
- React: Annotate tool (AnnotateControls, AnnotateOverlay, LayersPanel, snapping, state/factories),
  Stage annotation canvas layer, `Popover` (Radix), `SwatchPicker` + `ColorButton` (HSV, hex,
  eyedropper), `useToolState`, `useFonts` + `fonts` prop, `MaskBrushOverlay`, new icons + labels.
  Adjust tool's rotate/flip now carry annotations.
- Fixes found while testing: text box blurred instantly on creation (focus race); shortcuts didn't
  work after clicking the photo (stage/overlay now take focus); Escape in a popover deselected the
  shape.
- Tests: 70 unit + 34 e2e (new: draw/export, click-to-default, select/move/resize/delete/undo,
  text create/edit/empty-discard, pen simplify + polygon Enter, keyboard R/⌘D/Esc, layers hide/lock,
  rotate photo carries shapes).

**Notes / open issues** → see BACKLOG.md "From Phase 5".

**Next:** Phase 6 — Extras (watermark, redact, frames, fill, stickers, compare, history panel,
shortcuts overlay, EXIF option, copy/paste shapes).

## 2026-09-24 · Phase 5 follow-up (owner report)

- React warning "Updating a style property during rerender (font) when a conflicting property is set
  (lineHeight)…" from the in-place text editor: replaced the `font` shorthand with longhand properties.
  Verified in the dev server (no warning).
- While checking: re-editing text selected all of it, so typing replaced it → caret now goes to the end.
- Investigated "GPU stall due to ReadPixels": headless-Chrome-only (reproduced with a bare WebGL page);
  none in a headed browser. Preview canvas switched to premultiplied alpha anyway (DECISIONS #54).
- Playground got a favicon (the only 404 in a headed browser).

## 2026-09-24 · Owner review of Phase 5 → Phase 5.1 planned

- Owner reported 6 issues (clipped tooltips, `.ico` shows a framework error, drawing tools don't
  switch to Select when clicking a shape, empty text boxes vanish, Text tool makes a new box instead
  of editing the clicked one, no way to unlock/show shapes from the canvas).
- Recorded with suggested fixes in `BACKLOG.md` ("Next — fix before Phase 6") and as
  **Phase 5.1** in `PLAN.md`. Phase 6 starts after these are fixed.

## 2026-09-25 · Phase 5.1 — owner fixes

- **Tooltips** (`components/TooltipLayer.tsx`): one shared tooltip for every `data-tooltip` element,
  rendered in `.iu-portal` with fixed positioning — no longer clipped by the Layers list or ControlBar.
  Flips above near the bottom, stays inside the window, instant between neighbours, keyboard focus
  shows it, touch doesn't. CSS `::after` tooltip removed.
- **Image loading** (`core/loader`): `detectImageFormat` sniffs the real format from the first bytes;
  `ImageLoadError` now has `code` (`unsupported` / `damaged` / `not-image` / `network`) and `format`.
  `<img>` decode fallback → SVGs (incl. viewBox-only) now open. HTTP errors say so. New store action
  `fail()`; the Stage catches renderer errors (a `renderer.prepare()` rejection was uncaught before).
  Error screen shows a specific message; default `onError` logs with `console.warn`.
  Couldn't reproduce the owner's `.ico` crash in Chrome (ICO decodes fine) — see BACKLOG.
- **Annotate clicks**: a click on a shape with any drawing tool selects it and switches to Select;
  drags still draw. Polygon selects only before its first point.
- **Text**: new box reads "Text", all selected; an emptied box gets "Text" back (owner chose this over
  removing it). Text tool + click on a text box edits it with the caret at the click
  (`core: textIndexAt`), drag moves it.
- **Shape menu** (`ShapeMenu.tsx`, Radix Dropdown Menu): right-click (incl. locked shapes),
  long-press, Shift+F10 / Menu key, "⋯" on Layers rows. Lock, Hide, 4 order moves, Duplicate,
  Delete, Show in Layers. Shared actions in `annotate/actions.ts` (Layers, ControlBar, shortcuts use
  them too). `shapeAt(..., { includeLocked })` in core.
- Fix found while testing: after a menu action focus fell to `<body>`, so shortcuts stopped working
  (Radix restores focus a tick later, and reports the close twice) → focus returns to the photo on close.
- Tests: 85 unit (+ format sniffing, `textIndexAt`, locked hit-test) · 44 e2e (+ `loading.spec.ts`:
  ICO, SVG, damaged JPEG, HEIC, non-image, 404; Annotate: text never vanishes, caret-at-click edit,
  click-selects-with-any-tool, context menu/unlock/Show in Layers/⋯, tooltip not clipped).

**Next:** owner reviews Phase 5.1 in the playground → then Phase 6 — Extras.

## 2026-09-25 · Phase 5.1 — owner review round 1

- Colour popover: swatch rows spread across the full width (spare space was collecting on the right).
- Text: in Select mode, a click on the already selected text box enters editing (caret at the click);
  double-clicking a shape or the text editor no longer zooms the photo. Root cause: `dblclick` is
  dispatched to the stage itself (common ancestor of both clicks), so the Stage now skips its zoom when
  the press was claimed by a tool overlay (DECISIONS #60).
- Tests: 45 e2e (+ click-selected-text-to-edit, no zoom on text, empty photo still zooms).

## 2026-09-25 · Phase 5.1 — owner review round 2

- "No colour" swatch and colour buttons set to none show a transparency checkerboard instead of a red
  slash (both themes).
- Annotate: a press outside the editor or on empty toolbar space deselects the shape; controls,
  popovers, menus and the Layers panel keep it (DECISIONS #61).
- Tests: 46 e2e (+ deselect on outside / empty ControlBar, controls keep selection).

## 2026-09-25 · Phase 6.1 — compare, history, shortcuts

- Plan approved: Phase 6 in five steps; Sticker added, multi-select → Phase 7 (DECISIONS #62).
- **Compare** (DECISIONS #63): TopBar button — click toggles split view (draggable divider, ←/→ on
  it, Before/After pills), press-and-hold or hold `\` shows the whole original. "Before" = same
  framing, no look/annotations (`getBeforeState`), drawn on a lazily created second canvas + renderer,
  clipped with CSS; annotations clipped to the "after" side. Store: `compare`, `setCompare`.
- **History popover** (DECISIONS #64): "Original" + every step, current in accent, redo-able steps
  muted; click jumps (`store.jump(steps)` → `jumpHistory`, one change / one `onChange`).
- **Keyboard shortcuts popover**: TopBar ⌨ button or `?`; General + Annotate groups, ⌘/Ctrl per
  platform. `MODE_SHORTCUTS` moved to `annotate/state.ts`.
- History, ⌨ and zoom hide below 768px; Compare stays.
- Tests: 89 unit (+ `jumpHistory`, store jump/compare, `getBeforeState`) · 50 e2e
  (+ `extras.spec.ts`: split/drag/keys, hold `\` and button, history jumps, `?`).

## 2026-09-25 · Phase 6.1 — owner review round 1

- Phone TopBar now keeps History and zoom (% button; −/+ from 480px up), hides only Keyboard
  shortcuts; Done icon-only below 480px; 36px buttons below 360px. Verified no overflow at 390/320px.
  (Also fixed: the hide rules lost to `.iu-button`'s `display` on equal specificity.)
- Text editing now ends on any press outside the photo layer (Safari never blurred the text box when
  a toolbar button was clicked, so it stayed in edit mode with its dashed outline).
- Text tool no longer creates boxes on the dark area around the photo; shape tools don't drop a
  default shape there on a plain click (DECISIONS #66).
- Tests: 53 e2e (+ phone TopBar at 390/320, Safari-style press ends editing, no text off-photo).

## 2026-09-25 · Phase 6.1 — owner review round 2

- Owner: with Compare active, hovering the zoom % button showed the two backgrounds touching. The
  phone TopBar had `gap: 0`; buttons now keep 4px (2px at ≤ 359px, with 34px buttons and a 44px
  zoom % button so 320px still fits). An attempted focus-ring change was reverted at the owner's request.
- Tests: 53 e2e (phone TopBar test also checks the gap).

## 2026-09-25 · Phase 6.1 — owner review round 3

- Text boxes no longer have separate "edit" and "resize" modes (owner, like Canva): handles stay
  visible while typing and can be dragged without leaving editing; typing + resizing is one undo step
  (DECISIONS #67).
- Tests: 54 e2e (+ resize a text box mid-edit and keep typing).

## 2026-09-25 · Phase 6.2 — Redact

- Core: `EditState.redactions` (box / brush; pixelate · blur · solid; strength; colour), parsing,
  hit-testing, move, rotate/flip with the photo (`state/redactions.ts`); `drawRedactions`
  (`render/redactions.ts`) shared by preview and export — copies the rendered region, pixelates
  (high-quality downscale → nearest upscale), blurs (downscale/upscale + `ctx.filter`) or fills,
  masked to the box / stroke. Strength relative to the image's short side (DECISIONS #68).
- Export: redactions after the colour pipeline, under annotations, inside a round crop.
- Stage: own redaction layer, drawn from the GPU frame in the same task; clipped to the "after" side
  in compare.
- Redact tool: Box / Brush (+ brush size popover), style Pixelate (default) / Blur / Solid, Strength
  ruler or fill colour, Delete, Clear all; stage: drag to draw, click to select (handles on boxes),
  drag to move/resize, Delete / Esc, brush-size cursor, hover outline. Blur shows a "Pixelate or
  Solid is safer" hint.
- Tests: 93 unit (+ redactions) · 59 e2e (+ `redact.spec.ts`: pixel blocks in export, solid colour,
  select/restyle/move/delete/undo, brush + Clear all, rotate carries areas, compare).
- Fixes found while testing: after "Clear all" / Delete (Redact) and Delete (Annotate ControlBar)
  the button vanished or disabled itself and keyboard focus left the editor, so ⌘Z stopped working —
  focus now returns to the photo layer. The phone-TopBar e2e measured the playground frame mid
  width-animation (flaky) — it now disables the transition.

## 2026-09-25 · Phase 6.2 — owner review round 1

- Brush areas couldn't be resized (dashed outline, no handles) and only moved when pressed exactly on
  the stroke → every area now has the solid outline + 8 handles; a press anywhere inside the selected
  outline moves it; resizing scales the stroke to fit exactly (`resizeRedaction`).
- The brush size control only affected the next stroke → with a brush area selected (either mode)
  it shows and changes that area's width, one undo step per drag.
- Tests: 94 unit · 61 e2e (+ brush handles/resize/move, brush size on a selected Solid area).
- Redact areas rotate (owner): round rotate handle on boxes and brush areas, rotated outline and
  handles, resize along the area's own axes, move from inside the rotated outline; rotate/flip of the
  photo carries the angle (DECISIONS #69). Tests: 95 unit · 62 e2e.
- Cursors (owner): Annotate and Redact show move over the selected element, pointer over other
  elements, resize/grab on handles, grabbing while dragging, crosshair only on empty photo with a
  drawing tool (DECISIONS #70). Tests: 64 e2e (+ cursor checks in both tools).
- Redact Brush cursor (owner): a brush-shaped cursor on empty photo instead of crosshair + size
  circle; over areas the usual move/pointer cursors, and the circle is gone.
- Annotate (owner): a selected line / pen stroke / polygon drags from anywhere inside its selection
  box, not only from the stroke; the move cursor shows there (DECISIONS #71). Tests: 65 e2e.
- Annotate (owner): switching tools from the ControlBar left an unfinished polygon's points on the
  photo — any tool change now drops the draft, like Esc. Tests: 66 e2e.

## 2026-09-26 · Phase 6.3 — Frame & Fill

- Plan approved (owner): frames draw over the photo's edges (size unchanged); "extend canvas" moved to
  Phase 7 (BACKLOG → Planned later). DECISIONS #72–73.
- Core: `EditState.frame` (border / rounded / line / double / corners / polaroid, size, colour) and
  `EditState.background` (colour / image asset / blur), parsing; `drawFrame` + `drawBackground`
  (`render/frame.ts`); `loadAssetBitmap` (cached asset decode). Export order: photo → redactions →
  fill underneath (blur taken from the redacted result) → annotations → frame; JPEG uses the fill.
- Preview: fill canvas under the GPU canvas, rendered without the checkerboard; frame on the top 2D
  layer (clipped to "after" in compare). Found while building: with the checkerboard off, the preview
  canvas (premultiplied) showed colour in transparent pixels → shader premultiplies when the canvas
  does (`u_premultiply`). Blur fill samples the solid middle of the result so corners never darken.
- Frame tool: thumbnail strip (current photo + each frame), Size ruler (1–15 %), colour. Fill tool:
  None / Colour / Image / Blurred photo, colour picker or "Choose image…" with preview, hint.
  `tools/assets.ts` (`fileToAsset`) shared with Annotate's image insert.
- Tests: 98 unit (+ frame/fill parsing) · 70 e2e (+ `frame-fill.spec.ts`: border pixels & size,
  size/colour/style switching, Polaroid bottom, colour fill in PNG + JPEG corners, blur and image
  fills, None).
- More frames (owner, compared with Pintura): Bevel, Inset, Plus, Lumber — 10 styles + None;
  thumbnails draw frames thicker so thin styles read at 52px. Tests: 71 e2e.
- Fill layout (owner): options moved under the kind switch; Colour is now an inline `ColorStrip`
  (new reusable control: swatches + custom picker button → HSV popover; `HsvPicker` exported);
  responsive to 320px. Tests: 72 e2e.

## 2026-09-26 · Phase 6.4 — Watermark & Sticker (started, paused)

- Plan approved (owner): lockable `watermark` prop; stickers = our SVG set + emoji (rasterised) +
  upload + `stickers` prop (DECISIONS #74–75). Done: watermark core (state, parse, draw, export,
  preview) and the app props/lock enforcement. Remaining work is listed in HANDOFF.md.
- Finished 2026-09-26: Watermark tool (`tools/watermark/WatermarkControls.tsx`: None · Text · Logo,
  text field = one undo step, colour, bold, Position popover = 3×3 spots + Tile, Size ruler, Opacity
  popover; locked → one muted line). Sticker tool (`tools/sticker/*`: 16 own SVG stickers, 40
  emoji rasterised on insert, upload, app `stickers` first; placed centred and selected; stage =
  `AnnotateOverlay selectOnly`; opacity / duplicate / delete). New exports: `WatermarkInput`,
  `StickerOption`, `ColorStrip`, `HsvPicker`, `useStickers`, `useWatermarkLocked`. Playground:
  "App watermark" switch + demo sticker. Tests: 101 unit · 77 e2e (+ `watermark-sticker.spec.ts`).

## 2026-09-26 · Phase 6.4 — owner review round 1

- Watermark: centred rows with more space; text field focus ring no longer clipped (`.iu-inspector`
  rows get padding); Position + Opacity grouped; "Size" under its ruler. Same ruler label layout for
  Frame Size and Redact Strength (`.iu-rulerfield`); Frame's row centred (`.iu-row-centered`).
- Stickers: no divider after the app's stickers.
- Regression caught while doing this: a CSS edit removed the Fill / Watermark / Sticker styles
  (restored); e2e now checks sticker tile size and the watermark field width as a layout guard.
- Open, waiting for the owner: a much bigger emoji / sticker library (see BACKLOG).
- Emoji & sticker libraries (owner chose): full Unicode emoji (`emojibase-data`, lazy) with 9
  categories + word-prefix search; ~1,850 Microsoft Fluent Emoji 3D stickers from the pinned npm
  package on jsDelivr (`stickerLibrary` prop to self-host / turn off); new three-row Sticker bar.
  Checked against the real CDN: no broken tiles. Tests: 78 e2e (the 3D test serves the images
  locally via `page.route`).
- Watermark (owner): Size now reaches 100 % (= fills the photo's width inside the margin; ruler
  1–100 %, default 25 %); drag the watermark anywhere on the photo (dashed box overlay, arrow keys)
  → `custom` position; the Tile button fits its text. Core `layoutWatermark` + `watermarkAspect`
  (+ unit test). Tests: 102 unit · 79 e2e.
- Watermark (owner): resizable (4 corner handles, proportions kept → Size) and rotatable (round
  handle, `WatermarkState.rotation`) on the photo, like other elements. Tests: 79 e2e.
- Watermark (owner): Font menu for text watermarks (same menu and `fonts` list as Annotate text).
- Adjust (owner): the crop shade now covers only the photo outside the crop (SVG clip to the photo's
  outline from `getImageQuad`), so the empty stage keeps the normal stage colour in both themes.
- Compare (owner): the round divider handle is solid (surface colour) with ‹ › arrows — the line no longer shows through.

## 2026-09-26 · Phase 6.5 — Metadata + copy / paste

- Copy / paste (DECISIONS #78): ⌘C / ⌘X / ⌘V for the selected shape, sticker or redaction area;
  one in-memory clipboard for the page, so it works across photos (same relative spot and size).
  Paste from another tool switches to Annotate / Redact and selects the copy; one undo step each.
  Copy / Paste in the shape menu; three rows in the `?` panel. Core `copyShape` /
  `copyRedaction` / `pasteClipboard` (+ `fitShape` / `fitRedaction`); react `clipboard.ts`.
- Metadata (DECISIONS #79): exports stay metadata-free by default; `keepMetadata: true` rebuilds
  the source JPEG's EXIF (orientation reset, new size, no thumbnail / maker notes / GPS);
  `{ location: true }` keeps GPS. `LoadedImage.exif`; `export/exif.ts`, no dependency. Checked
  with Pillow: the rebuilt block reads back correctly.
- Playground: "Metadata: strip / keep / keep + GPS" switch; the save log says "with EXIF" / "no EXIF".
- Tests: 119 unit (+ `clipboard.test.ts`, `exif.test.ts`) · 82 e2e (+ `copy-metadata.spec.ts`).

## 2026-09-26 · Phase 6.5 — owner review round 1

- Paste lands at the mouse pointer when it's over the photo (owner); otherwise next to the original
  / same relative spot as before. The editor remembers the last pointer position over the stage
  (menus keep it, so right-click → Paste lands where the menu opened). Core `pasteClipboard` takes
  an optional `at` point. Tests: 120 unit · 83 e2e.

## 2026-09-26 · Phase 7.1 — Selection & layers

- Phase 7 plan approved and written into PLAN (7.1–7.7, DECISIONS #80).
- Multi-select (DECISIONS #81): Shift-click, selection box (mouse drag on empty space), ⌘A; group
  outline + corner handles (proportional resize incl. strokes/fonts) + rotate handle; move with
  snapping; Delete / ⌘D / arrows / copy-cut-paste for the whole group; Space + drag pans; the overlay
  now handles double-click zoom on empty space. Group inspector (colour, fill, line width, opacity)
  and an Align popover (6 aligns; distribute for 3+; single shape aligns to the photo).
- Core `state/arrange.ts`: `groupBounds`, `scaleShapes`, `rotateShapes`, `alignShapes`,
  `distributeShapes`, `boxesIntersect`, `transformShape`; clipboard now carries several shapes
  (`copyShapes`, `ClipboardItem.shapes`, `pasteClipboard` → ids).
- Layers: drag to reorder (drop line), double-click / F2 rename, "Show all", Shift/⌘-click rows,
  ⌘ shortcuts work inside the panel.
- Fixes: hollow handles on arrow/dot line ends; canvas text wraps like the CSS editor (DECISIONS #82).
- Tests: 130 unit (+ `arrange.test.ts`, text wrapping, group clipboard) · 91 e2e
  (+ `selection-layers.spec.ts`).

## 2026-09-26 · Phase 7.2 — Canvas & crop

- 7.1 committed (`feat: phase 7.1`).
- Extend canvas (DECISIONS #83): Resize › [Size | Canvas]; Canvas = padding ruler, photo position
  (3×3), shape chips (1:1, 4:5 … 16:9). `EditState.canvas`, core `getCanvasRect` / `getCanvasSize`
  / `getPhotoRect`; output mapping, annotations, export round clip and the stage use the canvas;
  checkerboard covers added space; Fill shows there; shapes can sit on it.
- Vignette / round crop follow the photo (`RenderParams.photoRect`, shader `u_photoRect`, CPU
  `FinishParams.photo`) — fixes the crop-view vignette preview.
- Crop view zoom (DECISIONS #85): wheel / trackpad pinch / two-finger pinch + pan; core `zoomCrop`.
- Paste images from other apps (DECISIONS #84): marker on copy, paste event decides; shared
  `insertImageFile` (Add image uses it too).
- Group menu (DECISIONS #86): right-click / long-press / Shift+F10 on a group; Align submenu.
- Tests: 137 unit (+ `zoomCrop`, canvas geometry, vignette on the photo) · 97 e2e
  (+ `canvas-crop.spec.ts`).
- Test stability: ⌘V pastes a moment later now (paste event / 50 ms fallback), so e2e waits with
  `expect.poll`; the sticker-tiles test waits for images to finish loading (it raced under load).
  Full e2e green 3 runs in a row.

## 2026-09-26 · Phase 7.2 — owner review round 1

- Cropped photo + canvas space: the space showed the cropped-away photo (looked off-centre) —
  renderers now clip to the crop (`clipToPhoto`, GPU + Canvas2D); crop view unaffected.
- Locked shapes can join a group; only unlocked members move; fully locked group = dashed box;
  group menu "Unlock all"; Lock all keeps the selection; duplicates are unlocked.
- Align popover: compact 3-column grid, no empty space.
- Tests: 137 unit · 98 e2e (+ cropped canvas, group lock / unlock).
- Round 2: Photo position popover fits its grid; right-click / long-press anywhere inside the group
  box (also between members) opens the group menu. Tests: 98 e2e.

## 2026-09-26 · Phase 7.2b — Unified elements

- 7.2 committed (`feat: phase 7.2`).
- Redaction areas are elements (`RedactShape`), the watermark has a place in the order (marker);
  old edits migrate. Export + preview: photo pass + ordered element layer (`drawElements`): a
  redaction area hides the elements below it too. Frame now under the elements.
- Redact tool: Select / Box / Brush on the shared overlay — groups, menus, Layers, reorder.
- Watermark as an element in Annotate / Sticker / Redact (`watermarkElement.ts`): select, move,
  resize (corners), rotate, group, align, reorder, delete; never copied or duplicated; app-locked
  = on top, not selectable. Annotate shows "Edit in Redact / Watermark" for those.
- Tests: 137 unit · 102 e2e (+ `elements.spec.ts`; redact spec on the element list).

## 2026-09-26 · Phase 7.3 — Colour tools

- Fix committed first: duplicate React key `align` (Align menu is `arrange` now).
- Undo: quick arrow-key presses on one control are one step (DECISIONS #90) — all ruler dials,
  curve points, levels handles, crop box, Annotate / group nudges. Core `ChangeOptions.coalesce`,
  React `undoStep()` helper; `RulerSlider.onChangeStart(source)`.
- Curves / Levels: "after" histogram outline over the "before" area (`useHistograms`, shared
  thumbnail renderer, `ThumbnailRenderer.render(..., { fit: 'contain' })`, core `analysisState`).
- Filter thumbnails preview presets on top of the user's colour edits.
- Tests: 141 unit (+ coalescing) · 106 e2e (+ key-press merging, histogram outline, thumbnails).

## 2026-09-27 · Phase 7.4 — Mobile

- 7.3 committed (`feat: phase 7.3`).
- Audit at 320 × 568 and 390 × 844 (every tool): header rows scrolled sideways (Adjust, Finetune,
  Annotate, Redact, Sticker — Sticker's tabs were clipped on the left), Resize taller than the bar,
  and the playground page left the editor ~150px on a phone.
- Rows wrap, ControlBar grows (DECISIONS #91, new token `--iu-size-controlbar-max`); buttons never
  wrap their label; `iu-toolgroup--fill` for Annotate's tools and shape inspector.
- Two-finger pinch / pan works in every tool; the first finger's stroke / shape / drag is cancelled.
- Playground: phone layout (Settings button, dev panel below), reachable over Wi-Fi.
- Tests: 141 unit · 111 e2e (+ `mobile.spec.ts`: no sideways rows at 320 / 390, playground layout,
  two-finger pinch over a drawing tool). The pinch test picks its tool with a plain DOM click:
  Playwright's click sometimes scrolls the (taller than the screen) playground page first, so the
  CDP touches missed the photo.
- Owner phone test: tool rail had no space after the last tool (list was only as wide as the
  rail) — fixed; e2e checks the gap.

- Owner phone test, round 2: Resize header — switch centred (was in the left column), Reset at the
  start on narrow editors; `.iu-adjust` layout restored (a 7.2 edit had merged its rule with the
  Canvas ruler's); Canvas ruler uses the default tick spacing. e2e checks the Resize header at
  320 / 390.
- Owner phone test, round 3 (ControlBar height at 390px, before → after): Watermark 223 → 183
  (position / opacity / Size on one line), Annotate 159 → 148 (tools scroll on one line, Layers in
  the selection row — owner's choice, DECISIONS #91 amended), Finetune Auto at the start, a selected
  sticker's actions on the first line, Redact › Solid shows an inline colour strip (all widths) with
  a smaller hint. e2e: 117 (+ Annotate phone row at 320 / 390). Redact is 19px taller on phones (strip + hint).
- Owner phone test, round 4: Curves graph on its own full row on phones; Annotate's selection row
  is one line (style controls scroll with an edge fade — new `useEdgeFade` hook + `.iu-fade-x`);
  **Layers moved to the TopBar** and works from any tool (DECISIONS #92; flag in
  `toolState['layers']`, `tools/annotate/layers.ts`); TopBar reordered, Reset hidden below 480px.
  e2e: 119 (+ TopBar Layers from any tool, TopBar order; phone Annotate test updated).
- Owner phone test, round 5: Curves channels are chips with a colour dot instead of a second
  SegmentedControl (all widths; all four fit at 320px). All checks green (141 unit, 119 e2e).

## 2026-09-27 · Phase 7.5 — Accessibility & motion

- 7.4 committed (`32c3496`). 7.5 plan approved: 4 steps (a axe, b keyboard & focus incl. Tab through
  elements, c screen readers, d motion & 36px touch switches).
- **7.5a axe:** `@axe-core/playwright`; `e2e/a11y.spec.ts` (4 runs: dark/light × 1280/390, ~40
  states each). First run: 6 problems — unlabelled hidden file inputs, `aria-label` on a role-less
  div (Annotate layer), `aria-expanded` on a radio (Custom colour) and on the menu anchor, light
  danger red 4.45:1, Shortcuts panel scrolls but isn't focusable. All fixed (DECISIONS #93). All
  checks green (141 unit, 123 e2e).
- **7.5b keyboard & focus:** audit scripts (Tab order per tool, focus after actions, clipped rings).
  Found: photo unreachable by keyboard; every sticker tile a Tab stop; focus dropped after Undo /
  Redo / Reset / Finetune Reset disable themselves, after saving a look, while Done saves, after Esc
  in a text box; Layers panel never took focus; chip strips and Fill's switch row clipped the ring
  by 1px; **Enter on any button re-opened the selected text box** (the photo's key handler claimed
  it editor-wide). Fixed all (DECISIONS #94) + Tab / ⇧Tab through elements and Enter adds a shape
  (owner's choice). `e2e/keyboard.spec.ts` (6 tests incl. a keyboard-only crop → brighten → text →
  save). All checks green (141 unit, 129 e2e); one rare flake logged in BACKLOG.
- Owner review of 7.5b: focus rings clipped on toolbar rows (edge-fade mask). Mask now only while
  a row overflows; the ring check counts masks. All checks green.
- **7.5c screen readers:** `useAnnouncer` + `useStoreAnnouncements` (undo / redo / history, zoom,
  crop size, selection, saving / saved / failed, tool name); stage named "Photo, W × H", photo layer
  "Photo and its elements" + usage hint, load error is an alert, curve points "input …, output …",
  compare divider value, named tool tablist. First version announced every re-fit as a zoom (fixed:
  only into / out of "fit") and **threw on Resize's string tool state, which broke Canvas mode** —
  caught by the existing e2e (DECISIONS #95). `e2e/screen-reader.spec.ts` (4 tests incl. aria
  snapshots of TopBar, rail, Finetune). All checks green (141 unit, 133 e2e).
- **7.5d motion & touch:** still loading placeholder under reduced motion (the one fixed-duration
  animation); forced-colors outlines for focus + selected (system colours); `--iu-size-choice`
  28 → 36px on touch screens. `e2e/motion.spec.ts` (4 tests; checked they'd fail without the
  fixes). All checks green (141 unit, 137 e2e). **7.5 done** except the owner's VoiceOver check.

## 2026-09-27 · Phase 7.6 — i18n & RTL

- 7.5 committed (a–d). 7.6 plan approved: a strings, b RTL, c playground languages; count labels
  may be functions (plurals); emoji localization → BACKLOG; Arabic as the RTL demo.
- **7.6a strings:** pseudo-locale in the playground (`/?locale=pseudo`) + `e2e/i18n.spec.ts` found
  28 filter names, 8 size names, "px", default shape names, key names; code search added sticker
  and font names and 11 history step names (incl. core's "Reset"). All moved to typed labels
  (DECISIONS #97); `CountLabel` + `formatCount`; generic `mergeLabels`; `filterPresets` /
  `sizePresets` props. First react unit tests (`i18n.test.ts`). All checks green (141 + 3 unit,
  138 e2e).
- Owner asked how to test 7.6a from the UI: the playground header got a **Language** switch now
  (english · pseudo; Arabic + RTL join in 7.6b/c). e2e 139.
- Owner testing 7.6a found two older bugs: the wheel over the Layers list zoomed the photo (stage
  wheel handler now leaves the wheel to anything that scrolls itself) and the Shortcuts scrollbar
  covered the key caps (overlay scrollbars; 8px room + gutter, Layers list too). e2e for both,
  checked to fail without the fixes.
- **7.6b RTL** (+ owner's additions): playground settings are dropdowns (except accent colours);
  Language english · hindi · arabic · pseudo (full typed `Labels` for Hindi and Arabic, drafted,
  incl. an Arabic plural function); Direction auto · ltr · rtl. Editor: `dir` prop, ~20 layout
  declarations → logical properties, `rowStep` for ←/→ in rows, Undo/Redo mirror, core
  `textDirection` for canvas text + watermark (pinned left). Found on the way: `:dir()` is
  rewritten by the CSS toolchain (use `[dir='rtl']`); the playground status text re-wrapped the
  header and moved the editor mid-edit (fixed slot). `e2e/rtl.spec.ts` (4) + RTL axe run.
  All checks green (142 + 3 unit, 146 e2e).
- Owner: "Zoom" in History stayed English after switching language — two once-registered listeners
  (crop wheel zoom, arrow-key nudge) held stale labels. `useLatest` hook; e2e (fails without it).
- **7.6c:** owner decided the package ships English only and apps add their own languages
  (DECISIONS #99); Localization guide added to the Phase 8 docs plan. Phase 7.6 done.

## 2026-09-27 · Phase 7.7 — Performance

- 7.7 plan approved (a benchmark, b preview size, c memory, d tiled export).
- **7.7a benchmark:** `/bench` page + `pnpm bench` (Playwright, WebGL2 and Canvas2D runs; DECISIONS
  #100); first results in the new `PERF.md`. WebGL2 on the M4 meets every target at 12–48MP
  (first paint ≤ 0.2 s, drags at 60 fps, 24MP JPEG 0.3 s). Found: the Canvas2D fallback drags colour
  at 3–9 fps, and WebP export takes 4 s at 24MP (both in BACKLOG). The preview's cost follows the
  screen size, not the photo size — so 7.7b is proposed to lead with a lower-resolution preview
  while dragging (owner to confirm).
- 7.7a committed. Owner OK'd leading 7.7b with the drag fix.
- **7.7b:** the Canvas2D preview draws ≤ 0.35 MP while a change is open, sharp on release
  (DECISIONS #101): Exposure 3 → 20–30 fps, Sharpen 3 → 30–60, Curves 8 → 60 (PERF.md). Exposure
  stays slowest (per-pixel `Math.pow`; a LUT would risk GPU/CPU parity — not done). New
  `e2e/perf.spec.ts` (WebGL off; checked to fail without the fix). GPU screen-sized copy waits for
  the owner's phone `/bench` run (BACKLOG). All checks green (145 unit, 148 e2e).
- 7.7b committed. **7.7c memory:** new `e2e/memory.spec.ts` + `e2e/support/memory.ts` count live
  images and GPU textures (the JS heap can't see them). Found and fixed (DECISIONS #102): assets
  stayed decoded forever (+1 image per photo); compare kept a second GPU copy of the photo after
  closing (12 MB here, 92 MB at 24MP); unused layers held full-size canvases; oversized-photo copies
  piled up in the WebGL renderer. Now flat over 10 photos; closing the editor frees everything.
  Test checked to fail without the fixes. All checks green (145 unit, 149 e2e).
- 7.7c committed. **7.7d tiled export** (DECISIONS #103): above the GPU limits the photo pass runs in
  tiles with a detail margin, each uploading only its part of the photo; the output canvas is
  probed and `ExportResult.downscaled` reports a browser-forced shrink. First run: tiles differed
  on the photo's border (a tile's margin saw empty space where one pass repeats the edge) → margins
  stop at the output's edges. Also found: the GPU blur's smaller copy was slightly stretched → exact
  mapping, factors 1 / 2 / 4 shared with the CPU. `e2e/tiled-export.spec.ts` (3; the full-size test
  fails on the old code). Export speed unchanged. All checks green (145 unit, 152 e2e). **Phase 7.7
  done** apart from the owner's phone `/bench` run.
- 2026-09-28 · Owner approved 7.7. Owner checked the Hindi / Arabic playground labels: every label
  is wired to the right place, but the words aren't good translations — left as examples only,
  since the package doesn't ship languages (DECISIONS #99).
- 2026-09-28 · Owner's VoiceOver check: okay. 7.5 fully done.
- 2026-09-28 · **Owner's iPhone `/bench`:** 12 / 24MP drags at 59 fps (no screen-sized copy needed);
  iOS makes PNG when asked for WebP; 48MP crashed the tab at export (iOS canvas budget). Fixes: exports
  above 16.7 MP always tile, export canvases freed right after use (DECISIONS #104); `/bench` gets
  per-size buttons and frees its test photo. Playground: `suppressHydrationWarning` on `<html>`
  (Chrome on iPhone adds `__gcrremoteframetoken` — a harmless hydration warning the owner saw).
  Checks green (145 unit, 152 e2e; one touch-size e2e timing flake against the dev server).
- 2026-09-28 · Owner: 48MP still crashed after the first fix (pause after the zoom drag, then the tab
  died — the export). Added canvas + peak tracking to `e2e/support/memory.ts` and measured: the JPEG
  export peaked at 418 MB of canvases (white-background copy) and 384 MB of textures (a second full
  upload). Fixed: in-place JPEG flatten, tiles always upload only their part (≤ 2048 px), and the
  preview draws a 4096 px copy of big photos (full photo only when zoomed in). Now 214 MB / 67 MB at
  the export peak, 50 MB of textures while fitted. New e2e: 48MP memory + the copy draws the photo
  correctly. All checks green (145 unit, 153 e2e).
- 2026-09-28 · Owner's iPhone re-run: 48MP works, and the full 12 / 24 / 48MP run finishes — 59 fps
  drags, 48MP JPEG export 1.9 s (PERF.md). Bench row "Photo texture" renamed "Decoded photo".
- 2026-09-28 · **`.ico` crash reproduced** with the owner's file: a 512 px PNG inside an ICO (header
  says 256). Chrome can't decode it, Safari can. New `loader/ico.ts` decodes the largest PNG entry
  directly (DECISIONS #105); all 9 of the owner's .ico files open in Chrome at their real size.
  4 unit tests, 1 e2e. All checks green (149 unit, 154 e2e).

## 2026-09-28 · Phase 8 — Release

- Plan approved (8a–8e); owner's answers: separate `apps/docs`, Vercel, 0.1.0, accounts at 8d
  (DECISIONS #106).
- **8a package quality gate** (DECISIONS #107): core split into a stable entry (~110 names) and
  `core/internal` (owner's choice); `pnpm check:package` — publint, attw, size budget, SSR import,
  no `any` — all green, each shown to catch a deliberately broken build. Found by the checks: the
  internal entry didn't resolve for old `node10` TS setups (→ `typesVersions`), `tileSize` leaked
  into `renderToCanvas`'s published type (→ `@internal` + `stripInternal`), no `engines` field.
  READMEs for the repo, react and core (examples type-checked). All checks green (149 unit, 154 e2e).
- 8a committed. **8b examples** (DECISIONS #108): Next.js App Router (React 19, SSR), Vite + React 18
  (client), React Router 8 framework mode (React 19, SSR) — same `PhotoEditor`, shared smoke test
  (save as download, reopen saved edits after reload). React 18 proven: only 18.3.1 in the Vite
  bundle. Found: inside the monorepo the editor's dev copy of React 19 (runtime + types) leaks into
  the React 18 app → `dedupe` + `paths`, documented as not needed from npm. All green: build,
  typecheck, 149 unit, 154 playground e2e + 3 example smoke tests, package checks.
- 8b committed. **8c docs site** (DECISIONS #109), committed in parts: (1) site + home + getting
  started + 11 guides, `check:snippets` (found 3 wrong examples); (2) API reference generated from
  the published `.d.ts` with the TS compiler, doc comments added to 71 undocumented exports; (3)
  theme playground with contrast readouts and copyable props / CSS; (4) docs e2e with axe in light
  - dark (34 tests) — fixed Shiki theme contrast, reference link target size, an example accent.
    All green: build, typecheck, 149 unit, e2e 154 + 34 + 3, package checks.
- 8c committed. **8d**: owner created the GitHub repo (public) + npm org + `NPM_TOKEN` secret;
  pushed. Release first failed (Actions may not open PRs → owner changed the setting; then
  changesets/action v2 renamed inputs → fixed); actions bumped to current majors (v4 ran on
  deprecated Node 20). "Version packages" PR #1 open. CI on Linux: one e2e failure — the Fill
  switch overflowed at 320px with Linux's wider font → narrow editors tighten segmented items
  (UI_VISION §3). Playwright `github` reporter in CI so failures are readable without a login.
- **8e (docs deploy)**: `apps/docs/vercel.json`; owner connected the repo on Vercel with their domain →
  https://imageultra.ashvattech.com (home, guides, reference, 404 checked). `homepage`, READMEs and
  `metadataBase` point there (DECISIONS #111).
- CI (Linux): `memory stays flat over 10 photos` timed out at 30s (13s on the Mac; software WebGL on
  the runner) — no assertion failed, so no leak; the test gets 90s like the other heavy ones.
  Vercel: `outputDirectory: "out"` broke the Next.js builder → removed (DECISIONS #111).
