/**
 * Vitest config for the monorepo root.
 *
 * Mirrors the `@lib` / `@sim` aliases declared in
 * `playground/vite.config.ts` so specs that live alongside playground
 * source (e.g. `playground/src/lib/*.spec.ts`) resolve their runtime
 * imports correctly when vitest is invoked from the repo root.
 *
 * The library build uses `vite.build.config.ts` — we deliberately keep
 * vitest in a separate file to avoid pulling the build pipeline (entry
 * points, rollup externals) into the test runtime.
 */
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Vitest reads the top-level `test` block from a Vite config when no
// dedicated `vitest/config` package is available (vitest is pulled in
// transiently via `npx`, not a local dependency).
export default defineConfig({
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('./core.ts', import.meta.url)),
      '@sim': fileURLToPath(new URL('./sim.ts',  import.meta.url)),
    },
  },
  // @ts-expect-error Vitest augments Vite's config but we depend on vitest only at runtime.
  test: {
    environment: 'node',
    include:     ['**/*.{spec,test}.ts'],
    // `docs/api/**` is TypeDoc-generated; `docs/.vitepress/{dist,cache}`
    // are build artefacts. The narrowed exclude lets specs colocated with
    // theme composables (e.g. `docs/.vitepress/theme/composables/*.spec.ts`)
    // run alongside the lib's own suite.
    exclude:     [
      '**/node_modules/**',
      '**/dist/**',
      'docs/api/**',
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
    ],
  },
})
