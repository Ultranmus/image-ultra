# image-ultra examples

Three small apps showing `@image-ultra/react` in common setups. Each one opens a sample photo, saves
the edited image as a download, keeps the edits as JSON in `localStorage`, and reopens them with
**Reopen last edits** — the same `PhotoEditor` component in each, so you can compare the setups.

| Folder                         | Setup                                                                   | Port |
| ------------------------------ | ----------------------------------------------------------------------- | ---- |
| [`next-app`](next-app)         | Next.js App Router, React 19, server-rendered                           | 3201 |
| [`vite`](vite)                 | Vite, **React 18**, client only                                         | 3202 |
| [`react-router`](react-router) | React Router framework mode (formerly Remix), React 19, server-rendered | 3203 |

```sh
pnpm --filter example-next-app dev        # or example-vite / example-react-router
pnpm --filter example-next-app e2e        # the shared smoke test in e2e/smoke.spec.ts
```

What to copy into your own app:

1. `import '@image-ultra/react/styles.css'` once (root layout / entry file).
2. A container with a height around `<ImageEditor>` — the editor fills it.
3. `onSave` for the result (`result.blob`, and `result.state` to save the edits as JSON);
   `initialState` to reopen them.

The Vite example has two lines you **don't** need in your app (`resolve.dedupe` in
`vite.config.ts` and `paths` in `tsconfig.json`): inside this monorepo the editor package has its own
React 19 for development, and those lines make the example use its React 18 instead.
