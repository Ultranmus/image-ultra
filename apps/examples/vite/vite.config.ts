import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In this monorepo the editor package has its own React for development; one copy only (yours).
  // Apps installing @image-ultra/react from npm don't need this.
  resolve: { dedupe: ['react', 'react-dom'] },
});
