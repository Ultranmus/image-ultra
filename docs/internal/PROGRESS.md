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
