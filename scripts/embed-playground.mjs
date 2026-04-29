/**
 * Copies the built playground into the VitePress output so the whole site
 * (docs + playground) ships as a single GitHub Pages artifact.
 *
 * Inputs:
 *   - playground/dist/         — `vite build` output of the playground
 *   - docs/.vitepress/dist/    — VitePress build output (final site root)
 *
 * Output:
 *   - docs/.vitepress/dist/playground/   — playground served at
 *                                          `<base>/playground/`
 *
 * Run from the repo root via `npm run site:build`. Standalone:
 *   node scripts/embed-playground.mjs
 */
import { cp, rm, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const playgroundDist = resolve(root, 'playground/dist')
const target         = resolve(root, 'docs/.vitepress/dist/playground')

try {
  await access(playgroundDist)
} catch {
  console.error(`embed-playground: missing ${playgroundDist}. Run \`npm run playground:build\` first.`)
  process.exit(1)
}

await rm(target, { recursive: true, force: true })
await cp(playgroundDist, target, { recursive: true })

console.log(`embed-playground: copied playground/dist -> docs/.vitepress/dist/playground`)
