# image-ultra — Decision Log

Format: date · decision · why · alternatives rejected.

1. **2026-09-24 · Rewrite in TS, don't fork Filerobot.** Filerobot is JS + styled-components + @scaleflex/ui + react-konva; runtime CSS-in-JS breaks with RSC and the UI kit makes styling inconsistent. Filerobot = feature checklist only.
2. **2026-09-24 · Pintura = UX inspiration only.** Commercial license; we recreate the feel with our own code, icons, assets.
3. **2026-09-24 · Name `image-ultra`, MIT.** Scoped packages `@image-ultra/core`, `@image-ultra/react`. Names verified free on npm that day.
4. **2026-09-24 · Framework-agnostic core.** Core has zero React so a Web Component / other frameworks can reuse it.
5. **2026-09-24 · Plain CSS + CSS variables in `@layer image-ultra`.** SSR-safe, zero runtime, overridable. Rejected: styled-components, emotion (runtime), Tailwind (forces setup on consumers).
6. **2026-09-24 · Radix primitives for behaviour only** (popover, tooltip, slider a11y), always unstyled and wrapped by our components. Rejected: full UI kits.
7. **2026-09-24 · Zustand vanilla store + Immer patches** for state/undo. Small, typed, works outside React.
8. **2026-09-24 · WebGL2 for pixel ops, Canvas2D for vector + fallback.** Real-time sliders on large images. Rejected: Konva (extra dependency, React wrapper, we only need a thin shape layer).
9. **2026-09-24 · Container queries for responsiveness**, because the editor can be embedded in any sized box.
10. **2026-09-24 · pnpm + Turborepo monorepo, tsup build (ESM + CJS + d.ts).**
11. **2026-09-24 · Build with TypeScript 6.0.3, not 7.** TS 7 (native Go compiler) has no JS API, and typescript-eslint (`<6.1`), tsup's dts step and Next's type check all need it. Revisit when the tooling supports TS 7. Consumers may use TS 7 — we ship plain `.d.ts`.
12. **2026-09-24 · tsup `dts.compilerOptions.ignoreDeprecations: '6.0'`** because tsup injects the deprecated `baseUrl`.
13. **2026-09-24 · Wheel = zoom around cursor** (mouse wheel and trackpad pinch), drag = pan when zoomed past fit, double-click toggles fit ↔ 100%. Space+drag pan comes in Phase 3, when plain drag gains tool meaning (crop).
14. **2026-09-24 · Pixels render crisp (no smoothing) at ≥ 300% zoom** so users can inspect detail.
15. **2026-09-24 · Stage paints outside React**: it subscribes to the store and redraws once per animation frame; React only renders chrome. Canvas2D in Phase 1, WebGL2 pipeline arrives in Phase 2.
16. **2026-09-24 · Keyboard shortcuts live on `.iu-root`** (only fire while focus is inside the editor, never global): `+`/`=` zoom in, `-` zoom out, `0` fit, `1` 100%.
17. **2026-09-24 · All 8 AI features are in plan** (owner). Phase 9 in `@image-ultra/plugin-ai`, auto-enhance in core (Phase 4). AI outputs stay non-destructive: parameters where possible, otherwise rasters in `EditState.assets` with the recorded inputs. Phase 2 (async plugin actions + assets registry) and Phase 5 (brush/mask tool) must leave hooks for this.
18. **2026-09-24 · AI appears inside the tool it belongs to**, plus one "Magic" tool for standalone actions. Default models must be MIT/Apache/BSD licensed.
19. **2026-09-24 · Brand primary = plum `#4d194d`** (owner). Exact value in the light theme; dark theme uses same-hue tints (`#9c479c` / `#ab55ab` / text `#d08bd0`) because `#4d194d` is only 1.4:1 on dark surfaces. New token `--iu-accent-text` for accent-coloured text/icons.
20. **2026-09-24 · History = immutable snapshots, not Immer patches** (refines #7). EditState is small JSON and Immer shares unchanged parts between snapshots, so snapshots cost little and make undo/redo exact and trivially correct. Default limit 250 steps (`historyLimit`).
21. **2026-09-24 · Store action is `update(label, recipe)`** (the state field is `edit`). Continuous input uses `beginChange` → `update`… → `endChange` (one undo step) or `cancelChange`.
22. **2026-09-24 · `onChange` fires once per committed edit** — not per frame of a slider drag and not on image load — so apps can safely save to a server from it.
23. **2026-09-24 · One render pipeline for preview and export.** Output px → source px is a single affine matrix (`getOutputToSource`); the WebGL2 shader and the Canvas2D fallback both use it plus the same colour math (`color.ts` ≡ `shaders.ts`). E2E test: renderers match within 2/255 at full size. Downscaled exports differ slightly (GPU mipmaps vs browser resampler) — accepted.
24. **2026-09-24 · Colour pipeline order:** exposure + white balance in linear light → brightness, contrast, gamma, saturation in sRGB → vignette. Finetune values are all −1…1 with 0 = neutral.
25. **2026-09-24 · Images larger than the GPU texture limit** are downscaled for WebGL (usually 16384px on desktop, 4096–8192 on mobile). Exports are capped at the renderer's max output size. Tiling = Phase 7.
26. **2026-09-24 · Preview renderers never destroy the canvas's GPU context on dispose** (React StrictMode remounts reuse the canvas); only renderers that own their canvas (export) do (`ownsCanvas`).
27. **2026-09-24 · Playground dev panel** (`apps/playground/app/DevPanel.tsx`) exercises the engine through the public ref API until real tool UIs exist. It is not part of the package and follows no UI_VISION rules. `window.__iu` is a test hook for Playwright only.
28. **2026-09-24 · Geometry uses projective 3×3 matrices (`Mat3`)** so perspective fits the same single-matrix pipeline. The shader divides by z; the Canvas2D fallback draws a 20×20 triangle mesh when the transform isn't affine (small, accepted differences; e2e mean diff < 3/255).
29. **2026-09-24 · Perspective = an in-plane rotation vector (Rodrigues)**, not Ry·Rx, so 90° turns and flips map it exactly: CW (x, y) → (y, −x), flipX negates x, flipY negates y. Max tilt 30°, focal length = longest oriented side.
30. **2026-09-24 · Crop lives in "oriented space"** (after rotation/flip/straighten/perspective, origin at the rotated-but-unstraightened frame). Rotating/flipping transforms the crop rect so the result turns exactly as seen. A crop is valid when all 4 corners map inside the source image (binary-search fitting for move/resize/auto-fit).
31. **2026-09-24 · Angle changes shrink the crop around its centre (same aspect)** using the crop from the start of the drag as reference, so returning the dial to 0 restores the original crop. Resize follows the crop's aspect when a crop changes (`syncResizeToCrop`).
32. **2026-09-24 · Crop view is owned by the Adjust overlay** (`store.cropView`): the stage renders the image's full bounding box framed around the crop while the overlay is mounted, and returns to the result view when it unmounts. Wheel/pan/zoom are off in crop view.
33. **2026-09-24 · Tools are plugins**: `defineTool({ id, label?, icon, Controls, StageOverlay? })`. Built-ins are registered the same way; `tools` accepts ids and definitions. `activeTool` became `string`. Space+drag pan (old #13) dropped — in crop view dragging already moves the image.
34. **2026-09-24 · Social size presets live in `SIZE_PRESETS`** (English labels, brand names). A `sizePresets` prop for custom/translated lists can come later if needed.
