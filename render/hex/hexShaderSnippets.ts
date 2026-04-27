/**
 * Inline GLSL snippets shared by the hex-mode rendering paths.
 *
 * Co-located here so the same gradient-noise + bump primitives are reused
 * by `applyHexShader` (terrain bump + edge blend on the interactive hex
 * mesh) without re-declaring them per call site.
 *
 * These snippets are appended *raw* into Three.js' generated shaders via
 * `onBeforeCompile`; they are not standalone files and rely on uniforms /
 * varyings that the host material declares around them.
 */

/**
 * Sin-free hash + tri-linear gradient noise. Self-contained: provides
 * `_wHash3(p) → vec3` and `_wNoise(p) → float` (in `[0, 1]`) that the
 * other snippets in this file consume.
 */
export const GRADIENT_NOISE_GLSL = /* glsl */`
// Sin-free polynomial hash — faster and avoids precision issues on mobile GPUs
vec3 _wHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float _wNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = dot(_wHash3(i + vec3(0,0,0)) * 2.0 - 1.0, f - vec3(0,0,0));
  float b = dot(_wHash3(i + vec3(1,0,0)) * 2.0 - 1.0, f - vec3(1,0,0));
  float c = dot(_wHash3(i + vec3(0,1,0)) * 2.0 - 1.0, f - vec3(0,1,0));
  float d = dot(_wHash3(i + vec3(1,1,0)) * 2.0 - 1.0, f - vec3(1,1,0));
  float e = dot(_wHash3(i + vec3(0,0,1)) * 2.0 - 1.0, f - vec3(0,0,1));
  float f2= dot(_wHash3(i + vec3(1,0,1)) * 2.0 - 1.0, f - vec3(1,0,1));
  float g = dot(_wHash3(i + vec3(0,1,1)) * 2.0 - 1.0, f - vec3(0,1,1));
  float h = dot(_wHash3(i + vec3(1,1,1)) * 2.0 - 1.0, f - vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
             mix(mix(e,f2,u.x),mix(g,h,u.x), u.y), u.z) * 0.5 + 0.5;
}
`

/**
 * Terrain bump-mapping — dual-octave normal perturbation for land tiles.
 * Submerged tiles (below the waterline on liquid worlds) are gated out via
 * `aLand`. Frozen / dry worlds flag every tile as land so the bump applies
 * uniformly across the surface.
 *
 * Injected after `normal_fragment_maps`.
 */
export const TERRAIN_NORMAL_GLSL = /* glsl */`
if (vLand > 0.5 && uTerrainBumpEnabled > 0.5) {
  float _tEps = 0.025;

  float _tFreq      = 8.0;
  float _tStrength  = 0.22 * uBumpStrength;
  float _tFreq2     = 20.0;
  float _tStrength2 = 0.08 * uBumpStrength;

  // Primary octave bump — object-space so pattern follows rotation
  vec3  _tp1 = vObjectPos * _tFreq;
  float _th0 = _wNoise(_tp1);
  float _thx = _wNoise(_tp1 + vec3(_tEps, 0.0, 0.0));
  float _thy = _wNoise(_tp1 + vec3(0.0, _tEps, 0.0));
  float _thz = _wNoise(_tp1 + vec3(0.0, 0.0, _tEps));
  vec3  _tGrad = (vec3(_thx, _thy, _thz) - _th0) / _tEps;
  _tGrad -= normal * dot(_tGrad, normal);
  vec3 _tN = normalize(normal - _tGrad * _tStrength);

  // Secondary octave (sharper detail)
  vec3  _tp2 = vObjectPos * _tFreq2;
  float _th0b = _wNoise(_tp2);
  float _thxb = _wNoise(_tp2 + vec3(_tEps, 0.0, 0.0));
  float _thyb = _wNoise(_tp2 + vec3(0.0, _tEps, 0.0));
  float _thzb = _wNoise(_tp2 + vec3(0.0, 0.0, _tEps));
  vec3  _tGrad2 = (vec3(_thxb, _thyb, _thzb) - _th0b) / _tEps;
  _tGrad2 -= _tN * dot(_tGrad2, _tN);
  _tN = normalize(_tN - _tGrad2 * _tStrength2);

  normal = _tN;
}
`

/**
 * Edge blending — softens the hard color boundary between adjacent hex tiles.
 *
 * Near the tile edge (distance to tile center > 55% of tile radius), the
 * per-vertex color is progressively blended toward a world-space procedural
 * noise color. Because the noise field is continuous and identical on both
 * sides of a shared edge, the two adjacent tiles converge to the same color
 * at the boundary, creating a smooth gradient.
 *
 * The blend uses the vertex color's own luminance as the noise seed color,
 * shifted by a low-frequency noise pattern. This keeps the overall palette
 * intact while dissolving the sharp edges.
 *
 * Injected after `#include <color_fragment>` (alongside the terrain color block).
 */
export const EDGE_BLEND_GLSL = /* glsl */`
if (uEdgeBlendEnabled > 0.5 && vTileRadius > 0.0) {
  float _edgeDist = length(vWorldPos - vTileCenter);
  float _edgeT    = clamp(_edgeDist / vTileRadius, 0.0, 1.0);
  // Blend starts at 30% of the radius so the effect covers most of the tile
  float _edgeMix  = smoothstep(0.30, 1.0, _edgeT);

  if (_edgeMix > 0.001) {
    // Object-space noise continuous across tile boundaries — follows rotation.
    // Single noise sample + sin-derived channels (saves 2 × 8 hash evals).
    float _en1 = _wNoise(vObjectPos * 8.0);
    float _en2 = sin(_en1 * 6.2831 + 1.85) * 0.5 + 0.5;
    float _en3 = sin(_en1 * 6.2831 + 3.71) * 0.5 + 0.5;

    // Noise color: wide modulation range so the blend is clearly visible
    vec3 _noiseColor = diffuseColor.rgb * (0.65 + 0.70 * vec3(_en1, _en2, _en3));

    diffuseColor.rgb = mix(diffuseColor.rgb, _noiseColor, _edgeMix * uEdgeBlendStrength);
  }
}
`
