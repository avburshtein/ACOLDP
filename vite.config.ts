import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src/ui',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
});
