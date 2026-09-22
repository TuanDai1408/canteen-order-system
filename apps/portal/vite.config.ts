import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@canteen/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3001,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
