/**
 * Single graphics-uniform bag shared by every body the playground builds.
 *
 * The lib used to ship a module-level singleton (`hexGraphicsUniforms`) that
 * conflated lib state with caller state. The fix moved the bag into a
 * factory the lib calls once per body — but the playground UI is wired so
 * a single set of sliders drives every body the same way (e.g. cloud
 * opacity panel mutates whatever planet is on screen). To preserve that
 * UX we keep one shared bag here and feed it back into the lib via
 * `useBody(config, tileSize, { graphicsUniforms: playgroundGraphicsUniforms })`.
 *
 * Game integrations that want per-body uniforms simply skip this module and
 * let the lib auto-create a fresh bag per call.
 */

import { createGraphicsUniforms } from '@lib'

export const playgroundGraphicsUniforms = createGraphicsUniforms()
