# image-ultra — Backlog (fix later)

Known gaps and improvements found while building. Each item: where it came from, what's wrong,
suggested fix, and the phase it's planned for. Tick `[x]` and note the date when fixed.

## Open

### Phase 5.1 — owner-reported (2026-09-24) · all fixed 2026-09-25

- [x] **1. Tooltips get clipped inside panels** (seen in the Layers panel)
  - Now: tooltips are CSS `::after` pseudo-elements, so any ancestor with `overflow: hidden/auto`
    cuts them off — the Layers list (`overflow-y: auto`), and likely the ControlBar
    (`overflow: hidden`) and scrolling chip/tool rows too.
  - Fix: a real `Tooltip` component portalled into `.iu-portal` (Radix Tooltip, like Popover) with
    collision handling (flips side near edges), 400ms delay, hidden on touch; replace all
    `data-tooltip` uses. Verify in Layers, ControlBar rows, ToolRail and TopBar.
- [x] **2. Unsupported images (e.g. `.ico`) show a framework error instead of a proper message**
  - Now: opening a `.ico` (or other format the browser can't decode as a bitmap) ends in the
    Next.js dev error overlay instead of the editor's own error screen. Cause to confirm when fixing
    (likely an uncaught rejection / `console.error` path around `loadImage` → `createImageBitmap`).
  - Fix: every load failure lands in the editor's error state (never uncaught, never
    `console.error` when `onError` is given); a specific message per case: "This file type isn't
    supported (ICO)", "The file is damaged", "Couldn't download the image (CORS/404)". Check the file
    type/extension up front; try an `<img>` decode fallback so formats the browser _can_ show (ICO,
    SVG, AVIF, HEIC on Safari…) still open. Add e2e tests with a `.ico`, a corrupt file and a
    non-image.
- [x] **3. Clicking a drawn shape while a drawing tool is active draws again**
  - Now: with Polygon (and every other drawing tool) active, clicking on an existing shape starts
    a new shape / adds polygon points on top of it. The user has to click the Select icon first.
  - Fix: in every drawing mode, a click (not a drag) that lands on an existing shape switches to
    Select mode and selects that shape. Drawing still starts on empty photo area (and a drag that
    starts on a shape with Pen should keep drawing — decide: Pen draws over shapes only when
    dragging). Polygon: a click on a shape before the first point is placed selects it.
- [x] **4. An empty new text box disappears**
  - Now: Text tool → click → click elsewhere without typing → the box is discarded.
  - Fix: a new text box starts with placeholder content "Text", fully selected so typing replaces
    it; it's never auto-removed. Only an explicit Delete removes text. (If the user erases all
    characters and leaves, keep the box with the placeholder, or remove — decide with owner; default:
    restore "Text".)
- [x] **5. Clicking an existing text box with the Text tool creates a new box instead of editing it**
  - Now: when focus isn't in the previous box, clicking on it commits/discards it and makes a new
    one elsewhere (hit-testing misses empty/unfocused text).
  - Fix: in Text mode, clicking any existing text box (including empty ones) selects it and enters
    editing with the caret at the click position; only clicks on empty photo area create new text.
- [x] **6. Locked (and hidden) shapes can't be unlocked/shown from the canvas — no context menu**
  - Now: locked shapes can't be selected on the photo, and there's no right-click menu, so the only
    way back is the Layers panel.
  - Fix: a right-click / long-press **context menu** on the photo for the shape under the pointer
    (hit-test includes locked shapes): Unlock/Lock, Hide/Show, Bring forward, Send backward,
    Bring to front, Send to back, Duplicate, Delete, "Show in Layers" (opens the panel with the row
    highlighted). Same menu from a "⋯" button on each Layers row. Keyboard: Shift+F10 / Menu key on
    the selected shape. Built on Radix Context Menu / Dropdown Menu, portalled like popovers.
  - **Done 2026-09-25:** #1 `TooltipLayer` (DECISIONS #55). #2 typed `ImageLoadError` + format
    sniffing + `<img>` fallback + `store.fail()` for render errors (#56) — could not reproduce the
    exact `.ico` crash in Chrome (ICO opens fine there); every load/render path is now covered and
    tested. #3 (#57). #4 restore "Text" (owner's choice) (#58). #5 caret at the click (#58).
    #6 shape menu (#59). e2e: `loading.spec.ts` + 5 new Annotate tests.

### Owner review of Phase 5.1 (2026-09-25)

- [x] **Colour popover: empty space right of the swatches** _(fixed 2026-09-25)_ — the swatch grid uses fixed 24px
      columns, so when the popover is wider (hex + "Pick from screen" row) the spare width collects
      on the right. Fix: spread the columns across the full width (`justify-content: space-between`).
- [x] **Double-clicking text zooms the photo** _(fixed 2026-09-25, DECISIONS #60)_ — editing text needed a double-click, which also
      reached the Stage's double-click zoom. Fix: a click on the _already selected_ text box enters
      editing (caret at the click); double-clicks on shapes / the text editor never zoom.

- [x] **"No colour" swatch shows a red slash** _(fixed 2026-09-25)_ — owner expects the usual transparency checkerboard.
      Fix: checkerboard (theme-aware) on the None swatch and on colour buttons set to none.
- [x] **Selection stays when clicking outside** _(fixed 2026-09-25, DECISIONS #61)_ — with a shape selected, clicking outside the editor
      or on empty toolbar space keeps it selected. Fix: deselect on a press outside the editor or on
      non-interactive editor chrome; presses on controls (they edit the selection), popovers, menus
      and the Layers panel keep it.

### Owner review of Phase 6.1 (2026-09-25) · fixed same day

- [x] **Mobile TopBar: show zoom and History** (hide only Keyboard shortcuts). Must still fit at
      320px wide: compact zoom (−/+ drop below 480px, the % button stays and pinch zooms), Done
      icon-only below 480px, slightly smaller TopBar buttons below 360px.
- [x] **Text box stays in edit mode after clicking the toolbar** (dashed outline remains). Safari
      doesn't move focus to a clicked button, so the text editor never blurs and never commits.
      Fix: any press outside the text editor commits the text explicitly (not via blur).
- [x] **Text tool: a click on the dark area outside the photo creates a text box there** (and it stays
      selected). Fix: new text only on the photo; outside it the click commits and deselects.

- [x] **Text: editing and resizing are two separate modes** _(fixed 2026-09-25, DECISIONS #67)_ — while editing, the handles disappear,
      so resizing needs Select tool → click the text again. Owner wants it like Canva: a text box being
      edited keeps its outline + resize/rotate handles, usable without leaving editing.

### Owner review of Phase 6.2 — Redact (2026-09-25)

- [x] **Redact areas can't be resized or moved (dashed outline)** _(fixed 2026-09-25)_ — brush areas were selected with a
      dashed bounds outline and no handles, and only a press exactly on the painted stroke moved them.
      Fix: every area (box or brush) gets the same solid outline + 8 resize handles; pressing anywhere
      inside the selected area's outline moves it; resizing a brush area scales its stroke.
- [x] **Brush size doesn't change a selected brush area** _(fixed 2026-09-25)_ — the size control only set the size for
      the next stroke (colour did change the selected one). Fix: with a brush area selected, the
      size control shows and changes that area's stroke width (one undo step per drag), in either mode.

- [x] **Redact areas can't be rotated** (owner) _(fixed 2026-09-25)_ — add the round rotate handle like Annotate shapes,
      for boxes and brush areas.

- [x] **Wrong cursor over shapes / areas** (owner) _(fixed 2026-09-25, DECISIONS #70)_ — drawing tools show a crosshair everywhere, even
      over an element that a click would select or over the selected one that a drag would move.
      Fix (Annotate + Redact): move cursor over the selected element, pointer over other elements
      (a click selects them), resize/rotate cursors on handles, crosshair only on empty photo while a
      drawing tool is active, grabbing while dragging.

- [x] **Redact Brush cursor** (owner) — crosshair + a size circle that also showed around the move /
      pointer cursors over areas. Now: a brush cursor on empty photo, the usual cursors over areas,
      no circle _(fixed 2026-09-25)_.

- [x] **Annotate: selected lines / pen strokes / polygons only drag from the stroke** (owner) _(fixed 2026-09-25)_ — the
      empty middle of their selection box ignored presses. Fix: like Redact, a press anywhere inside
      the selected shape's (rotated) box moves it, unless another shape on top is under the pointer.

- [x] **Unfinished polygon points stay after switching tools** (owner) _(fixed 2026-09-25)_ — only the keyboard shortcut
      and Esc cleared them; the ControlBar tool buttons didn't. Fix: any tool change drops the
      unfinished polygon (like Esc).

### Owner review of Phase 6.3 (2026-09-26)

- [x] **More frame styles** (owner, compared with Pintura's strip) — add Bevel, Inset (edge lines
      that don't meet), Plus (lines crossing a little past the corners) and Lumber (lines crossing
      edge to edge). Ours already cover Mat (Border), Line, Zebra (Double line), Hook (Corners),
      Polaroid. Drawn our own way — no Pintura code/assets.

- [x] **Fill layout** (owner) _(fixed 2026-09-26)_ — the options sat to the right of the kind switch; the colour was one
      button + popover. Fix: options below the switch; Colour = an inline strip of swatches (like the
      filter strip) with a custom-colour picker button at the end; responsive down to 320px.

### Owner review of Phase 6.4 (2026-09-26)

- [x] **Sticker bar: empty space under the strip** — balance the ControlBar (tiles/rows fill it).
- [x] **Divider after the app's sticker looks odd** — the app's stickers should read as part of one
      list (no divider).
- [x] **Watermark text field's focus ring is clipped top/bottom** — the scrolling row cuts the ring.
- [x] **Watermark layout** — not enough space around the kind switch; the "Size" caption sits far
      left and doesn't read as the ruler's label → put it under the ruler; Position and Opacity
      together as one group. Apply the same "caption under the ruler" to Redact Strength and Frame
      Size for consistency.
- [x] **Far more emoji and stickers** (owner: "use a universal library") _(done 2026-09-26, DECISIONS #76)_ — full Unicode emoji set
      with categories + search; a larger open-licensed sticker set. (Emojipedia's sticker art is
      Apple/Google/… copyright — can't be used; needs an open-licensed set.) — _decide with owner_

- [x] **Watermark size can't reach 100%** (ruler stopped at 30% of the short side). Fix: Size =
      share of the largest fit — 100% fills the photo's width (inside the margin); ruler 1–100%.
- [x] **Watermark can't be moved freely** — only 9 spots. Fix: drag it on the photo (Watermark tool
      overlay) → a custom position (centre as a fraction of the photo); the grid then shows none.
- [x] **"Tile across the photo" button too wide** in the Position popover → fit its text.

- [x] **Watermark only moves — no resize / rotate handles** (owner) _(fixed 2026-09-26)_: give it corner resize handles
      (aspect kept) and the rotate handle, like other elements (not for Tile).

- [x] **Font choice for the text watermark** (owner) _(done 2026-09-26)_ — same font button + menu as Annotate text,
      listing the app's `fonts`.

- [x] **Adjust: the stage around the photo is dark in the light theme** (owner) _(fixed 2026-09-26)_ — the crop shade
      covered the whole stage. Fix: shade only the photo outside the crop; the empty stage keeps
      the normal stage colour, like every other tool.

- [x] **Compare: the divider line shows through the round handle** (owner) — the handle was
      semi-transparent. Now solid (surface colour) with ‹ › arrows _(fixed 2026-09-26)_.

### Found during Phase 6.5 review

- [x] **Paste should land at the mouse pointer** (owner) — now it pastes next to the original.
  _(fixed 2026-09-26)_
  - Fix: remember the last pointer position over the stage; when it's over the photo, centre the
    paste there, otherwise fall back to "next to the original / same relative spot".

### Planned later

- [ ] **`keepMetadata` for WebP / PNG output** (EXIF chunk / `eXIf`) and HEIC/WebP sources — now
      JPEG → JPEG only — _Phase 8_
- [ ] **Copy / cut from the Layers panel** (its keys stay inside the panel; the "⋯" menu has Copy)
      — _Phase 7_

- [ ] **Extend the canvas** (e.g. "make it square" with the Fill showing on the sides, for social
      posts) — belongs with Resize — _Phase 7_ (owner, 2026-09-25)

### Found during Phase 5.1

- [ ] **Owner's `.ico` crash not reproduced** — ask which browser/file. Chrome decodes ICO; Safari
      may not (would now show "This file type (ICO) isn't supported.") — _check with owner_
- [ ] **Hidden shapes can't be reached from the photo** (they're invisible, so right-click can't hit
      them) — Layers "⋯" / eye covers it; a "Show all" could come with multi-select — _Phase 6/7_
- [ ] **Touch long-press on a drawing tool** cancels the stroke it started; fine for now, verify on a
      real phone in Phase 7 (mobile pass)

### From Phase 5 — Annotate

- [ ] **Multi-select** (Shift-click, marquee) and group move/align — _Phase 7_ (owner, 2026-09-25)
- [x] **Copy / paste shapes** (⌘C / ⌘V, also between photos) — _done in 6.5 (2026-09-26)_
- [ ] **Paste images from the system clipboard** (e.g. a screenshot → new image shape) — _Phase 7_
- [ ] **Layers: drag to reorder and rename** (now: ↑/↓ buttons, Alt+↑/↓) — _Phase 7_
- [ ] **Phone layout: Annotate rows scroll sideways** — _Phase 7 (mobile pass)_
- [ ] **Line endpoint handles cover the arrow head** while selected — _Phase 7 polish_
  - Fix: smaller hollow endpoint handles, or place them just behind the tip.
- [ ] **In-place text editor may wrap slightly differently from the canvas** (CSS vs our measure) —
      _Phase 7_
  - Fix: render the editing text through the same layout and draw a caret, or match CSS exactly.
- [ ] **Fonts are system stacks**: text can look different on another OS; exports use the
      exporting machine's font — _document in Phase 8_ (apps can pass web fonts via `fonts`).
- [ ] **Inserted images are stored as data URLs inside EditState** (max 1600px WebP) — can make saved
      JSON large — _Phase 8_: option to upload assets and store URLs (`onAssetUpload` hook).
- [ ] **Keyboard focus**: fixed for stage/annotate clicks (they now take focus); audit other
      overlays in the Phase 7 a11y pass.

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
