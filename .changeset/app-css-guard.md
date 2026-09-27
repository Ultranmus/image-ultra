---
'@image-ultra/react': patch
---

Your app's global CSS no longer reaches inside the editor. A reset like create-next-app's default
`* { padding: 0; margin: 0 }` or Tailwind v3's preflight used to strip the editor's padding and
spacing (squashed buttons, a clipped Done). Restyle with the `--iu-*` variables as before, or with a
two-class selector (`.my-editor .iu-chip`) or a cascade layer declared after `image-ultra`.
