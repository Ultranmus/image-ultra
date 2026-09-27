# image-ultra — Performance

Measured with `pnpm bench` (Phase 7.7a; DECISIONS #100). It builds everything, starts the
playground and runs `/bench` in Chrome twice: with WebGL2 (the real GPU) and with WebGL turned off
(the Canvas2D fallback). The same page runs in any browser: open `/bench` and press **Run**
(e.g. on a phone over Wi-Fi — try 12 / 24MP there).

**How it measures:** generated test photos (gradients, shapes, fine noise; JPEG 90%); window
1400×900 at 2× pixels (a Retina Mac). "Drag" changes one value every frame for 90 frames through
the store (as a slider drag does) and records the time between frames — the browser caps this at
60 fps, so 60 fps means "fast enough", not the real headroom. Export = `exportImage()` at full
size. JS heap = `performance.memory` (images and GPU textures are not in the JS heap).

**Targets (PLAN 7.7):** first paint < 1 s · drag ≥ 50 fps (WebGL2) / ≥ 20 fps (Canvas2D) ·
24MP JPEG export < 3 s — on the owner's Mac.

## 2026-09-27 · before 7.7b–d · MacBook (Apple M4), Chrome 153 headless

### WebGL2

|                             | 12MP (4240×2832)            | 24MP (6000×4000)            | 48MP (8000×6000)            |
| --------------------------- | --------------------------- | --------------------------- | --------------------------- |
| Load (decode)               | 45 ms                       | 82 ms                       | 160 ms                      |
| First paint                 | 75 ms                       | 119 ms                      | 204 ms                      |
| Drag: Exposure              | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.7 ms) |
| Drag: Sharpen               | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.7 ms) |
| Drag: Curves (histogram on) | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.7 ms) |
| Drag: Straighten            | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.8 ms) |
| Drag: Crop move             | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.7 ms) |
| Drag: Zoom 25% ↔ 200%       | 60 fps (16.7 / p95 16.8 ms) | 60 fps (16.7 / p95 16.7 ms) | 60 fps (16.7 / p95 16.7 ms) |
| Export JPEG                 | 160 ms (4.6 MB)             | 277 ms (9.2 MB)             | 511 ms (15.2 MB)            |
| Export WEBP                 | 949 ms (4.7 MB)             | 4090 ms (9.2 MB)            | 9459 ms (12.4 MB)           |
| Export PNG                  | 269 ms (19.9 MB)            | 524 ms (36.2 MB)            | 1118 ms (77.1 MB)           |
| JS heap after load / all    | 5.6 / 6 MB                  | 6.5 / 6.2 MB                | 6.7 / 6.4 MB                |
| Photo texture (GPU)         | 45.8 MB                     | 91.6 MB                     | 183.1 MB                    |

### Canvas2D fallback (WebGL off)

|                             | 12MP (4240×2832)             | 24MP (6000×4000)             | 48MP (8000×6000)             |
| --------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| Load (decode)               | 49 ms                        | 90 ms                        | 195 ms                       |
| First paint                 | 83 ms                        | 128 ms                       | 228 ms                       |
| Drag: Exposure              | 3 fps (316.7 / p95 333.4 ms) | 3 fps (316.6 / p95 400 ms)   | 4 fps (283.2 / p95 283.4 ms) |
| Drag: Sharpen               | 3 fps (300 / p95 300.1 ms)   | 3 fps (300 / p95 316.7 ms)   | 4 fps (266.7 / p95 283.4 ms) |
| Drag: Curves (histogram on) | 9 fps (116.7 / p95 133.4 ms) | 8 fps (133.3 / p95 133.4 ms) | 9 fps (116.7 / p95 133.4 ms) |
| Drag: Straighten            | 30 fps (33.2 / p95 33.4 ms)  | 60 fps (16.7 / p95 33.4 ms)  | 60 fps (16.7 / p95 33.4 ms)  |
| Drag: Crop move             | 30 fps (33.3 / p95 33.4 ms)  | 30 fps (33.3 / p95 33.4 ms)  | 30 fps (33.3 / p95 33.4 ms)  |
| Drag: Zoom 25% ↔ 200%       | 30 fps (33.3 / p95 33.4 ms)  | 30 fps (33.3 / p95 33.4 ms)  | 30 fps (33.3 / p95 33.4 ms)  |
| Export JPEG                 | 464 ms (4.6 MB)              | 754 ms (9.2 MB)              | 1202 ms (15.2 MB)            |
| Export WEBP                 | 1263 ms (4.6 MB)             | 4637 ms (9.1 MB)             | 10294 ms (12.5 MB)           |
| Export PNG                  | 574 ms (19.9 MB)             | 979 ms (36.2 MB)             | 1815 ms (71.4 MB)            |
| JS heap after load / all    | 5.9 / 6.1 MB                 | 6.5 / 6.3 MB                 | 6.6 / 6.1 MB                 |
| Photo texture (GPU)         | 45.8 MB                      | 91.6 MB                      | 183.1 MB                     |

### What it tells us

- **WebGL2 meets every target** on the M4 at 12–48MP: photo on screen in 0.1–0.2 s, every drag
  at the 60 fps cap, JPEG export 0.3 s at 24MP. The preview's cost follows the **screen size**, not
  the photo size, so a screen-sized preview copy (the planned 7.7b) would not speed up a desktop
  GPU — it may still help phones (to be measured on the owner's phone) and zoomed-out quality.
- **Canvas2D colour drags are far too slow: 3 fps** (Exposure, Sharpen), 8–9 fps (Curves), at any
  photo size. The colour maths run on the CPU for every screen pixel (2.5M at 2×). Geometry-only
  drags (straighten, crop, zoom) are 30–60 fps. Fix = draw fewer pixels **while dragging**
  (e.g. 1× or ½ resolution, sharp again on release).
- **WebP export is slow: 4 s at 24MP, 9.5 s at 48MP** (JPEG 0.3 s / 0.5 s) — nearly all of it is
  the browser's WebP encoder, the same with both renderers. Not ours to speed up in this phase;
  a Web Worker would keep the page responsive (BACKLOG).
- **Memory:** JS heap stays ~6 MB — images live outside it (the 24MP texture alone is 92 MB of GPU
  memory). 7.7c needs a different measure (count and free bitmaps / textures).

## 2026-09-27 · after 7.7b (Canvas2D draws fewer pixels while dragging) · same Mac

Canvas2D fallback only (WebGL2 unchanged). Colour drags: Exposure 3 → 20–30 fps, Sharpen 3 →
30–60 fps, Curves 8–9 → 60 fps. The drag frame is softer (≤ 0.35 MP) and sharp on release.

|                             | 12MP                        | 24MP                        | 48MP                        |
| --------------------------- | --------------------------- | --------------------------- | --------------------------- |
| Drag: Exposure              | 20 fps (50 / p95 50.1 ms)   | 20 fps (50 / p95 66.7 ms)   | 30 fps (33.4 / p95 50.1 ms) |
| Drag: Sharpen               | 30 fps (33.2 / p95 33.4 ms) | 30 fps (33.3 / p95 33.4 ms) | 60 fps (16.7 / p95 33.4 ms) |
| Drag: Curves (histogram on) | 60 fps (16.7 / p95 33.4 ms) | 60 fps (16.7 / p95 33.4 ms) | 60 fps (16.7 / p95 33.3 ms) |
| Drag: Straighten            | 60 fps                      | 60 fps                      | 60 fps                      |
| Drag: Crop move             | 60 fps                      | 60 fps                      | 60 fps                      |
| Drag: Zoom 25% ↔ 200%       | 30 fps                      | 30 fps                      | 30 fps                      |

Exposure stays the slowest: the CPU colour maths takes several `Math.pow` per pixel (linear light).
A faster CPU path (lookup tables) would risk the GPU / CPU pixel match — not done; 20 fps meets the
target. Zoom isn't a "change", so it keeps full resolution (30 fps).

## Memory (7.7c) · `e2e/memory.spec.ts`

The JS heap can't see decoded images or GPU textures, so the test counts them itself (wrapping
`createImageBitmap` / `close` and the WebGL texture calls; garbage-collected images count as
freed). 10 photos of 3MP, each with a sticker, the Filter thumbnails, compare on/off and an export:

|             | after 1 photo                 | after 10 photos                    | editor closed   |
| ----------- | ----------------------------- | ---------------------------------- | --------------- |
| Before 7.7c | 2 images · 4 textures (24 MB) | **11 images** · 4 textures (25 MB) | —               |
| After 7.7c  | 2 images · 2 textures (12 MB) | 2 images · 2 textures (12.5 MB)    | 0 images · 0 MB |

Also freed now (not in the counts): the full-size drawing buffers of unused layers (compare,
redactions, Fill) — ~20 MB each on a Retina stage.
