# image-ultra — Backlog (fix later)

Known gaps and improvements found while building. Each item: where it came from, what's wrong,
suggested fix, and the phase it's planned for. Tick `[x]` and note the date when fixed.

## Open

### From Phase 4 — Finetune + Filters

- [ ] **Histogram shows "before" only** (Curves/Levels) — _Phase 7_
  - Now: histogram is computed from the image with geometry only, before colour edits.
  - Fix: add a Before/After toggle (or show both, "after" as an outline) using
    `renderAnalysisPixels` with the current colour state, debounced.
- [ ] **Filter thumbnails ignore the user's adjustments** — _Phase 7_
  - Now: each thumbnail previews the filter on the plain (cropped) photo.
  - Fix: optional "preview on my edits" mode — render `{...edit, filter}` per thumbnail;
    watch cost (28 renders per change → debounce ~150ms).
- [ ] **Preset names are English only** (filter presets + `SIZE_PRESETS`) — _Phase 7 (i18n)_
  - Fix: labels keyed by preset id (`labels.filterNames[id]`, `labels.sizePresetNames[id]`) with
    English defaults; `sizePresets` / `filterPresets` props for custom lists.
- [ ] **Every arrow-key press is its own undo step** (dials, curve points, levels, crop box) —
      _Phase 7 (a11y)_
  - Fix: coalesce key presses on the same control within ~600ms into one step (keep the change
    open with a timer instead of `endChange` on each keyup).
- [ ] **20MP performance not formally measured** — _Phase 7 (perf)_
  - Fix: benchmark slider drags on a 20–24MP image (GPU + Canvas2D fallback) and record frame
    times; consider a downscaled preview texture while dragging.
- [ ] **Detail effects differ slightly between GPU and CPU fallback** (mean < 3/255) — _nice to have_
  - Fix: use the same kernel on both (e.g. GPU box ×3, or CPU true Gaussian).

### From Phase 3 — Adjust

- [ ] **Phone layout: Adjust header row scrolls sideways** ("Horizontal" label clipped) — _Phase 7_
  - Fix: on narrow containers put the SegmentedControl on its own row or shorten labels
    (icons + tooltips), keeping the ControlBar height fixed.
- [ ] **Vignette preview while cropping uses the whole image**, not the crop (export is correct) —
      _Phase 7_
  - Fix: pass the crop rect to the preview render as the vignette/ellipse reference frame.
- [ ] **No zoom in crop view** (wheel/pinch disabled while cropping) — _Phase 7_
  - Fix: Pintura-style zoom that shrinks the crop around the pointer.
- [ ] **Canvas2D fallback approximates perspective with a 20×20 mesh** — _nice to have_
  - Fix: adaptive grid density based on the amount of tilt.

### From Phase 2 — Core engine

- [ ] **Images above the GPU texture limit are downscaled** (16384px desktop, 4096–8192 mobile) —
      _Phase 7 (perf)_
  - Fix: tiled textures / tiled export.

## Done

_(nothing yet)_
