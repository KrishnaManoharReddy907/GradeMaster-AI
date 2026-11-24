// Vitest 3 runs on its own bundled Vite 7, so it gets a minimal config of its own
// (automatic JSX via esbuild) instead of the Vite 8 app plugins.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
