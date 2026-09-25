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
