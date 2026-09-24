import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    // tsup's dts step sets `baseUrl`, which TS 6 flags as deprecated.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    sourcemap: true,
    clean: true,
    target: 'es2022',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    // Every export is interactive, so mark the whole bundle as a Client Component for Next.js.
    banner: { js: "'use client';" },
  },
  {
    entry: { styles: 'src/styles/index.css' },
    // Keep modern CSS (layers, container queries, nesting) as authored.
    target: 'esnext',
  },
]);
