# image-ultra

A free (MIT), fully typed image editor for React and Next.js.

Crop, rotate, straighten and fix perspective; adjust light and colour with curves and levels;
apply filters; draw shapes, arrows and text; redact; add stickers, frames, fills and watermarks;
resize and export. Every edit is non-destructive JSON you can save and reopen.

**Docs and live demo: [imageultra.ashvattech.com](https://imageultra.ashvattech.com)**

| Package                                |                                                             |
| -------------------------------------- | ----------------------------------------------------------- |
| [`@image-ultra/react`](packages/react) | The editor component. Start here.                           |
| [`@image-ultra/core`](packages/core)   | The engine: edit state, rendering, export, store. No React. |

```sh
npm install @image-ultra/react
```

```tsx
import { ImageEditor } from '@image-ultra/react';
import '@image-ultra/react/styles.css';

<div style={{ height: 600 }}>
  <ImageEditor src="/photo.jpg" onSave={(result) => console.log(result.blob, result.state)} />
</div>;
```

See the [React package README](packages/react/README.md) for saving and restoring edits,
choosing tools, theming and languages.

Working examples: [Next.js App Router, Vite + React 18, React Router](apps/examples).

## Working on this repo

pnpm workspace with Turborepo. Node 20.19+ and pnpm (via corepack).

```sh
pnpm install
pnpm playground        # the dev playground on http://localhost:3100
pnpm --filter docs dev # the docs site on http://localhost:3300
pnpm build             # build the packages and the playground
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e               # Playwright: playground + example apps (uses the last production build)
pnpm check:package     # what npm users get: exports, types, size budget, SSR import
pnpm bench             # performance benchmark (slow; see docs/internal/PERF.md)
```

Project notes, decisions and plans live in `docs/internal/`.

## License

[MIT](LICENSE)
