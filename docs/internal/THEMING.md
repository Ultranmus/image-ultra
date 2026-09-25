# image-ultra — Theming

## How theming works

- All styles live in `@layer image-ultra` so any consumer CSS (unlayered) wins without `!important`.
- Tokens are CSS custom properties prefixed `--iu-`, declared on `.iu-root`.
- Theme selected with `data-iu-theme="dark" | "light"` on `.iu-root`. `theme="auto"` omits the attribute and
  uses `@media (prefers-color-scheme)`.
- React prop `themeOverrides` (typed `ThemeOverrides`) maps camelCase keys → CSS vars as inline style
  on `.iu-root`, e.g. `{ accent: '#ff5a1f' }` → `--iu-accent: #ff5a1f`.
- Components reference **semantic** tokens only (e.g. `--iu-surface-2`), never primitives or hex.

## Naming

`--iu-<group>-<name>[-<state>]` · groups: `color` (implicit, dropped for brevity), `space`, `radius`,
`font`, `text`, `shadow`, `duration`, `ease`, `z`, `size`.

## Brand colour

Brand primary is **plum `#4d194d`** (owner, 2026-09-24). Used exactly in the light theme. On dark
surfaces it only reaches 1.4:1 contrast, so the dark theme uses lighter tints of the same hue.
Checked contrast (WCAG): dark — white on `#9c479c` 5.5, on hover `#ab55ab` 4.6, accent vs surface-1 3.4,
`#d08bd0` text on surface-1 7.3; light — white on `#4d194d` 13.5, `#4d194d` on white 13.5.
Rule: text/icons in accent colour use `--iu-accent-text`, never `--iu-accent` / `--iu-accent-hover`.

## Colour tokens

| Token                         | Dark                                                 | Light                         | Used for                           |
| ----------------------------- | ---------------------------------------------------- | ----------------------------- | ---------------------------------- |
| `--iu-bg`                     | `#0b0b0d`                                            | `#f4f4f6`                     | editor root background             |
| `--iu-stage`                  | `#060607`                                            | `#e9e9ed`                     | behind the image                   |
| `--iu-surface-1`              | `#131316`                                            | `#ffffff`                     | TopBar, ToolRail, ControlBar       |
| `--iu-surface-2`              | `#1c1c21`                                            | `#f1f1f4`                     | hover, inputs, strip items         |
| `--iu-surface-3`              | `#26262d`                                            | `#e4e4ea`                     | pressed, popovers                  |
| `--iu-border`                 | `rgba(255,255,255,0.08)`                             | `rgba(0,0,0,0.08)`            | hairlines                          |
| `--iu-border-strong`          | `rgba(255,255,255,0.16)`                             | `rgba(0,0,0,0.16)`            | control outlines                   |
| `--iu-text`                   | `#f4f4f5`                                            | `#18181b`                     | primary text/icons                 |
| `--iu-text-muted`             | `#a1a1aa`                                            | `#5b5b66`                     | labels, secondary                  |
| `--iu-text-subtle`            | `#6b6b75`                                            | `#8a8a94`                     | ticks, disabled                    |
| `--iu-accent`                 | `#9c479c` (brand plum, lightened)                    | `#4d194d` (brand)             | primary button, focus, slider fill |
| `--iu-accent-hover`           | `#ab55ab`                                            | `#3a123a`                     | primary hover                      |
| `--iu-accent-contrast`        | `#ffffff`                                            | `#ffffff`                     | text on accent                     |
| `--iu-accent-soft`            | `rgba(156,71,156,0.22)`                              | `rgba(77,25,77,0.10)`         | selected backgrounds               |
| `--iu-accent-text`            | `#d08bd0`                                            | `#4d194d`                     | accent text/icons on surfaces      |
| `--iu-danger`                 | `#ff5c6c`                                            | `#e5293d`                     | destructive                        |
| `--iu-warning`                | `#f5b54a`                                            | `#9a5b00`                     | soft warnings (upscaling)          |
| `--iu-crop-shade`             | `rgba(0,0,0,0.62)`                                   | same                          | outside the crop box               |
| `--iu-crop-frame`             | `rgba(255,255,255,0.95)`                             | same                          | crop frame + handles               |
| `--iu-crop-grid`              | `rgba(255,255,255,0.45)`                             | same                          | thirds grid, circle bounds         |
| `--iu-channel-red/green/blue` | `#ff6b6b` `#4cd97b` `#5aa9ff`                        | `#d62f2f` `#1f9d4c` `#1f6fd6` | curve channels                     |
| `--iu-handle-fill`            | `#ffffff`                                            | same                          | annotation handles (on photo)      |
| `--iu-guide`                  | `#ff2d95`                                            | same                          | snap guides                        |
| `--iu-overlay`                | `rgba(0,0,0,0.55)`                                   | `rgba(0,0,0,0.45)`            | crop mask outside box              |
| `--iu-checker-a`              | `#26262b`                                            | `#ffffff`                     | transparency checkerboard          |
| `--iu-checker-b`              | `#1d1d21`                                            | `#e6e6ea`                     | transparency checkerboard          |
| `--iu-focus-ring`             | `0 0 0 2px var(--iu-bg), 0 0 0 4px var(--iu-accent)` | same                          | `:focus-visible`                   |

## Non-colour tokens (shared)

| Token                                      | Value                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `--iu-font-family`                         | `inherit` → fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--iu-font-fallback`                       | system stack used after `--iu-font-family`                                                     |
| `--iu-font-mono`                           | `ui-monospace, SFMono-Regular, Menlo, monospace`                                               |
| `--iu-text-xs/sm/md/lg/xl`                 | `11px / 12px / 13px / 14px / 16px`                                                             |
| `--iu-weight-regular/medium/semibold`      | `400 / 500 / 600`                                                                              |
| `--iu-space-1..8`                          | `4 8 12 16 20 24 32 40` px                                                                     |
| `--iu-radius-sm/md/lg/full`                | `6px / 8px / 12px / 999px`                                                                     |
| `--iu-shadow-popover`                      | dark: `0 12px 32px rgba(0,0,0,.5)` · light: `0 12px 32px rgba(0,0,0,.14)`                      |
| `--iu-duration-fast/base/slow`             | `120ms / 200ms / 320ms`                                                                        |
| `--iu-ease`                                | `cubic-bezier(0.2, 0, 0, 1)`                                                                   |
| `--iu-size-topbar`                         | `48px`                                                                                         |
| `--iu-size-rail` / `--iu-size-rail-mobile` | `72px` (desktop width) / `64px` (mobile height)                                                |
| `--iu-size-controlbar`                     | `148px`                                                                                        |
| `--iu-size-touch`                          | `40px`                                                                                         |
| `--iu-z-overlay/popover/toast`             | `10 / 20 / 30` (tooltips use the toast layer, above popovers and menus)                        |

## `ThemeOverrides` (public, typed)

```ts
interface ThemeOverrides {
  accent?: string;
  accentHover?: string;
  accentContrast?: string;
  accentText?: string; // defaults to accent when accent is overridden
  bg?: string;
  stage?: string;
  surface1?: string;
  surface2?: string;
  surface3?: string;
  text?: string;
  textMuted?: string;
  border?: string;
  fontFamily?: string;
  radius?: string; // radius sets --iu-radius-md, others derive
}
```

Crop tokens are the same in both themes because they sit on the photo, not on UI chrome.

Keep this table and the CSS file (`packages/react/src/styles/tokens.css`) in sync.
