import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
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
})
