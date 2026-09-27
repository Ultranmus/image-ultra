# @image-ultra/react

## 0.1.1

### Patch Changes

- b92f8d5: Your app's global CSS no longer reaches inside the editor. A reset like create-next-app's default
  `* { padding: 0; margin: 0 }` or Tailwind v3's preflight used to strip the editor's padding and
  spacing (squashed buttons, a clipped Done). Restyle with the `--iu-*` variables as before, or with a
  two-class selector (`.my-editor .iu-chip`) or a cascade layer declared after `image-ultra`.
- @image-ultra/core@0.1.1

## 0.1.0

### Minor Changes

- 9620e1f: First public release. A typed image editor for React and Next.js: crop, rotate, straighten and
  perspective; light, colour, curves and levels; filters and saved looks; arrows, shapes, text and
  images with layers; redaction; stickers and emoji; frames, fills and watermarks; resize and export.
  Every edit is non-destructive, serializable JSON. WebGL2 rendering with a Canvas2D fallback, tested
  with 48MP photos on desktop and iPhone. Themeable with CSS variables, accessible (WCAG 2.2 AA,
  keyboard, screen readers), every string translatable, right-to-left layouts, SSR-safe.

### Patch Changes

- Updated dependencies [9620e1f]
  - @image-ultra/core@0.1.0
