# image-ultra — instructions for Claude

A free (MIT), fully typed, premium image editor for React / Next.js.
Feature reference: Filerobot Image Editor. UX reference: Pintura. We copy **neither's code or assets**.

## Read these before any work (source of truth)

0. `docs/internal/HANDOFF.md` — **where the last session stopped and what's next. Start here; update it before ending a session.**

1. `docs/internal/PLAN.md` — phases, task checklist, what is next
2. `docs/internal/UI_VISION.md` — the experience, layout, interaction and visual rules. **Never invent UI outside this.**
3. `docs/internal/THEMING.md` — every design token. Components use tokens only.
4. `docs/internal/DECISIONS.md` — why things are the way they are. Don't re-litigate without a new reason.
5. `docs/internal/PROGRESS.md` — log of what was done per phase. **Append an entry after every work session.**
6. `docs/internal/BACKLOG.md` — known gaps to fix later. **Add new ones when found; tick them when fixed.**
7. `docs/internal/AI_ROADMAP.md` — AI feature spec (Phase 9 + auto-enhance in Phase 4).

## Hard rules

- TypeScript strict everywhere. No `.js` source files, no `any` in public API. The owner reads TS, not JS.
- `@image-ultra/core` must never import React or touch `window` at module top level (SSR safe).
- Core's public, semver-covered API is `packages/core/src/index.ts` only. Everything else goes in
  `src/internal.ts` (`@image-ultra/core/internal`), which React imports from. Run
  `pnpm check:package` after `pnpm build` before a release (DECISIONS #107).
- No CSS-in-JS runtime, no third-party UI kit styling. Plain CSS + `--iu-*` variables in `@layer image-ultra`.
- CSS class prefix: `iu-`. CSS var prefix: `--iu-`. No raw hex/px values in component CSS — tokens only.
- Every edit is non-destructive: it's a change to `EditState` (serializable JSON), never to source pixels.
- Package manager: pnpm. Stop after each phase and show the owner the result in the playground.
- When a UI/theming decision changes, update the internal doc in the same change.
