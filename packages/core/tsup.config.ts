import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries, one shared copy of the code (so `ImageLoadError` etc. are the same class in both).
  entry: ['src/index.ts', 'src/internal.ts'],
  splitting: true,
  format: ['esm', 'cjs'],
  // tsup's dts step sets `baseUrl`, which TS 6 flags as deprecated.
  // `@internal` members (e.g. test-only options) are left out of the published types.
  dts: { compilerOptions: { ignoreDeprecations: '6.0', stripInternal: true } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
