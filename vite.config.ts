import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths keep the built bundle portable (file://, sub-paths,
  // static hosts) which matters for an offline-first disaster tool.
  base: './',
  server: {
    port: 5273,
    host: true,
  },
  preview: {
    port: 5273,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
