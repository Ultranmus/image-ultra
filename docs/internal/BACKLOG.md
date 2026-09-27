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

### Found during 7.2b

- [x] **Duplicate React key `align` when a text box is selected** (owner) — the text-alignment group
      and the Align menu shared a key; the Align menu is now `arrange`. Note: e2e runs a production
      build, where React doesn't print key warnings — dev-only warnings need a manual check in
      `pnpm playground` (or a React unit-test setup, Phase 8).

- [ ] **App watermark logo reports a 1×1 size** until decoded, so its on-photo box (Watermark tool
      and element box) is square for an unlocked app logo — _Phase 7 polish_
- [ ] **Redaction over a shape is processed on the element layer on its own** (pixelating a shape on
      a transparent layer, then the pixelated photo under it): very close to pixelating the
      combined image, not identical at soft edges — fine for hiding; note for docs (Phase 8)

### Found during 7.2

- [x] **Cropped photo + added canvas space showed the cropped-away photo** in the space (owner) —
      fixed: rendering clips to the crop (DECISIONS #87)
- [x] **A locked group could never be selected again to unlock it** (owner) — fixed: locked shapes
      can join a selection; group menu has "Unlock all"
- [x] **Align popover had empty space on the right** (owner) — fixed: 3-column grid, fits content
- [x] **Photo position popover (Resize › Canvas) had empty space on the sides** (owner) — fits now
- [x] **Right-click on empty space inside a group box didn't open the group menu** (owner) — fixed
- [x] **One element model: redaction areas and the watermark selectable, groupable and reorderable
      with shapes** (owner, 2026-09-26) — _done in 7.2b_

- [ ] **Paste text from other apps as a text box** — now text on the system clipboard is ignored
      by ⌘V in the editor (only images and our own copies paste) — _nice to have_
- [ ] **Safari: check copy / paste events outside text fields** — the 50 ms fallback covers our
      own copies; pasting images from other apps needs the paste event — _Phase 7.4 (real devices)_

### Found during 7.1

- [x] **Group menu** (owner, 2026-09-26) _(done in 7.2)_ — right-click on a group member selects just it; group
      actions live only in the inspector and on the keyboard — _Phase 7 (with 7.2)_
  - Fix: right-click / long-press / Shift+F10 on a member of the selection keeps the group and opens
    a group menu: Copy, Paste, Duplicate, Delete · Align ▸ · Bring to front / Send to back (keeping
    the group's order) · Lock / Hide all.
- [ ] **Group resize is proportional only** (corners); no edge handles or free stretch — _nice to have_

### Planned later

- [ ] **`keepMetadata` for WebP / PNG output** (EXIF chunk / `eXIf`) and HEIC/WebP sources — now
      JPEG → JPEG only — _Phase 8_
- [x] **Copy / cut from the Layers panel** _(done in 7.1)_ (its keys stay inside the panel; the "⋯" menu has Copy)
      — _Phase 7_

- [x] **Extend the canvas** _(done in 7.2: Resize › Canvas)_ (e.g. "make it square" with the Fill showing on the sides, for social
      posts) — belongs with Resize — _Phase 7_ (owner, 2026-09-25)

### Found during Phase 5.1

- [ ] **Owner's `.ico` crash not reproduced** — ask which browser/file. Chrome decodes ICO; Safari
      may not (would now show "This file type (ICO) isn't supported.") — _check with owner_
- [x] **Hidden shapes can't be reached from the photo** _(7.1: "Show all" in Layers)_ (they're invisible, so right-click can't hit
      them) — Layers "⋯" / eye covers it; a "Show all" could come with multi-select — _Phase 6/7_
- [ ] **Touch long-press on a drawing tool** cancels the stroke it started; fine for now, verify on a
      real phone in Phase 7 (mobile pass)

### Found during 7.4

- [x] **Owner's real-phone test** of 7.4 (layout, pinch, two-finger pan, long-press menus, drawing)
      — _done 2026-09-27, five review rounds below; owner: "looks great"_
- [x] **Tool rail: no space after the last tool on phones** (owner, phone test) — the Watermark card
      touched the right edge when scrolled to the end: the list was only as wide as the rail, so
      the tools overflowed past its end padding. Fix: the list is as wide as its content
      (`width: max-content; min-width: 100%`) — _fixed 2026-09-27_
- [x] **Resize panel / Adjust panel lost their layout** (owner, phone test) — Phase 7.2 slipped the
      Canvas ruler rule into the middle of `.iu-adjust, .iu-resize { … }`, so `.iu-adjust` lost its
      column layout and max width. Fix: split the rules again; the Canvas ruler uses the default
      tick spacing so its scale fills the ruler like the other tools — _fixed 2026-09-27_
- [x] **Resize: Size | Canvas switch not centred** (owner) — it sat in the left column. Fix: it's in
      the middle column now, on every width — _fixed 2026-09-27_
- [x] **Resize › Canvas: Reset on phones** (owner) — on narrow editors Reset sits at the start of the
      header row, the switch stays centred on the same line — _fixed 2026-09-27_
- [x] **Watermark too tall on phones** (owner) — 4 rows (223px at 390). Fix: position, opacity and
      the Size ruler share one line on narrow editors — _fixed 2026-09-27_
- [x] **Sticker: copy / delete below the tabs** (owner) — a selected sticker's actions should be at
      the top. Fix: on narrow editors they take the first line, at the end — _fixed 2026-09-27_
- [x] **Redact › Solid looks empty** (owner, all widths) — a lone colour button and a large hint.
      Fix: an inline colour strip (like Fill); the hint uses the small text size — _fixed 2026-09-27_
- [x] **Finetune: Auto should be at the start on phones** (owner) — Save look / Reset stay at the
      end — _fixed 2026-09-27_
- [x] **Annotate too tall on phones** (owner) — the 9 tools wrapped to 2 lines. Owner's choice: one
      line that scrolls sideways on phones; Layers moves to the end of the selection row — _fixed 2026-09-27_
- [x] **Curves: graph beside the channel switch on phones** (owner) — Fix: below 480px the switch +
      reset take one line and the graph the full row — _fixed 2026-09-27_
- [x] **Annotate selection row still messy on phones** (owner) — it wrapped onto 2–3 lines. Fix: one
      line; the style controls scroll sideways (edge fade), Duplicate / Delete stay at the end
      — _fixed 2026-09-27_
- [x] **Layers belongs in the TopBar** (owner: "a global thing") — Fix: ▤ button after History, works
      from every tool; TopBar reordered (Close, Reset | Undo, Redo | Compare, History, Layers | zoom |
      Done); Reset hides on phones (DECISIONS #92) — _fixed 2026-09-27_
- [x] **Curves: two stacked switches look bad** (owner, phone) — Adjust | Curves | Levels above
      RGB | Red | Green | Blue read as two equal menus. Fix: channels are chips with a colour dot (the
      Adjust mode's chip style), on every width; tighter chips below 360px — _fixed 2026-09-27_
- [x] **Focus rings clipped in toolbar rows** (owner, screenshot: Annotate's Select button) — the
      edge-fade mask cut off the ring outside the row's box. Fix: the mask only applies while the
      row overflows; e2e ring check now treats masks as clipping — _fixed 2026-09-27_
- [ ] **Owner VoiceOver spot check** (7.5c) — ⌘F5 on the Mac, open the playground: Tab through the
      TopBar and rail, switch tools, undo, select a shape with Tab on the photo. Listen for anything
      missing, doubled or confusing — _7.5 review_
- [ ] **A rare e2e flake** (7.5b): 1 of 4 full runs failed one `toBeLessThan` check (not in
      keyboard / mobile specs — 102/102 on repeat); two clean full runs after. Find it with
      `--repeat-each` per spec if it shows up again — _7.7_
- [x] **Segmented switches are 28px tall** (below the 40px touch size of buttons; WCAG 2.2 minimum
      is 24px, so they pass) — consider 36–40px on touch devices — _done 2026-09-27 (7.5d): 36px on touch screens (`--iu-size-choice`), 28px with a mouse_

### Found during 7.6

- [x] **Layers list didn't scroll with the wheel — it zoomed the photo** (owner) — the stage's
      wheel-zoom took every wheel event on top of it. Fix: a wheel over anything that scrolls on its
      own (Layers list, long text box) scrolls it; a pinch there does nothing — _fixed 2026-09-27_
- [x] **Shortcuts scrollbar covered the key caps** (owner, macOS overlay scrollbars) — Fix: 8px room
      at the scrolling edge (+ `scrollbar-gutter: stable`, thin), same for the Layers list; e2e
      checks the key caps end 8px before the edge — _fixed 2026-09-27_
- [x] **History step names stayed English after switching language** (owner) — the crop-view wheel
      zoom and Annotate's arrow-key nudge listeners are registered once and kept the labels from
      that moment. Fix: `useLatest(labels)` read at event time; e2e switches language then zooms +
      nudges. (Steps made _before_ a switch keep the language they were made in — history stores
      text.) — _fixed 2026-09-27_
- [ ] **Hindi and Arabic playground labels are drafts** (7.6b) — written by Claude, need a native
      speaker's review before an app copies them (`apps/playground/app/locales/`) — _before Phase 8
      docs_
- [ ] **Emoji names and search are English** (owner chose backlog, 2026-09-27) — the emoji data file
      is English. Fix: an `emojiLocale` option that loads a localized emoji data file (emojibase
      has ~20 languages) — _later_

### From Phase 5 — Annotate

- [x] **Multi-select** (Shift-click, marquee) and group move/align — _done in 7.1 (2026-09-26)_
- [x] **Copy / paste shapes** (⌘C / ⌘V, also between photos) — _done in 6.5 (2026-09-26)_
- [x] **Paste images from the system clipboard** _(done in 7.2)_ (e.g. a screenshot → new image shape) — _Phase 7_
- [x] **Layers: drag to reorder and rename** (now: ↑/↓ buttons, Alt+↑/↓) — _done in 7.1_
- [x] **Phone layout: Annotate rows scroll sideways** — _fixed 2026-09-27 (7.4): rows wrap_
- [x] **Line endpoint handles cover the arrow head** while selected — _done in 7.1 (hollow handle)_
  - Fix: smaller hollow endpoint handles, or place them just behind the tip.
- [x] **In-place text editor may wrap slightly differently from the canvas** (CSS vs our measure) — _done in 7.1 (DECISIONS #82)_ —
      _Phase 7_
  - Fix: render the editing text through the same layout and draw a caret, or match CSS exactly.
- [ ] **Fonts are system stacks**: text can look different on another OS; exports use the
      exporting machine's font — _document in Phase 8_ (apps can pass web fonts via `fonts`).
- [ ] **Inserted images are stored as data URLs inside EditState** (max 1600px WebP) — can make saved
      JSON large — _Phase 8_: option to upload assets and store URLs (`onAssetUpload` hook).
- [x] **Keyboard focus**: fixed for stage/annotate clicks (they now take focus); audit other
      overlays in the Phase 7 a11y pass. — _done 2026-09-27 (7.5b, DECISIONS #94)_

### From Phase 4 — Finetune + Filters

- [x] **Histogram shows "before" only** (Curves/Levels) — _fixed 2026-09-26 (7.3): "after" outline_
  - Now: histogram is computed from the image with geometry only, before colour edits.
  - Fix: add a Before/After toggle (or show both, "after" as an outline) using
    `renderAnalysisPixels` with the current colour state, debounced.
- [x] **Filter thumbnails ignore the user's adjustments** — _fixed 2026-09-26 (7.3): always on_
  - Now: each thumbnail previews the filter on the plain (cropped) photo.
  - Fix: optional "preview on my edits" mode — render `{...edit, filter}` per thumbnail;
    watch cost (28 renders per change → debounce ~150ms).
- [x] **Preset names are English only** (filter presets + `SIZE_PRESETS`) — _done 2026-09-27 (7.6a): `labels.filterNames` / `sizePresetNames`, `filterPresets` / `sizePresets` props_
  - Fix: labels keyed by preset id (`labels.filterNames[id]`, `labels.sizePresetNames[id]`) with
    English defaults; `sizePresets` / `filterPresets` props for custom lists.
- [x] **Every arrow-key press is its own undo step** (dials, curve points, levels, crop box) — _fixed
      2026-09-26 (7.3, DECISIONS #90; also Annotate nudges)_ —
      _Phase 7 (a11y)_
  - Fix: coalesce key presses on the same control within ~600ms into one step (keep the change
    open with a timer instead of `endChange` on each keyup).
- [ ] **20MP performance not formally measured** — _Phase 7 (perf)_
  - Fix: benchmark slider drags on a 20–24MP image (GPU + Canvas2D fallback) and record frame
    times; consider a downscaled preview texture while dragging.
- [ ] **Detail effects differ slightly between GPU and CPU fallback** (mean < 3/255) — _nice to have_
  - Fix: use the same kernel on both (e.g. GPU box ×3, or CPU true Gaussian).

### From Phase 3 — Adjust

- [x] **Phone layout: Adjust header row scrolls sideways** ("Horizontal" label clipped) — _fixed
      2026-09-27 (7.4): rows wrap, switch on its own line below 480px_
  - Fix: on narrow containers put the SegmentedControl on its own row or shorten labels
    (icons + tooltips), keeping the ControlBar height fixed.
- [x] **Vignette preview while cropping uses the whole image** _(fixed in 7.2)_, not the crop (export is correct) —
      _Phase 7_
  - Fix: pass the crop rect to the preview render as the vignette/ellipse reference frame.
- [x] **No zoom in crop view** _(done in 7.2: wheel + pinch)_ (wheel/pinch disabled while cropping) — _Phase 7_
  - Fix: Pintura-style zoom that shrinks the crop around the pointer.
- [ ] **Canvas2D fallback approximates perspective with a 20×20 mesh** — _nice to have_
  - Fix: adaptive grid density based on the amount of tilt.

### From Phase 2 — Core engine

- [ ] **Images above the GPU texture limit are downscaled** (16384px desktop, 4096–8192 mobile) —
      _Phase 7 (perf)_
  - Fix: tiled textures / tiled export.

## Done

_(nothing yet)_
