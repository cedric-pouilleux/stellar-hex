import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Mounted under the VitePress site at `<docs base>/playground/`. The
// `PLAYGROUND_BASE` env var lets a standalone deploy override the default;
// dev always resolves to `/` (Vite ignores `base` in serve mode anyway).
const productionBase = process.env.PLAYGROUND_BASE ?? '/stellex-js/playground/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? productionBase : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('../core.ts', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim.ts', import.meta.url)),
    },
    dedupe: ['three', 'vue', 'simplex-noise'],
  },
  server: {
    port: 5174,
    open: true,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
}))
