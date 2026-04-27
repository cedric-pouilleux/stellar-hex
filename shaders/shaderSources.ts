/**
 * Resolved GLSL sources for all planet types.
 *
 * The GLSL files use `#include` directives that are not understood by Vite's
 * raw-imports loader, so we resolve them manually here.
 */

import noiseGlsl     from './glsl/lib/noise.glsl?raw'
import lightingGlsl  from './glsl/lib/lighting.glsl?raw'
import cracksGlsl    from './glsl/lib/cracks.glsl?raw'
import lavaGlsl      from './glsl/lib/lava.glsl?raw'
import liquidMaskGlsl from './glsl/lib/liquidMask.glsl?raw'

import bodyVert from './glsl/body.vert?raw'
import rockyFrag  from './glsl/bodies/rocky.frag?raw'
import gasFrag    from './glsl/bodies/gas.frag?raw'
import metalFrag  from './glsl/bodies/metallic.frag?raw'
import starFrag   from './glsl/bodies/star.frag?raw'

import type { LibBodyType } from './params'

function resolve(src: string): string {
  return src
    .replace(/#include\s+\.\.\/lib\/noise\.glsl/g,      noiseGlsl)
    .replace(/#include\s+\.\.\/lib\/lighting\.glsl/g,   lightingGlsl)
    .replace(/#include\s+\.\.\/lib\/cracks\.glsl/g,     cracksGlsl)
    .replace(/#include\s+\.\.\/lib\/lava\.glsl/g,       lavaGlsl)
    .replace(/#include\s+\.\.\/lib\/liquidMask\.glsl/g, liquidMaskGlsl)
    .replace(/#include\s+\.\/lib\/noise\.glsl/g,        noiseGlsl)
    .replace(/#include\s+\.\/lib\/lighting\.glsl/g,     lightingGlsl)
    .replace(/#include\s+\.\/lib\/cracks\.glsl/g,       cracksGlsl)
    .replace(/#include\s+\.\/lib\/lava\.glsl/g,         lavaGlsl)
    .replace(/#include\s+\.\/lib\/liquidMask\.glsl/g,   liquidMaskGlsl)
}

/** Vertex shader resolved (shared by all planet types). */
export const VERTEX_SHADER: string = resolve(bodyVert)

/** Fragment shaders resolved, ready for `THREE.ShaderMaterial`. */
export const FRAG_SHADERS: Record<LibBodyType, string> = {
  rocky:    resolve(rockyFrag),
  gaseous:  resolve(gasFrag),
  metallic: resolve(metalFrag),
  star:     resolve(starFrag),
}
