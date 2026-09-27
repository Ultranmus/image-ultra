# image-ultra — UI Vision & Experience Rules

This is the source of truth for how image-ultra looks and feels. If a component doesn't match this doc,
the component is wrong (or this doc must be updated first, deliberately).

## 1. The feeling we are selling

> "It feels like a native pro photo app, not a web form."

- **Calm.** Dark, quiet chrome. The photo is the only colourful thing on screen.
- **Instant.** Every slider/drag updates the image the same frame. No "Apply" buttons for adjustments.
- **Confident.** Nothing is destructive. Undo is always one keystroke away, so users experiment freely.
- **Obvious.** Every tool has an icon **and** a label. No mystery icons, no hidden menus for core actions.
- **Consistent.** One icon style, one slider style, one spacing scale, one motion curve. No mixed kits.

## 2. Principles

1. **Image is the hero.** Chrome takes the minimum space; stage gets the rest. Chrome never overlaps the image except floating inspector popovers.
2. **One decision at a time.** Selecting a tool shows only that tool's controls (contextual ControlBar).
3. **Direct manipulation first.** Drag on the image (crop handles, shapes, dial) before numeric inputs. Numeric input is available but secondary.
4. **Live feedback < 16 ms** for interactions; heavy work is debounced to the GPU, never blocks input.
5. **Progressive disclosure.** Common controls visible; advanced (curves, levels, custom ratios) one tap deeper.
6. **Reversible everything.** Each tool has a per-tool reset; global Reset in TopBar; unlimited undo.
7. **No modal dialogs during editing.** Only for Save options (optional) and "discard changes?" confirm.

## 3. Layout

### Desktop / tablet landscape (container width ≥ 768px)

```
┌──────────────────────────────────────────────────────────────┐
│ TopBar: [✕][↺]  [↶][↷] │ [◧][🕘][▤] │ [− 100% +]    [⌨][Done ▸] │  48px
├────────┬─────────────────────────────────────────────────────┤
│ Tool   │                                                     │
│ Rail   │                    STAGE                            │
│ (72px) │           (image centered, fit, checkerboard        │
│ icon + │            only where transparent)                  │
│ label  │                                                     │
│ vert.  ├─────────────────────────────────────────────────────┤
│        │ ControlBar (contextual: ruler slider / dial /       │  148px
│        │ preset strip / segmented options)                   │
└────────┴─────────────────────────────────────────────────────┘
```

### Right-to-left (`dir="rtl"` or an RTL page; 7.6b, DECISIONS #98)

The whole chrome mirrors: tool rail on the right (bottom rail starts at the right), TopBar ✕ on
the right and Done on the left, Undo / Redo arrows flipped, rows and Layers panel (left side)
reversed. ← / → in rows (tools, chips, colours, stickers, switches) follow the reading order.
**Stays left-to-right:** the photo and everything drawn on it, sliders (→ = more), curves,
levels, histograms, the colour picker and the before/after divider. Text boxes and the watermark
draw Arabic / Hebrew right-to-left (preview and export); text fields the user types in are
`dir="auto"`.

### Mobile / narrow (container width < 768px)

```
TopBar (compact: ✕  ↶ ↷ ◧ 🕘 ▤ 100%  ✓ — no ↺ below 480px)
STAGE
ControlBar (contextual)
ToolRail (horizontal, scrollable, bottom — thumb zone)
```

- Breakpoints use **container queries** on `.iu-root`, not viewport — the editor may live in a small modal.
- Minimum usable size: 320 × 480.
- **Rows never scroll sideways** (owner, 7.4): a tool's header / inspector row that doesn't fit
  wraps onto a second line, and the ControlBar grows to fit (148px minimum,
  `--iu-size-controlbar-max` = 248px, then it scrolls up/down). Below 480px a switch in a header
  row takes the second line so the end button (Reset, Clear all) stays with the tool buttons; a
  long button group (Annotate tools, shape inspector) wraps inside its own line next to the end
  group. Thumbnail, sticker and colour **strips** still scroll sideways (edge fade shows more).
- **Phone layouts per tool** (owner, 7.4 review; DECISIONS #91): below 480px Annotate's drawing
  tools are **one line that scrolls sideways** (the one exception to "rows wrap"), and so is the
  selection row: its style controls scroll (edge fade), Duplicate / Delete stay at the end.
  Finetune: Auto at the start, Save look / Reset at the end; Curves puts the channel chips + reset
  on one line and the graph on the full row below.
  Resize: the Size | Canvas switch stays centred, Reset at the start. Below 768px Watermark puts
  position, opacity and Size on one line (text, colour, font, bold on the line above), and a
  selected sticker's opacity / copy / delete take the first line, at the end.
- **Two fingers always pinch / pan** the photo, in every tool: a second finger cancels what the
  first one started (a stroke, a new shape, a drag).

## 4. Region names (use these names in code and conversation)

| Region     | Component       | Purpose                                                                                             |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------- |
| TopBar     | `<TopBar/>`     | Cancel, Reset, Undo/Redo, Compare, History, Layers, Zoom, Done/Save                                 |
| ToolRail   | `<ToolRail/>`   | Tool switcher (Adjust, Finetune, Filter, Annotate, Redact, Sticker, Frame, Fill, Resize, Watermark) |
| Stage      | `<Stage/>`      | Canvas + interaction overlays (crop box, shape handles)                                             |
| ControlBar | `<ControlBar/>` | Current tool's controls                                                                             |
| Inspector  | `<Inspector/>`  | Floating popover for a selected annotation shape                                                    |

## 5. Signature controls (build once, reuse everywhere)

- **RulerSlider** — Pintura-style horizontal tick ruler that scrolls under a fixed centre marker. Used by finetune values and rotation. Shows value bubble while dragging, double-click/tap resets to default. Also usable by keyboard (←/→, Shift = ×10).
- **Dial** — rotation/straighten: ruler from −45° to +45°, snaps to 0 with haptic-like soft snap.
- **PresetStrip** — horizontal scroll of thumbnails (filters, crop ratios, frames) with label under each; selected gets accent ring.
- **SegmentedControl** — 2–5 mutually exclusive options (e.g. Crop / Rotate / Perspective sub-tools).
- **NumberField** — compact numeric input with label + unit; commits on Enter/blur; ↑/↓ step (Shift ×10).
- **SwatchPicker** — row of colour swatches + "custom" opening a compact HSV picker with hex input and eyedropper (where supported).
- **IconButton** — 40×40 min touch target, tooltip on hover (desktop), label under icon in ToolRail.

## 5b. Tool layouts (built so far)

- **Adjust** ControlBar, 3 rows: [rotate left · flip H · flip V] — SegmentedControl [Straighten |
  Vertical | Horizontal] — [reset]; RulerSlider for the selected angle; aspect PresetStrip
  (Free, Original, Circle, 1:1, 4:5, 5:4, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9) with AspectGlyphs.
- **Adjust stage (crop view):** the whole image is shown, framed so the crop is fitted and centred
  (40px padding); the photo outside the crop is shaded (`--iu-crop-shade`, clipped to the photo's outline — the
  empty stage around it keeps the normal stage colour, like every other tool); thin white frame, L-shaped corner
  handles + edge bars, 32px hit areas; thirds grid only while interacting; drag anywhere = move the
  image under the crop; arrow keys move the crop (focus the crop area). TopBar zoom is disabled here;
  instead the wheel / trackpad pinch / two-finger pinch zooms the photo under the crop around the
  pointer (Pintura-style: the crop gets smaller, the box stays put; one undo step per gesture).
  Vignette in this view is measured on the crop, as in the result.
- **Resize** ControlBar: SegmentedControl [Size | Canvas] — [reset, Canvas only].
  Size = [Width px] [lock] [Height px] + "Original size: W × H" (turns into a `--iu-warning` note
  when upscaling); PresetStrip: Original size, 50%, social presets (a preset crops to its shape and
  drops added canvas space). Canvas = space added around the photo: Padding RulerSlider (0–50 % of
  the short side) + "Photo position" popover (3×3 spots, like Watermark; only with a shape), and a
  PresetStrip of canvas shapes (Photo shape, 1:1, 4:5, 5:4, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9) with
  AspectGlyphs. The added space is transparent (checkerboard on the stage), so the Fill shows there;
  shapes, stickers and text can sit on it. Vignette and the round crop stay on the photo.
- **Finetune** ControlBar: SegmentedControl [Adjust | Curves | Levels] — [✨ Auto] [Save look]
  [reset]. Adjust = RulerSlider (−100…+100, "+25"/"−25") above a chip strip of the 16 adjustments
  (a dot marks changed ones). Curves = channel chips (RGB · Red · Green · Blue, each with a dot in its colour — a sub-choice, so
  chips, not a second SegmentedControl; owner, 7.4 review) + small reset on the left, 80px
  graph (tinted histogram, thirds grid, dashed identity, points = sliders; click adds, double-click
  or Delete removes). Levels = 32px histogram with clipped areas dimmed, three triangle handles,
  values row ("Black point 0 · Mid-tones 1.00 · White point 255").
  Both histograms show the photo before colour edits as the filled area and, once anything changed,
  the result ("after") as a thin outline on the same scale.
- **Save look** is inline (name field + ✓/✕ replace the header buttons) — never a modal. After
  saving, an inline notice "Saved “Name” · View in Filters" (role=status, 6s) links to the Filter tool.
- **Inline notice pattern** (`.iu-notice` + `.iu-link`): short confirmations live in the ControlBar
  header's middle slot, never as toasts or dialogs.
- **Filter** ControlBar: Intensity RulerSlider (disabled when "Original"), then a thumbnail
  PresetStrip (52px live previews of each look on the current crop — presets on top of the user's
  Finetune / Levels / Curves edits, saved looks as they are — label below, selected = accent
  ring): Original, then the user's looks (bookmark badge; hover ✕ / Delete key removes), a divider,
  then the 28 presets. Own looks come first so a just-saved look is visible without scrolling.
- **Annotate** ControlBar: row 1 = drawing tools as icon radios (Select V, Pen P, Line L, Arrow A,
  Rectangle R, Ellipse O, Polygon G, Text T) + Add image; row 2 = inspector for the selected
  shape (or the defaults of the current tool): colour/fill buttons (round swatch dots; fill shows a
  ring), width / text size / font / corner radius / opacity as popovers, Bold + alignment + arrow-head
  toggles inline (`data-active`), Align (a compact popover: 3-column grid — left / centre / right,
  top / middle / bottom, then distribute; a single shape aligns to the photo), then Duplicate / Delete on the right. Nothing to show → one muted hint. With several shapes
  selected, row 2 = the **group inspector**: colour, fill, line width (S/M/L/XL), opacity, Align
  (+ Distribute horizontally / vertically for 3+), and "N selected" muted before Duplicate / Delete.
- **Annotate stage:** accent selection outline, white square handles (10px visual, rotated with the
  shape, direction-aware cursors), a round rotate handle 28px above the top edge, round endpoint
  handles for lines, pink dashed snap guides, hover outline in Select mode. Text is edited in place
  (transparent textarea over the canvas, dashed accent outline) and keeps its resize/rotate handles
  while editing — resize or rotate without leaving the text (like Canva); the editor wraps lines exactly
  like the drawn text. Line ends with an arrow / dot get a hollow round handle so the head stays
  visible. **Layers** (▤ in the TopBar, owner 2026-09-27; DECISIONS #92) = floating panel top-right. It
  is editor-wide: open, it shows in every tool that shows elements (Annotate, Sticker, Redact); from any
  other tool the button switches to Annotate and opens it. Each row of the panel: each row: name (drag to reorder, with an accent drop
  line; double-click or F2 to rename inline), show/hide, lock, up/down, and "⋯" (the shape menu);
  "Show all" in the header while anything is hidden; Shift / ⌘-click rows to select several.
- **Multi-select** (Annotate, Sticker and Redact — any element): Shift-click adds/removes one (with
  any tool), a mouse drag on empty space
  draws a selection box (dashed accent outline on `--iu-accent-soft`; touching counts; Shift adds),
  ⌘A selects all (not hidden ones; locked ones join but never move — a fully locked group shows a
  dashed box without handles). The group shows a faint outline on each member and one
  accent box around all of them with 4 corner handles (proportional resize — strokes and text scale
  too) and the round rotate handle (the box turns with the group while dragging). Drag inside the box
  moves all of it (snaps like one shape); a click on a member without dragging selects just it.
  Delete / ⌘D / arrows / ⌘C ⌘X ⌘V act on the whole group. Space + drag pans the photo (touch: one
  finger still pans, so no selection box on touch).
- **Annotate clicks:** with any drawing tool, a click on an existing shape selects it and switches to
  Select (a drag still draws). Select tool: click the already selected text box → edit it. Double-
  clicking a shape never zooms the photo. Clicking outside the editor or on empty toolbar space
  deselects; clicking a control keeps the selection. "No colour" = transparency checkerboard. Text tool: click a text box → edit it, caret where you clicked; click
  empty photo → new box reading "Text", all selected so typing replaces it. Text never disappears on
  its own — an emptied box goes back to "Text"; only Delete removes it.
- **Group menu** (right-click / long-press anywhere inside a multi-selection's box — on a member or
  the space between them — or Shift+F10 with a group selected; the group stays selected): muted "N selected" heading · Copy, Paste, Duplicate,
  Delete · Align ▸ (submenu: 6 aligns, then Distribute ×2) · Bring to front, Send to back · Lock all,
  Lock all / Unlock all (whichever applies; locking keeps the group selected), Hide all. Same look as
  the shape menu.
- **Paste from other apps:** ⌘V with an image on the system clipboard (e.g. a screenshot) adds it as
  an image shape (40 % of the result's width, at the pointer when it's over the photo) in Annotate
  (or Sticker when open), selected. Our own copy wins while it's still the newest thing copied.
- **Shape menu** (right-click / long-press on a shape, including locked ones; Shift+F10 or the Menu
  key for the selected shape; "⋯" in Layers): Lock/Unlock, Hide/Show · Bring to front, Bring forward,
  Send backward, Send to back · Copy, Paste, Duplicate, Delete · Show in Layers. Compact 32px rows, separators,
  Delete in the danger colour, disabled rows muted. Same surface as popovers.
- **TopBar order** (owner, 2026-09-27): ✕ Close, ↺ Reset | ↶ Undo, ↷ Redo | ◧ Compare, 🕘 History,
  ▤ Layers | zoom | ⌨, Done. Below 480px Reset hides (History › "Original" does the same).
- **TopBar extras:** 🕘 History popover (list: "Original" + each step label, current step in
  accent, later steps muted = redo-able; click jumps). ◧ Compare: press-and-hold shows the whole
  "before" image, a click toggles split view (aria-pressed). ⌨ Keyboard shortcuts popover (also `?`):
  two groups, General and Annotate (incl. ⌘C / ⌘X / ⌘V: copy, cut, paste — a paste lands at the mouse
  pointer when it is over the photo, else next to the original; from another tool it switches to
  Annotate or Redact and selects the copy), key caps in mono on `--iu-surface-2`. Below 768px only ⌨ and
  the dividers hide; below 480px zoom is just the % button (tap = fit ↔ 100%, pinch to zoom) and
  Done shows only its icon; below 360px TopBar buttons are 34px
  (2px gaps) so it fits at 320px. Buttons always keep a gap: hover/active backgrounds never touch.
- **Split compare:** thin white divider (`--iu-crop-frame`) across the stage with a round 28px solid grab
  handle (surface colour, ‹ › arrows) (role=slider, ←/→ move it), "Before" / "After" pills at the top on each side
  (`--iu-overlay` background). Before = same crop/rotation, no colour or annotations.
- **Redact** ControlBar: row 1 = Select / Box / Brush icon radios (+ brush size popover in Brush mode) —
  style SegmentedControl Pixelate · Blur · Solid (default Pixelate) — Delete (when selected) and
  "Clear all" on the right. Row 2 = Strength RulerSlider (0–100) for Pixelate/Blur, or an inline
  colour strip for Solid (like Fill; owner, 7.4 review). Hints use the small text size. With Blur a muted hint: "For faces, names and numbers, Pixelate or Solid is
  safer." Nothing drawn and nothing selected → the controls set the style for the next area; with
  areas selected they edit all of them. Delete removes whatever is selected (any element).
- **Redact stage:** Box = drag a rectangle (a plain click draws nothing); Brush = paint, round, size
  relative to the photo. The effect shows live. Click an area to select it (accent outline + 8 white
  resize handles + the round rotate handle for boxes and brush areas alike — a brush stroke scales
  to fit; rotation soft-snaps to 90°, Shift = 15° steps), press anywhere
  inside the outline and drag to move, the brush size control changes a selected brush area, Delete removes,
  Esc deselects, hover outline. Brush size is set in its popover (no circle around the cursor). Selected area → the controls edit it. Compare's "before" side shows
  no redactions. The stage is the shared element overlay (DECISIONS #88): Select mode, Shift-click,
  selection box, groups, menus, Layers and reordering work exactly as in Annotate, on every element.
- **Elements** (DECISIONS #88): shapes, text, images, stickers, emoji, redaction areas and the
  watermark are one ordered list — any of them can be selected, grouped, moved, aligned and brought
  forward / sent backward in Annotate, Sticker and Redact. A redaction area hides the photo and every
  element below it (above it, elements stay sharp). The watermark shows up as an element (corner
  handles only — it scales, never stretches; not lockable, hideable, copyable or duplicable — there's
  one; the Layers row greys out those buttons); by default it's on top, and new shapes go under it.
  An app-locked watermark is always on top and never selectable. Draw order: photo → Fill → Frame →
  elements (in order) → watermark if it's on top. A selected redaction area or the watermark shows
  "Edit in Redact" / "Edit in Watermark" in Annotate's inspector.
- **Frame** ControlBar: a thumbnail PresetStrip (the current photo with each frame): None, Border,
  Rounded, Bevel, Line, Double line, Inset, Plus, Lumber, Corners, Polaroid. Row 2 (not for None): Size RulerSlider (1–15 % of
  the photo's short side) + colour button. Frames are drawn over the photo's edges — the image size
  never changes — on top of everything else (annotations included).
- **Fill** ControlBar: SegmentedControl None · Colour · Image · Blurred photo on top; the chosen
  kind's options **underneath** (owner): Colour = an inline **ColorStrip** (32px round swatches like
  the filter strip, selected = accent ring, the last button = custom colour → popover with the HSV
  picker); Image = "Choose image…" + a small preview; None / Blurred photo = a muted hint that Fill
  shows where the photo is transparent (PNGs, round crops). Its colour row scrolls sideways on narrow editors (a strip).
  JPEG export uses the fill instead of white.
- **Watermark** ControlBar: row 1 = SegmentedControl None · Text · Logo, then the text field (Text)
  or "Choose logo…" + preview (Logo), the colour button, Font (the same menu as Annotate text, the
  app's `fonts`) and Bold (Text). Row 2 = Position and
  Opacity buttons together (Position popover: 3×3 grid of spots + a "Tile" button as wide as its
  text), then the Size ruler (1–100 %: 100 % fills the photo's width inside the margin). On the
  photo the watermark behaves like other elements: dashed outline, 4 corner handles (resize, aspect
  kept → Size) and the round rotate handle (soft snap to 90°, Shift = 15°); drag it (or arrow keys,
  Shift = 5 %) anywhere → a custom position, and the grid then shows no spot. Not for Tile.
  Rows are centred groups with 16px between them. **Ruler names sit under the ruler** (Watermark
  Size, Frame Size, Redact Strength — `.iu-rulerfield`). Drawn on top of everything
  (frame included). When the app locks it: one muted line "This watermark is added by the app" and
  no controls.
- **Sticker** ControlBar, three rows: (1) Stickers · Emoji, a Search field, Upload — and for a
  selected sticker Opacity, Duplicate, Delete; (2) category chips — Stickers: **Basic** (the app's
  stickers + ours), then Smileys, People, Animals & nature, Food & drink, Travel & places,
  Activities, Objects, Symbols, Flags from the 3D library; Emoji: the same nine; hidden while
  searching; (3) a strip of 44px tiles. Search matches the start of words in names and tags. A tap
  places the sticker in the middle of the photo, selected; on the photo it behaves like an Annotate
  shape in Select mode (move, resize, rotate, Delete, right-click menu).
- **Cursors on the photo (Annotate + Redact):** move anywhere inside the selected element's box (a
  drag there moves it, even the empty middle of a line or polygon),
  pointer over any other element (a click selects it), resize cursors on handles (turned with the
  element), grab on the rotate handle, grabbing while dragging, crosshair on empty photo with a
  drawing tool (text cursor for the Text tool, a brush cursor for Redact's Brush), default arrow
  with Select. No size circle follows the pointer.
- **Popovers and menus** (Radix, portalled inside `.iu-root`) are the only floating UI besides the
  Layers panel and tooltips.
- **Tooltips:** one shared tooltip for every `data-tooltip` element — below the element (flips above
  near the bottom edge, stays inside the window), 400ms hover delay, instant between neighbours,
  shown on keyboard focus, never on touch. Never clipped by panels.
- **Load errors** use the empty-state screen with a specific title: "This file type (HEIC) isn't
  supported.", "This image file is damaged and can't be opened.", "This file isn't an image.",
  "Couldn't download the image." — plus Browse files. Never a framework/browser error.
- Dense panels use small 24px IconButtons (`size="sm"`) for secondary actions (per-editor reset).

## 6. Interaction details

- Tool switch: ControlBar content cross-fades (160ms) and slides 8px; stage does not jump.
- Crop: image moves under a fixed crop box when dragging inside; handles resize box; on release, box re-centres and image animates to fit (320ms). Rule-of-thirds grid appears only while interacting.
- Ratio change animates the box, never snaps instantly.
- Zoom: wheel/trackpad pinch around cursor; touch pinch; double-click toggles fit ↔ 100%. Space+drag pans on desktop.
- Sliders commit one history entry per drag (coalesced), not per pixel. Quick arrow-key presses on
  one control (< 600 ms apart) are one entry too: dials, curve points, levels, crop box, nudges.
- Selection handles: 10px visual, 32px hit area.
- Hold `\` (or the compare button) → show original. Release → back.
- Keyboard: every tool reachable with Tab; shortcuts listed in `?` overlay.

## 7. Visual language

- **Surfaces:** near-black canvas background, slightly lifted panels, hairline borders. No heavy shadows; one soft shadow level for popovers only.
- **Accent:** single accent colour (brand plum `#4d194d`, lighter tint in dark theme — see THEMING.md) used only for: selected state, primary button, active slider fill, focus ring. Never for large areas.
- **Type:** inherit host font by default (`--iu-font-family: inherit` falls back to system UI). Sizes 11/12/13/14/16. Labels 12px medium, values tabular-nums.
- **Icons:** our own set. 24px grid, 1.75px stroke, round caps/joins, no fills except selected state variants. Rendered at 20px in ToolRail, 18px in controls.
- **Radii:** 8 (controls), 12 (panels/popovers), 999 (pills, swatches).
- **Spacing:** 4px scale (4, 8, 12, 16, 20, 24, 32).
- **Motion:** 120ms (hover/press), 200ms (panel/tool switch), 320ms (stage/crop re-fit). Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion` → durations 0, no slides, animated zooms instant, a still loading placeholder (no shimmer); e2e checks nothing is running. Windows high contrast: focus and selected states become system-colour outlines. Touch screens: switches and chips are 36px (28px with a mouse).
- **Loading:** skeleton shimmer on stage only if load > 300ms; no spinners under 300ms.

## 8. Don'ts (things that made Filerobot feel off)

- ❌ Mixed icon sets, random paddings, visually different sliders per tool.
- ❌ Tabs within tabs within dropdowns. Max depth: Tool → sub-tool (segmented) → control.
- ❌ Text-only buttons for tools, or icon-only without label in ToolRail.
- ❌ Browser-default `<select>`, `<input type=range>`, `alert()`, `confirm()`.
- ❌ Hardcoded colours/sizes in components. Tokens only (`THEMING.md`).
- ❌ `left` / `right` for layout. Layout CSS uses logical properties (`margin-inline-start`,
  `inset-inline-end`, `text-align: start`…) so right-to-left mirrors by itself; only geometry
  (the photo's overlays, ruler, curves, levels, compare divider) stays physical.
- ❌ Hardcoded UI text. Every string, name and history step comes from the typed labels
  (`i18n.ts`); `e2e/i18n.spec.ts` walks the editor in a pseudo-locale (`/?locale=pseudo`, every
  label wrapped in ⟦ ⟧) and fails on any text or accessible name without the brackets.
- ❌ Layout shift when switching tools. ControlBar has a fixed height per breakpoint.

## 9. Accessibility baseline

- WCAG AA contrast in both themes (checked for text + focus ring).
- All controls have accessible names; sliders expose `aria-valuenow/min/max/valuetext`.
- Visible focus ring (`--iu-focus-ring`) on keyboard focus only (`:focus-visible`).
- **Announcements** (7.5c, DECISIONS #95) through one polite live region (+ an assertive one for
  failures): the tool name on switch; "Undone: …", "Redone: …", "History: …"; "Zoom 150%" only for a
  zoom the user asked for (a re-fit says nothing); "Crop 1600 × 1600" in Adjust; "Rectangle
  selected" / "3 selected" / "Nothing selected"; "Saving…", "Saved", "Couldn't save the image."
  Zoom and crop wait until they settle (500ms). A load error on the stage is an alert.
- **Names:** the stage is a group "Photo, 2400 × 1600" (the size it will be saved at); in Annotate /
  Sticker / Redact the photo layer is "Photo and its elements", described by how to use it (Tab,
  Enter, ?). Curve points read "input 128, output 140"; the compare divider reads a percentage.
- **Checked automatically** (7.5a, DECISIONS #93): `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A + AA) on every
  tool, mode, selection and popover, in dark + light, at desktop + 390px — zero problems allowed.
- A hidden `<input type="file">` opened by a visible button is `aria-hidden` (the button is the
  control). Invisible menu anchors are `aria-hidden`. A button that opens a picker is a button
  (`aria-pressed` for "selected"), never a radio. A panel that scrolls is focusable.
- **Keyboard** (7.5b, DECISIONS #94): Tab order TopBar → ToolRail (one stop, arrows switch tools) →
  photo → ControlBar. In Annotate / Sticker / Redact the **photo is a Tab stop** (inset accent ring
  on `:focus-visible`): Tab / Shift+Tab select the next / previous element in drawing order; past
  either end the selection clears and Tab moves on (never a trap). With a drawing tool, **Enter on
  the photo adds a default-size shape in the middle** (Text opens for typing; Pen / Polygon need a
  pointer). Enter, Space, arrows and Home/End belong to whichever control has focus. Long rows of
  items (sticker tiles, chips, colours) are one Tab stop with arrow keys.
- **Focus is never lost**: a button that disables itself (Undo at the first step, Reset) hands focus
  to its neighbour; a busy button (Done while saving, Auto) stays focusable with `aria-disabled`;
  closing the Save-look form, a text box (Esc) or the Layers panel (Esc / ✕) puts focus back on
  the button / photo it came from. Opening Layers from the TopBar moves focus into the panel.
  Scrolling rows leave room for the 4px focus ring (e2e checks every tool).

## 10. AI features (Phase 9 — spec in `AI_ROADMAP.md`)

- **Auto-enhance (shipped, Phase 4)** is the reference for AI UI: a labelled ✨ button in the
  tool's header, one undo step, results visible as normal slider/levels values.
- **Where AI lives:** one extra ToolRail item **"Magic"** (sparkle icon, only shown when the plugin is
  installed) holding Remove background, Erase, Prompt edit. Other AI features appear **inside the tool
  they belong to**, never as a separate place: "Auto" in Finetune, "Smart" crop in Adjust, "Detect"
  in Redact, "Enhance 2×/4×" in Resize, "Description" in the save step.
- **AI actions use the same controls** as everything else (IconButton, SegmentedControl, RulerSlider).
  Mark them with a small sparkle glyph, not a different colour scheme or gradient.
- **Progress pattern:** first run shows "Downloading model · 12 MB" with a thin accent progress bar in
  the ControlBar and a Cancel button. Processing shows a subtle shimmer over the affected image area
  only. The rest of the editor stays usable.
- **Results arrive with a 200ms cross-fade**, then hold-to-compare works immediately.
- **Preview-then-accept** only for generative results (Prompt edit): Accept / Discard buttons in the
  ControlBar. Deterministic results (auto-enhance, bg removal) apply directly and are just undoable.
- **Failures** are inline messages in the ControlBar with a Retry, never modal dialogs.
- **Unavailable** (no WebGPU/WASM memory, no backend configured): hide the action, don't show it
  disabled with no explanation.
