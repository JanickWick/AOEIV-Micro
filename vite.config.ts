/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', 'assets-preview': 'assets-preview.html', 'figure-preview': 'figure-preview.html', 'model-preview': 'model-preview.html', 'effects-preview': 'effects-preview.html' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
