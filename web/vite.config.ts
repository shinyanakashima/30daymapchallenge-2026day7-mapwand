import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// GitHub Pages 用に MAPWAND_BASE=/repo-name/ を指定してビルドできる
export default defineConfig({
  base: process.env.MAPWAND_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('../data', import.meta.url)),
    },
  },
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'node',
  },
});
