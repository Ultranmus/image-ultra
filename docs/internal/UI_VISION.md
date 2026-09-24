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
│ TopBar:  [✕ Cancel] [↺ Reset]     [↶][↷]  [− 100% +]  [Done ▸] │  48px
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

### Mobile / narrow (container width < 768px)

```
TopBar (compact: ✕  ↶ ↷  Done)
STAGE
ControlBar (contextual)
ToolRail (horizontal, scrollable, bottom — thumb zone)
```

- Breakpoints use **container queries** on `.iu-root`, not viewport — the editor may live in a small modal.
- Minimum usable size: 320 × 480.

## 4. Region names (use these names in code and conversation)

| Region     | Component       | Purpose                                                                                             |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------- |
| TopBar     | `<TopBar/>`     | Cancel, Reset, Undo/Redo, Zoom, Done/Save                                                           |
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
  (40px padding); outside the crop is shaded (`--iu-crop-shade`); thin white frame, L-shaped corner
  handles + edge bars, 32px hit areas; thirds grid only while interacting; drag anywhere = move the
  image under the crop; arrow keys move the crop (focus the crop area). TopBar zoom is disabled here.
- **Resize** ControlBar: [Width px] [lock] [Height px] + "Original size: W × H" (turns into a
  `--iu-warning` note when upscaling); PresetStrip: Original size, 50%, social presets.
- **Finetune** ControlBar: SegmentedControl [Adjust | Curves | Levels] — [✨ Auto] [Save look]
  [reset]. Adjust = RulerSlider (−100…+100, "+25"/"−25") above a chip strip of the 16 adjustments
  (a dot marks changed ones). Curves = channel SegmentedControl + small reset on the left, 80px
  graph (tinted histogram, thirds grid, dashed identity, points = sliders; click adds, double-click
  or Delete removes). Levels = 32px histogram with clipped areas dimmed, three triangle handles,
  values row ("Black point 0 · Mid-tones 1.00 · White point 255").
- **Save look** is inline (name field + ✓/✕ replace the header buttons) — never a modal. After
  saving, an inline notice "Saved “Name” · View in Filters" (role=status, 6s) links to the Filter tool.
- **Inline notice pattern** (`.iu-notice` + `.iu-link`): short confirmations live in the ControlBar
  header's middle slot, never as toasts or dialogs.
- **Filter** ControlBar: Intensity RulerSlider (disabled when "Original"), then a thumbnail
  PresetStrip (52px live previews of each look on the current crop, label below, selected = accent
  ring): Original, then the user's looks (bookmark badge; hover ✕ / Delete key removes), a divider,
  then the 28 presets. Own looks come first so a just-saved look is visible without scrolling.
- Dense panels use small 24px IconButtons (`size="sm"`) for secondary actions (per-editor reset).
- Placeholder tools show one muted line ("coming soon") until their phase.

## 6. Interaction details

- Tool switch: ControlBar content cross-fades (160ms) and slides 8px; stage does not jump.
- Crop: image moves under a fixed crop box when dragging inside; handles resize box; on release, box re-centres and image animates to fit (320ms). Rule-of-thirds grid appears only while interacting.
- Ratio change animates the box, never snaps instantly.
- Zoom: wheel/trackpad pinch around cursor; touch pinch; double-click toggles fit ↔ 100%. Space+drag pans on desktop.
- Sliders commit one history entry per drag (coalesced), not per pixel.
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
- **Motion:** 120ms (hover/press), 200ms (panel/tool switch), 320ms (stage/crop re-fit). Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion` → durations ≈ 0, no slides.
- **Loading:** skeleton shimmer on stage only if load > 300ms; no spinners under 300ms.

## 8. Don'ts (things that made Filerobot feel off)

- ❌ Mixed icon sets, random paddings, visually different sliders per tool.
- ❌ Tabs within tabs within dropdowns. Max depth: Tool → sub-tool (segmented) → control.
- ❌ Text-only buttons for tools, or icon-only without label in ToolRail.
- ❌ Browser-default `<select>`, `<input type=range>`, `alert()`, `confirm()`.
- ❌ Hardcoded colours/sizes in components. Tokens only (`THEMING.md`).
- ❌ Layout shift when switching tools. ControlBar has a fixed height per breakpoint.

## 9. Accessibility baseline

- WCAG AA contrast in both themes (checked for text + focus ring).
- All controls have accessible names; sliders expose `aria-valuenow/min/max/valuetext`.
- Visible focus ring (`--iu-focus-ring`) on keyboard focus only (`:focus-visible`).
- Stage announces tool changes and key results via a polite live region.

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
