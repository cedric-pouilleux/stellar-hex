/**
 * Vite library build for @hexasphere/body.
 *
 * Produces three ES module entry points:
 *   - dist/sim.js    — pure logic (no WebGL, no Vue, no Three.js runtime)
 *   - dist/core.js   — Three.js render layer (extends sim)
 *   - dist/index.js  — Vue/TresJS surface (extends core)
 *
 * Peer dependencies (three, simplex-noise, vue, @tresjs/core) are kept
 * external so consumers control their versions. Shared code between the
 * three entries is factored into `dist/chunks/` by Rollup.
 *
 * Declarations (.d.ts) are emitted by `vue-tsc` via tsconfig.build.json
 * — see the `build` script in package.json.
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue({ ...templateCompilerOptions })],
  build: {
    outDir:      'dist',
    emptyOutDir: true,
    target:      'es2022',
    minify:      false,
    sourcemap:   true,
    lib: {
      entry: {
        sim:   `${here}sim.ts`,
        core:  `${here}core.ts`,
        index: `${here}index.ts`,
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) =>
        id === 'three'         || id.startsWith('three/')   ||
        id === 'simplex-noise'                               ||
        id === 'vue'           || id.startsWith('vue/')     ||
        id.startsWith('@vue/') || id.startsWith('@tresjs/'),
      output: {
        preserveModules: false,
        entryFileNames:  '[name].js',
        chunkFileNames:  'chunks/[name]-[hash].js',
      },
    },
  },
})
