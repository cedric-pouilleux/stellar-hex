import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../geometry/hexasphere.types'
import type { TerrainLevel } from '../types/body.types'
import type { BodySimulation } from '../sim/BodySimulation'
import type { BiomeType } from '../types/surface.types'
import type { TileResources } from '../sim/TileState'
import { getResourceVisual } from './resourceVisualRegistry'
import { getBodyResourceBridge } from '../sim/resourceDistributionRegistry'
import { isSurfaceWaterBiome, hasLiquidSurface } from '../physics/bodyWater'

/**
 * Returns the resource ID with the highest concentration on a tile, or
 * undefined when no resources are present. Inlined in body so the render
 * pipeline doesn't depend on the resources feature.
 */
function dominantResource(resources: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined
  let bestAmt = 0
  for (const [id, amt] of resources) {
    if (amt > bestAmt) { bestAmt = amt; best = id }
  }
  return best
}
import { BodyMaterial } from '../shaders'
import type { ParamMap } from '../shaders'
import { buildPermTable, permTableToTexture } from '../core/oceanMask'
import { configToLibParams, bodyTypeToLibType } from './configToLibParams'
import type { BodyVariation } from './bodyVariation'
import { type HoverConfig, DEFAULT_HOVER } from '../config/render'
import { hoverLocalPos, hoverParentGroup, pinLocalPos, pinParentGroup } from '../core/hoverState'
import { hexGraphicsUniforms } from './hexGraphicsUniforms'

export type { TerrainLevel }

/** Subset of tile geometry metadata exposed to external overlay renderers. */
export interface TileGeometryInfo {
  tile:  Tile
  level: TerrainLevel
}

/** Listener notified when the hovered tile id changes. Null = no tile. */
export type HoverListener = (tileId: number | null) => void
/** Shadow cast by an orbiting child onto this planet's surface. */
export type ShadowUniforms   = { pos: { value: THREE.Vector3 }; radius: { value: number } }
/** Parent body occluding sunlight from reaching this surface. */
export type OccluderUniforms = { pos: { value: THREE.Vector3 }; radius: { value: number } }
// ── Shared helpers ────────────────────────────────────────────────

/** Returns the TerrainLevel matching the given elevation in a sorted palette. */
export function getTileLevel(elevation: number, levels: TerrainLevel[]): TerrainLevel {
  return levels.find(l => elevation < l.threshold) ?? levels[levels.length - 1]
}

// ── Resource color blending ───────────────────────────────────────
// Blends the dominant resource color onto the terrain base color.
// The result is a struct ready to splat into per-vertex buffers.

/** Amplifies resource color so small deposits remain visible at low concentrations. */
const COLOR_BLEND_SCALE    = 2.5
/** Metallic ores drive a steeper roughness/metalness material shift than color blending. */
const METALLIC_BLEND_SCALE = 1.6
/** Emissive resources reach peak glow intensity at half-concentration (50% deposit). */
const EMISSIVE_BLEND_SCALE = 2.0

/** Adds emissive contribution to a base channel, clamped to [0, 1]. */
function addEmissive(base: number, emissiveChannel: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissiveChannel ?? 0) * intensity)
}

interface TileVisual {
  r:        number
  g:        number
  b:        number
  rough:    number
  metal:    number
  emissive: THREE.Color | undefined
  emissiveI: number
}

function applyResourceBlend(
  baseColor: THREE.Color,
  baseRough: number,
  baseMetal: number,
  baseEmissive: THREE.Color | undefined,
  baseEmissiveI: number,
  biome: BiomeType | undefined,
  resources: TileResources,
): TileVisual {
  const dominant = dominantResource(resources)
  const bridge   = getBodyResourceBridge()
  const dominantIsLiquid = !!dominant && !!bridge?.isSurfaceLiquidResource(dominant)

  // A surface-liquid deposit on a non-ocean biome is purely underground — no
  // visual change. On ocean biomes, only the surface liquid may influence the
  // visual; any other dominant resource on an ocean tile sits underwater and
  // must not override ocean color. No dominant resource: base colors pass
  // through unchanged. Without a bridge, non-liquid rules apply by default.
  if (
    !dominant ||
    (dominantIsLiquid && !isSurfaceWaterBiome(biome)) ||
    (isSurfaceWaterBiome(biome) && !dominantIsLiquid)
  ) {
    return {
      r:         addEmissive(baseColor.r, baseEmissive?.r, baseEmissiveI),
      g:         addEmissive(baseColor.g, baseEmissive?.g, baseEmissiveI),
      b:         addEmissive(baseColor.b, baseEmissive?.b, baseEmissiveI),
      rough:     baseRough,
      metal:     baseMetal,
      emissive:  baseEmissive,
      emissiveI: baseEmissiveI,
    }
  }

  const vis    = getResourceVisual(dominant)
  if (!vis) {
    return {
      r:         addEmissive(baseColor.r, baseEmissive?.r, baseEmissiveI),
      g:         addEmissive(baseColor.g, baseEmissive?.g, baseEmissiveI),
      b:         addEmissive(baseColor.b, baseEmissive?.b, baseEmissiveI),
      rough:     baseRough,
      metal:     baseMetal,
      emissive:  baseEmissive,
      emissiveI: baseEmissiveI,
    }
  }
  const amount = resources.get(dominant)!
  // Color blend strength: amplified so small deposits remain visible.
  const colorT = Math.min(1, amount * vis.colorBlend * COLOR_BLEND_SCALE)

  // Metallic ores (iron, nickel, etc.) use a steeper material-property blend curve
  // so the tile reads as ore/metal at full concentration. The bridge is queried
  // for metal membership so body stays decoupled from the resources feature.
  const matT = bridge?.isMetallic(dominant)
    ? Math.min(1, amount * METALLIC_BLEND_SCALE)
    : colorT

  const blendedR = baseColor.r + (vis.color.r - baseColor.r) * colorT
  const blendedG = baseColor.g + (vis.color.g - baseColor.g) * colorT
  const blendedB = baseColor.b + (vis.color.b - baseColor.b) * colorT

  const emissive  = vis.emissive ?? baseEmissive
  const emissiveI = vis.emissive
    ? (vis.emissiveIntensity ?? 0) * Math.min(1, amount * EMISSIVE_BLEND_SCALE)
    : baseEmissiveI

  return {
    r:         addEmissive(blendedR, emissive?.r, emissiveI),
    g:         addEmissive(blendedG, emissive?.g, emissiveI),
    b:         addEmissive(blendedB, emissive?.b, emissiveI),
    rough:     baseRough + (vis.roughness - baseRough) * matT,
    metal:     baseMetal + (vis.metalness - baseMetal) * matT,
    emissive,
    emissiveI,
  }
}

function v(x: number, y: number, z: number) { return new THREE.Vector3(x, y, z) }
function pushVec(arr: number[], vec: THREE.Vector3) { arr.push(vec.x, vec.y, vec.z) }



// ── Terrain shader options ────────────────────────────────────────

// ── Hex tile shader (interactive view) ───────────────────────────
// Minimal shader for the focused hex mesh: per-vertex roughness/metalness
// + optional fill light. NO procedural effects (ice, lava, etc.).
// Tile colors are the single source of truth in hex mode.

/**
 * Applies per-vertex roughness/metalness + optional water animation to the
 * interactive hex mesh material. Ocean tiles (aOcean = 1) receive animated
 * caustics, Fresnel-based specular highlights and gentle color ripples
 * driven by the uTime uniform.
 */
function applyHexShader(
  m:            THREE.MeshStandardMaterial,
  fillUniform:  { value: number },
  timeUniform:  { value: number },
  metallicSheen: number,
): void {
  m.customProgramCacheKey = () => 'hex_fill_water_terrain'

  m.onBeforeCompile = (shader) => {
    // ── Vertex shader: forward per-vertex attributes ──────────────
    shader.vertexShader =
      'attribute float aRoughness;\nattribute float aMetalness;\n' +
      'attribute float aOcean;\n' +
      'attribute float aBiome;\n' +
      'attribute vec3  aTileCenter;\nattribute float aTileRadius;\n' +
      'varying float vRoughness;\nvarying float vMetalness;\n' +
      'varying float vOcean;\n' +
      'varying float vBiome;\n' +
      'varying vec3  vTileCenter;\nvarying float vTileRadius;\n' +
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' +
      // Object-space position for noise sampling — stays fixed on the surface
      // regardless of group rotation so wave/terrain patterns follow the planet.
      'varying vec3 vObjectPos;\n' +
      shader.vertexShader

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vRoughness   = aRoughness;',
      'vMetalness   = aMetalness;',
      'vOcean       = aOcean;',
      'vBiome       = aBiome;',
      'vTileCenter  = (modelMatrix * vec4(aTileCenter, 1.0)).xyz;',
      'vTileRadius  = aTileRadius;',
      'vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      'vWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vObjectPos   = transformed;',
    ].join('\n'))

    // ── Fragment shader: water + terrain effects + metallic sheen ──
    shader.fragmentShader =
      'varying float vRoughness;\nvarying float vMetalness;\n' +
      'varying float vOcean;\n' +
      'varying float vBiome;\n' +
      'varying vec3  vTileCenter;\nvarying float vTileRadius;\n' +
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' +
      'varying vec3 vObjectPos;\n' +
      'uniform float uFillIntensity;\n' +
      'uniform float uMetallicSheen;\n' +
      'uniform float uTime;\n' +
      'uniform float uWaterEnabled;\n' +
      'uniform float uTerrainBumpEnabled;\n' +
      'uniform float uEdgeBlendEnabled;\n' +
      'uniform float uWaveStrength;\n' +
      'uniform float uWaveSpeed;\n' +
      'uniform float uSpecularIntensity;\n' +
      'uniform float uBumpStrength;\n' +
      'uniform float uEdgeBlendStrength;\n' +
      /* Inline noise helpers (shared by water + terrain shaders). */
      WATER_NOISE_GLSL +
      /* Cached results from bump pass → reused in specular + color without recomputing. */
      'vec3  _cachedWaveNormal = vec3(0.0);\n' +
      'float _cachedWaveH     = 0.0;\n' +
      shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      // Ocean tiles are slightly smoother than terrain but stay matte
      'float _oceanMix = vOcean * uWaterEnabled;\n' +
      'float roughnessFactor = mix(vRoughness, 0.38, _oceanMix);',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      'float metalnessFactor = mix(vMetalness, 0.12, _oceanMix);',
    )

    // Bump-mapping: wave normals for ocean + terrain normals for land biomes.
    // Both injected after normal_fragment_maps so Three.js uses perturbed
    // normals for all lighting calculations (diffuse + specular).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' + WATER_NORMAL_GLSL + TERRAIN_NORMAL_GLSL,
    )

    // Color modulation: water depth + edge blend
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' + WATER_COLOR_GLSL + EDGE_BLEND_GLSL,
    )

    // Metallic sheen + fill light + water specular highlights
    const extra = `
{
  vec3  _toSun = normalize(-vWorldPos);
  float _ndl   = dot(vWorldNormal, _toSun);
  float _lit   = smoothstep(-0.10, 0.28, _ndl);

  // ── Metallic sheen (unchanged) ────────────────────────────────
  float _mMask = uMetallicSheen * vMetalness;
  reflectedLight.indirectDiffuse  *= mix(1.0, 0.18 + 0.82 * _lit, _mMask);
  reflectedLight.indirectSpecular *= mix(1.0, 0.15 + 0.85 * _lit, _mMask);
  float _rim = pow(1.0 - max(0.0, dot(vWorldNormal, normalize(cameraPosition - vWorldPos))), 3.8)
             * smoothstep(-0.08, 0.45, _ndl);
  reflectedLight.directSpecular += diffuseColor.rgb * _rim * _mMask * 0.55;

  // ── Water: wave-based specular glint ────────────────────────────
  // Reuses the bump-perturbed normal cached in the normal pass — no recomputation.
  if (vOcean > 0.5 && uWaterEnabled > 0.5) {
    vec3  _viewDir = normalize(cameraPosition - vWorldPos);
    vec3  _wN      = _cachedWaveNormal;
    float _fresnel = pow(1.0 - max(0.0, dot(_wN, _viewDir)), 5.0);
    // Sun glint scattered by wave facets
    float _sunSpec = pow(max(0.0, dot(reflect(-_toSun, _wN), _viewDir)), 80.0);
    // Soft caustic undertone
    float _caustic = _waterCaustic(vObjectPos * 6.0, uTime * uWaveSpeed);
    vec3  _waterHL = vec3(0.75, 0.88, 1.0) * (_fresnel * 0.08 + _sunSpec * 0.25 * _lit + _caustic * 0.03 * _lit) * uSpecularIntensity;
    reflectedLight.directSpecular += _waterHL;
  }
}
reflectedLight.indirectDiffuse += diffuseColor.rgb * uFillIntensity;
`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>' + extra,
    )

    shader.uniforms.uFillIntensity    = fillUniform
    shader.uniforms.uMetallicSheen    = { value: metallicSheen }
    shader.uniforms.uTime             = timeUniform
    shader.uniforms.uWaterEnabled        = hexGraphicsUniforms.uWaterEnabled
    shader.uniforms.uTerrainBumpEnabled  = hexGraphicsUniforms.uTerrainBumpEnabled
    shader.uniforms.uEdgeBlendEnabled    = hexGraphicsUniforms.uEdgeBlendEnabled
    shader.uniforms.uWaveStrength        = hexGraphicsUniforms.uWaveStrength
    shader.uniforms.uWaveSpeed           = hexGraphicsUniforms.uWaveSpeed
    shader.uniforms.uSpecularIntensity   = hexGraphicsUniforms.uSpecularIntensity
    shader.uniforms.uBumpStrength        = hexGraphicsUniforms.uBumpStrength
    shader.uniforms.uEdgeBlendStrength   = hexGraphicsUniforms.uEdgeBlendStrength
  }
}

// ── Inline GLSL snippets for water effect ────────────────────────

/** Hash + gradient noise + wave height field with analytical normal. */
const WATER_NOISE_GLSL = /* glsl */`
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

// ── Wave height field ──────────────────────────────────────────
// Two octaves of drifting noise at different scales and directions
// simulate overlapping ocean swell patterns. Returns a scalar wave
// height in [0,1]. Third octave (freq 6.5) removed — sub-pixel detail.
float _waveHeight(vec3 p, float t) {
  // Primary swell — large rolling waves, dominant eastward drift
  float w1 = _wNoise(p * 1.0 + vec3(t * 0.035, t * 0.012, -t * 0.008));
  // Secondary chop — medium waves crossing at an angle
  float w2 = _wNoise(p * 2.8 - vec3(t * 0.018, -t * 0.042, t * 0.025));
  return w1 * 0.60 + w2 * 0.40;
}

// ── Wave-perturbed normal via finite differences ───────────────
// Samples the wave height field around the current point and computes
// the gradient to derive a tangent-space perturbation, then blends it
// into the geometric normal. This is bump-mapping on the fly.
vec3 _waveNormal(vec3 worldPos, vec3 N, float t, float strength) {
  float eps = 0.02;
  vec3 p = worldPos * 5.0;
  float h0 = _waveHeight(p, t);
  float hx = _waveHeight(p + vec3(eps, 0.0, 0.0), t);
  float hy = _waveHeight(p + vec3(0.0, eps, 0.0), t);
  float hz = _waveHeight(p + vec3(0.0, 0.0, eps), t);
  // Gradient in world space
  vec3 grad = (vec3(hx, hy, hz) - h0) / eps;
  // Project gradient onto the surface tangent plane (remove radial component)
  grad -= N * dot(grad, N);
  return normalize(N - grad * strength);
}

// Soft caustic (light focusing through wave crests) for specular.
// Single noise + double-frequency sin fold creates similar dappled light patterns
// with half the cost (saves 8 hash evaluations per ocean fragment).
float _waterCaustic(vec3 p, float t) {
  float n1 = _wNoise(p + vec3(t * 0.028, t * 0.018, -t * 0.012));
  float c  = sin(n1 * 12.566) * 0.5 + 0.5;
  return c * c;
}
`

/**
 * Wave bump-mapping — perturbs the geometric normal on ocean tiles so that
 * Three.js standard lighting reveals small wave shapes via diffuse shading
 * and specular highlights. Injected after #include <normal_fragment_maps>.
 *
 * Default strength 1.0 gives pronounced, clearly visible wave deformation.
 * Adjustable at runtime via the uWaveStrength uniform.
 */
const WATER_NORMAL_GLSL = /* glsl */`
if (vOcean > 0.5 && uWaterEnabled > 0.5) {
  // Use object-space position so wave patterns stay fixed on the surface
  // and follow the planet's rotation instead of sliding in world space.
  normal = _waveNormal(vObjectPos, normal, uTime * uWaveSpeed, uWaveStrength);
  // Cache for reuse in specular + color passes (avoids 8+ redundant _wNoise calls)
  _cachedWaveNormal = normal;
  _cachedWaveH      = _waveHeight(vObjectPos * 5.0, uTime * uWaveSpeed);
}
`

/**
 * Ocean color modulation — animated color drift and depth darkening that
 * give the water surface a living, dynamic feel. Uses two noise layers
 * for hue/luminance variation. Injected after #include <color_fragment>.
 */
const WATER_COLOR_GLSL = /* glsl */`
if (vOcean > 0.5 && uWaterEnabled > 0.5) {
  // Animated luminance drift — reuse cached wave height from bump pass
  float _wH = _cachedWaveH;
  diffuseColor.rgb *= 1.0 + (_wH - 0.5) * 0.12;

  // Subtle animated hue shift — shallow crests pull toward teal,
  // deep troughs toward darker blue. Object-space sampling so the
  // pattern follows rotation.
  float _t = uTime * uWaveSpeed;
  float _hueNoise = _wNoise(vObjectPos * 3.0 + vec3(_t * 0.015, -_t * 0.010, _t * 0.008));
  vec3 _tealShift = vec3(-0.02, 0.03, 0.04);   // teal cast on crests
  vec3 _deepShift = vec3(-0.01, -0.02, 0.01);   // deep blue in troughs
  diffuseColor.rgb += mix(_deepShift, _tealShift, _hueNoise) * 0.35;
}
`

// ── Inline GLSL for terrain bump-mapping + intra-tile color variation ─

/**
 * Biome encoding (float attribute):
 *   0 = none/unknown, 1 = ocean, 2 = plains, 3 = forest,
 *   4 = desert, 5 = mountain, 6 = volcanic, 7 = ice_peak,
 *   8 = ice_sheet
 */
const BIOME_ENCODE: Record<string, number> = {
  ocean: 1, plains: 2, forest: 3, desert: 4,
  mountain: 5, volcanic: 6, ice_peak: 7, ice_sheet: 8,
}

/**
 * Terrain bump-mapping — per-biome normal perturbation for land tiles.
 * Each biome uses a different noise pattern and strength so the surface
 * reads as terrain rather than flat colored hexagons.
 *
 * Injected after normal_fragment_maps (alongside water bump).
 */
const TERRAIN_NORMAL_GLSL = /* glsl */`
if (vOcean < 0.5 && vBiome > 1.5 && uTerrainBumpEnabled > 0.5) {
  float _tEps = 0.025;

  // Per-biome frequency / strength / style
  float _tFreq     = 8.0;
  float _tStrength  = 0.25;
  float _tFreq2     = 0.0;  // secondary octave freq (0 = disabled)
  float _tStrength2 = 0.0;

  // plains: gentle rolling terrain
  if (vBiome < 2.5) {
    _tFreq = 5.0; _tStrength = 0.12;
  }
  // forest: medium canopy-like undulations
  else if (vBiome < 3.5) {
    _tFreq = 10.0; _tStrength = 0.22;
    _tFreq2 = 22.0; _tStrength2 = 0.08;
  }
  // desert: directional dune ridges + fine sand grain
  else if (vBiome < 4.5) {
    _tFreq = 6.0; _tStrength = 0.18;
    _tFreq2 = 18.0; _tStrength2 = 0.06;
  }
  // mountain: sharp rocky detail
  else if (vBiome < 5.5) {
    _tFreq = 14.0; _tStrength = 0.35;
    _tFreq2 = 30.0; _tStrength2 = 0.12;
  }
  // volcanic: cracked / broken terrain
  else if (vBiome < 6.5) {
    _tFreq = 12.0; _tStrength = 0.30;
    _tFreq2 = 25.0; _tStrength2 = 0.10;
  }
  // ice_peak: smooth crystalline facets
  else if (vBiome < 7.5) {
    _tFreq = 7.0; _tStrength = 0.15;
    _tFreq2 = 16.0; _tStrength2 = 0.05;
  }
  // ice_sheet: very smooth glacier surface (flat frozen sea)
  else {
    _tFreq = 4.0; _tStrength = 0.08;
    _tFreq2 = 14.0; _tStrength2 = 0.04;
  }

  // Apply global multiplier
  _tStrength  *= uBumpStrength;
  _tStrength2 *= uBumpStrength;

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
  if (_tFreq2 > 0.0) {
    vec3  _tp2 = vObjectPos * _tFreq2;
    float _th0b = _wNoise(_tp2);
    float _thxb = _wNoise(_tp2 + vec3(_tEps, 0.0, 0.0));
    float _thyb = _wNoise(_tp2 + vec3(0.0, _tEps, 0.0));
    float _thzb = _wNoise(_tp2 + vec3(0.0, 0.0, _tEps));
    vec3  _tGrad2 = (vec3(_thxb, _thyb, _thzb) - _th0b) / _tEps;
    _tGrad2 -= _tN * dot(_tGrad2, _tN);
    _tN = normalize(_tN - _tGrad2 * _tStrength2);
  }

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
 * Injected after #include <color_fragment> (alongside water + terrain color).
 */
const EDGE_BLEND_GLSL = /* glsl */`
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

// ── Prism geometry (hex tile with height) ─────────────────────────

function buildPrismGeometry(
  tile:     Tile,
  height:   number,
  basement: number = 0,
): THREE.BufferGeometry {
  const { centerPoint, boundary } = tile
  // Extrude each vertex along its own radial direction (normalize per vertex).
  // This ensures the extruded vertex sits at radius (len + delta) from the sphere
  // centre, producing a flat top face and perfectly matching edges with neighbours.
  const extrudeRadial = (
    p: { x: number; y: number; z: number },
    delta: number,
  ): THREE.Vector3 => {
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    const scale = (len + delta) / len
    return v(p.x * scale, p.y * scale, p.z * scale)
  }

  const topCenter   = extrudeRadial(centerPoint, height)
  const topBoundary = boundary.map(p => extrudeRadial(p, height))
  // Walls can start below the sphere surface when `basement` is negative —
  // used to reach a common sea-floor level so the hex grid seals the
  // shoreline even when the ocean layer is hidden.
  const botBoundary = boundary.map(p => extrudeRadial(p, basement))

  const positions: number[] = []
  const normals:   number[] = []
  const n = boundary.length

  const topNormal = new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z).normalize()
  for (let i = 0; i < n; i++) {
    pushVec(positions, topCenter)
    pushVec(positions, topBoundary[i])
    pushVec(positions, topBoundary[(i + 1) % n])
    for (let k = 0; k < 3; k++) pushVec(normals, topNormal)
  }

  if (height > basement) {
    for (let i = 0; i < n; i++) {
      const tA = topBoundary[i],  tB = topBoundary[(i + 1) % n]
      const bA = botBoundary[i],  bB = botBoundary[(i + 1) % n]
      const sideNormal = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(tB, tA), new THREE.Vector3().subVectors(bA, tA))
        .normalize()
      pushVec(positions, tA); pushVec(positions, tB); pushVec(positions, bA)
      for (let k = 0; k < 3; k++) pushVec(normals, sideNormal)
      pushVec(positions, tB); pushVec(positions, bB); pushVec(positions, bA)
      for (let k = 0; k < 3; k++) pushVec(normals, sideNormal)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
  return geo
}

// ── Merged hexasphere geometry ────────────────────────────────────

/** Vertex range in the merged buffer for a single tile. */
interface TileVertexRange { start: number; count: number }

function buildMergedGeometry(
  sim:    BodySimulation,
  levels: TerrainLevel[],
  opts?:  { excludeOceanVisual?: boolean },
): { geometry: THREE.BufferGeometry; faceToTileId: number[]; tileVertexRange: Map<number, TileVertexRange> } {
  const geometries:     THREE.BufferGeometry[]         = []
  const faceToTileId:   number[]                       = []
  const tileVertexRange = new Map<number, TileVertexRange>()

  // Only animate ocean tiles (waves, fresnel, caustics) when the planet's
  // surface body is actually in liquid state. Frozen oceans stay static.
  const surfaceIsLiquid = hasLiquidSurface(sim.config)
  // When a separate smooth ocean layer handles the water surface, the hex
  // ocean tiles still emit their sunken caps (sea floor, visible through
  // transparent water) but stop driving the water shader — no wave animation
  // or per-tile hex seam artefacts on the water surface.
  const excludeOcean    = opts?.excludeOceanVisual === true

  // Walls extend down to the deepest palette level so the grid seals along
  // the shoreline — otherwise land tiles would expose a gap where their
  // bottom meets the (lower) neighbouring ocean-floor tile's top.
  const basementHeight = surfaceIsLiquid ? levels[0].height : 0

  let vertexOffset = 0

  for (const tile of sim.tiles) {
    const state     = sim.tileStates.get(tile.id)!
    const level     = getTileLevel(state.elevation, levels)
    const geo       = buildPrismGeometry(tile, level.height, basementHeight)
    const faceCount = geo.getAttribute('position').count / 3
    for (let f = 0; f < faceCount; f++) faceToTileId.push(tile.id)

    const vertCount = geo.getAttribute('position').count
    tileVertexRange.set(tile.id, { start: vertexOffset, count: vertCount })
    vertexOffset += vertCount

    const resources: TileResources = sim.resourceMap.get(tile.id) ?? new Map()

    const vis = applyResourceBlend(
      level.color,
      level.roughness ?? 0.85,
      level.metalness ?? 0.0,
      level.emissive,
      level.emissiveIntensity ?? 0,
      state.biome,
      resources,
    )
    const { r, g, b, rough, metal } = vis

    const colors   = new Float32Array(vertCount * 3)
    const roughArr = new Float32Array(vertCount)
    const metalArr = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b
      roughArr[i]   = rough
      metalArr[i]   = metal
    }
    // Ocean flag for the water shader. Frozen surfaces set this to 0 so ice
    // sheets render as static terrain rather than flowing water. When a
    // separate smooth ocean layer owns the water surface, the hex ocean
    // tiles also set this to 0 — their sunken caps serve as the static sea
    // floor visible through the transparent overlay.
    const isSurfaceOcean = state.biome === 'ocean' || state.biome === 'ocean_deep'
    const isOcean        = !excludeOcean && surfaceIsLiquid && isSurfaceOcean ? 1.0 : 0.0
    const biomeCode      = state.biome ? (BIOME_ENCODE[state.biome] ?? 0.0) : 0.0
    const oceanArr = new Float32Array(vertCount)
    const biomeArr = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      oceanArr[i] = isOcean
      biomeArr[i] = biomeCode
    }

    // Tile center + average boundary radius for edge blending shader.
    // The center is extruded to the top surface so the distance computation
    // in the fragment shader is in the same plane as the visible top face.
    const { centerPoint, boundary } = tile
    const cLen   = Math.sqrt(centerPoint.x ** 2 + centerPoint.y ** 2 + centerPoint.z ** 2)
    const cScale = (cLen + level.height) / cLen
    const cx = centerPoint.x * cScale
    const cy = centerPoint.y * cScale
    const cz = centerPoint.z * cScale
    let avgR = 0
    for (const bp of boundary) {
      const bLen = Math.sqrt(bp.x ** 2 + bp.y ** 2 + bp.z ** 2)
      const bScale = (bLen + level.height) / bLen
      const dx = bp.x * bScale - cx
      const dy = bp.y * bScale - cy
      const dz = bp.z * bScale - cz
      avgR += Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
    avgR /= boundary.length

    const tileCenterArr = new Float32Array(vertCount * 3)
    const tileRadiusArr = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      tileCenterArr[i * 3]     = cx
      tileCenterArr[i * 3 + 1] = cy
      tileCenterArr[i * 3 + 2] = cz
      tileRadiusArr[i]         = avgR
    }

    geo.setAttribute('color',        new THREE.Float32BufferAttribute(colors,        3))
    geo.setAttribute('aRoughness',   new THREE.Float32BufferAttribute(roughArr,      1))
    geo.setAttribute('aMetalness',   new THREE.Float32BufferAttribute(metalArr,      1))
    geo.setAttribute('aOcean',       new THREE.Float32BufferAttribute(oceanArr,      1))
    geo.setAttribute('aBiome',       new THREE.Float32BufferAttribute(biomeArr,      1))
    geo.setAttribute('aTileCenter',  new THREE.Float32BufferAttribute(tileCenterArr, 3))
    geo.setAttribute('aTileRadius',  new THREE.Float32BufferAttribute(tileRadiusArr, 1))
    geometries.push(geo)
  }

  const geometry = mergeGeometries(geometries)
  geometries.forEach(g => g.dispose())
  return { geometry, faceToTileId, tileVertexRange }
}

export function buildPlanetMesh(
  sim:    BodySimulation,
  levels: TerrainLevel[],
): { mesh: THREE.Mesh; faceToTileId: number[] } {
  const surfaceLiquid = hasLiquidSurface(sim.config)
  const { geometry, faceToTileId } = buildMergedGeometry(
    sim, levels, { excludeOceanVisual: surfaceLiquid },
  )
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.FrontSide }),
  )
  return { mesh, faceToTileId }
}

// ── Gas core palette ──────────────────────────────────────────────
// Dark metallic/rocky tones for the solid inner core of gas giants
// (metallic hydrogen + silicates + iron).

export const PALETTE_ROCKY_CORE: TerrainLevel[] = [
  { threshold:  0.25, height: 0.008, color: new THREE.Color(0x1e1a16), metalness: 0.90, roughness: 0.35 },
  { threshold:  0.55, height: 0.018, color: new THREE.Color(0x3c2e24), metalness: 0.80, roughness: 0.45 },
  { threshold:  0.80, height: 0.030, color: new THREE.Color(0x5c4a38), metalness: 0.65, roughness: 0.55 },
  { threshold:  Infinity, height: 0.042, color: new THREE.Color(0x7a6248), metalness: 0.50, roughness: 0.65 },
]

// ── Gas interior background mesh ──────────────────────────────────
// Rendered with BackSide so only the far hemisphere is drawn.
// Back-face triangles sit naturally at the deepest z-buffer values →
// the core hex tiles always appear on top without any opacity hack.
// Animated horizontal gas bands use the planet's own tinted palette colors.

const GAS_INTERIOR_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    // Pass normalised sphere direction for band/turbulence computation.
    vDir        = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GAS_INTERIOR_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3  uColorA;   // deep band (palette[0])
  uniform vec3  uColorB;   // mid band  (palette[2] or palette[1])
  uniform vec3  uColorC;   // highlight (palette[1])

  varying vec3 vDir;

  // Smooth value noise (1-D)
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float vnoise(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), u);
  }

  void main() {
    float lat = vDir.y;   // -1 (south pole) … +1 (north pole)

    // Slow undulating turbulence applied as latitude offset
    float turb = (vnoise(lat * 5.0 + uTime * 0.04) - 0.5) * 0.22;

    // Wide primary bands drifting eastward
    float band1 = sin((lat + turb) * 5.0  + uTime * 0.06) * 0.5 + 0.5;
    // Narrower secondary detail bands drifting westward
    float band2 = sin((lat + turb * 1.4) * 11.0 - uTime * 0.09) * 0.5 + 0.5;

    vec3 color = mix(uColorA, uColorB, band1);
    color      = mix(color, uColorC, band2 * 0.35);

    // Soft polar fade to avoid band crowding at the poles
    float fade  = 1.0 - abs(lat) * 0.35;
    gl_FragColor = vec4(color, 0.70 * fade);
  }
`

export interface GasInteriorMesh {
  mesh:    THREE.Mesh
  tick:    (dt: number) => void
  dispose: () => void
}

/**
 * Builds the animated gas-background sphere shown behind the core hex tiles.
 *
 * Uses BackSide rendering so only the far hemisphere is rasterised —
 * those fragments are at the maximum depth and never occlude core tiles.
 * The band shader uses the tinted gas palette for visual identity.
 *
 * @param radius  - Gas envelope radius (full planet radius, not core).
 * @param palette - Tinted gas TerrainLevel palette (at least 2 entries).
 */
export function buildGasInteriorMesh(radius: number, palette: TerrainLevel[]): GasInteriorMesh {
  const c0 = (palette[0]?.color ?? new THREE.Color(0xc08040)).clone()
  const c1 = (palette[1]?.color ?? new THREE.Color(0xe8b870)).clone()
  const c2 = (palette[2]?.color ?? c1).clone()

  const timeUniform = { value: 0 }
  const mat = new THREE.ShaderMaterial({
    vertexShader:   GAS_INTERIOR_VERT,
    fragmentShader: GAS_INTERIOR_FRAG,
    uniforms: {
      uTime:   timeUniform,
      uColorA: { value: c0 },
      uColorB: { value: c2 },
      uColorC: { value: c1 },
    },
    transparent: true,
    depthWrite:  false,
    side:        THREE.BackSide,
  })

  const geo  = new THREE.SphereGeometry(radius, 48, 32)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.raycast = () => {}   // not interactive

  return {
    mesh,
    tick:    (dt) => { timeUniform.value += dt },
    dispose: ()   => { geo.dispose(); mat.dispose() },
  }
}

// ── Star smooth mesh ──────────────────────────────────────────────
// Indexed sphere (like rocky) as overview display — animated star shader baked
// with per-vertex granulation colors derived from the star palette + elevation.
// Switches to buildInteractiveMesh hex tiles only when the camera focuses the star.

/**
 * Builds an animated star-surface sphere using the lib BodyMaterial.
 * Vertex colors encode the granulation pattern (sunspot / bright plage)
 * sampled via sim.elevationAt so each star looks unique.
 */
export function buildStarSmoothMesh(
  sim:        BodySimulation,
  levels:     TerrainLevel[],
  variation?: BodyVariation,
): { mesh: THREE.Mesh; tick: (dt: number) => void; planetMaterial: InstanceType<typeof BodyMaterial> } {
  const { config, elevationAt } = sim
  const noiseScale = config.noiseScale ?? 1.4
  const segs       = Math.max(24, Math.min(
    Math.round(noiseScale * 48),
    Math.round(Math.sqrt(sim.tiles.length) * 3.5),
  ))
  const geo        = new THREE.SphereGeometry(config.radius, segs, Math.round(segs / 2))
  const pos        = geo.getAttribute('position') as THREE.BufferAttribute
  const col        = new Float32Array(pos.count * 3)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n     = elevationAt(x, y, z)
    const level = getTileLevel(n, levels)
    // Bake emissive luminance into vertex color so the granulation pattern
    // is visible even before the shader adds its own glow.
    const ei = level.emissiveIntensity ?? 0
    col[i * 3]     = addEmissive(level.color.r, level.emissive?.r, ei)
    col[i * 3 + 1] = addEmissive(level.color.g, level.emissive?.g, ei)
    col[i * 3 + 2] = addEmissive(level.color.b, level.emissive?.b, ei)
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  const params    = configToLibParams(config, variation)
  const planetMat = new BodyMaterial('star', params, { vertexColors: true })
  const mesh      = new THREE.Mesh(geo, planetMat.material)
  let elapsed     = 0
  const tick      = (dt: number) => { elapsed += dt; planetMat.tick(elapsed) }
  return { mesh, tick, planetMaterial: planetMat }
}

// ── Gas smooth mesh ───────────────────────────────────────────────

/**
 * Builds an animated gas-atmosphere sphere using the lib BodyMaterial.
 * Vertex colors from the atmospheric palette are baked into the geometry
 * so each gas planet has a unique base tint driven by its simulation tiles.
 */
export function buildGasSmoothMesh(
  sim:          BodySimulation,
  libGasParams: ParamMap,
  levels:       TerrainLevel[],
  lightKelvin?: number,
): { mesh: THREE.Mesh; tick: (dt: number) => void; planetMaterial: InstanceType<typeof BodyMaterial> } {
  const { config, elevationAt } = sim
  const segs        = Math.max(24, Math.min(
    Math.round((config.noiseScale ?? 1.4) * 48),
    Math.round(Math.sqrt(sim.tiles.length) * 3.5),
  ))
  const geo         = new THREE.SphereGeometry(config.radius, segs, Math.round(segs / 2))
  const pos         = geo.getAttribute('position') as THREE.BufferAttribute
  const col         = new Float32Array(pos.count * 3)
  const nearestTile = buildNearestTileFn(sim)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n     = elevationAt(x, y, z)
    const level = getTileLevel(n, levels)
    const state = nearestTile(x, y, z)
    // Gas planets: blend palette color with atmospheric resource tint
    const vis = state
      ? applyResourceBlend(
          level.color, level.roughness ?? 0.7, level.metalness ?? 0.0,
          level.emissive, level.emissiveIntensity ?? 0, state.biome, sim.resourceMap.get(state.tileId) ?? new Map(),
        )
      : { r: level.color.r, g: level.color.g, b: level.color.b }
    col[i * 3] = vis.r; col[i * 3 + 1] = vis.g; col[i * 3 + 2] = vis.b
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  const planetMat = new BodyMaterial('gas', libGasParams, { lightKelvin: lightKelvin ?? 5778, vertexColors: true })
  const mesh      = new THREE.Mesh(geo, planetMat.material)
  mesh.renderOrder = 1
  let elapsed     = 0
  const tick      = (dt: number) => { elapsed += dt; planetMat.tick(elapsed) }
  return { mesh, tick, planetMaterial: planetMat }
}

// ── Smooth sphere (non-interactive overview) ──────────────────────
// Vertices colored using sim.noise3D — same seed + scale as tile elevations.
// Resource colors are approximated by snapping each vertex to its nearest tile
// via dot product on the unit sphere.
//
// Spatial bucketing reduces O(T) → O(k) per query where k ≈ 36 for 642 tiles.
// Grid: 18 azimuth × 9 polar cells (20° per cell).
// 3×3 neighbour window guarantees correctness since max inter-tile angle ≈ 9°.
// Pole rows (col 0 / GRID_POL-1) expand to all azimuths to avoid wrap-around misses.

const GRID_AZI = 18 // 360° / 18 = 20° per cell
const GRID_POL = 9  // 180° / 9  = 20° per cell

function tileAziCell(nz: number, nx: number): number {
  return Math.floor(((Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5) * GRID_AZI) % GRID_AZI
}

function tilePolCell(ny: number): number {
  return Math.min(GRID_POL - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI) * GRID_POL))
}

/**
 * Returns a function that maps any world-space point to the nearest TileState.
 * Uses a spherical azimuth×polar grid for O(k) queries (k ≈ 36 at subdivision 2,
 * vs brute-force O(T) = 642). Scales to higher subdivisions without code changes.
 */
function buildNearestTileFn(sim: BodySimulation) {
  const count = sim.tiles.length
  // Flat typed arrays for cache-friendly dot product
  const nxArr = new Float32Array(count)
  const nyArr = new Float32Array(count)
  const nzArr = new Float32Array(count)
  const idArr = new Int32Array(count)
  const cells: number[][] = Array.from({ length: GRID_AZI * GRID_POL }, () => [])

  sim.tiles.forEach((tile, i) => {
    const { x, y, z } = tile.centerPoint
    const len = Math.sqrt(x * x + y * y + z * z)
    nxArr[i] = x / len
    nyArr[i] = y / len
    nzArr[i] = z / len
    idArr[i] = tile.id
    cells[tilePolCell(nyArr[i]) * GRID_AZI + tileAziCell(nzArr[i], nxArr[i])].push(i)
  })

  return (x: number, y: number, z: number) => {
    const len = Math.sqrt(x * x + y * y + z * z)
    const qnx = x / len, qny = y / len, qnz = z / len
    const qAzi = tileAziCell(qnz, qnx)
    const qPol = tilePolCell(qny)

    let bestDot = -Infinity
    let bestIdx = 0

    for (let dp = -1; dp <= 1; dp++) {
      const p = qPol + dp
      if (p < 0 || p >= GRID_POL) continue
      // Polar rows wrap fully in azimuth — check all cells in that ring
      const isPolar  = p === 0 || p === GRID_POL - 1
      const aziCount = isPolar ? GRID_AZI : 3
      const aziStart = isPolar ? 0 : qAzi - 1
      for (let da = 0; da < aziCount; da++) {
        const a = ((aziStart + da) + GRID_AZI) % GRID_AZI
        for (const i of cells[p * GRID_AZI + a]) {
          const dot = qnx * nxArr[i] + qny * nyArr[i] + qnz * nzArr[i]
          if (dot > bestDot) { bestDot = dot; bestIdx = i }
        }
      }
    }

    return sim.tileStates.get(idArr[bestIdx])
  }
}

export function buildSmoothSphereMesh(
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  variation?: BodyVariation,
): { mesh: THREE.Mesh; planetMaterial: InstanceType<typeof BodyMaterial> } {
  const { config, elevationAt } = sim
  const noiseScale  = config.noiseScale ?? 1.4
  // Segs scales with tile count so the smooth sphere never exceeds the hex mesh
  // in polygon count: small planets use fewer segments, large ones up to the noise limit.
  const segs        = Math.max(24, Math.min(
    Math.round(noiseScale * 52),
    Math.round(Math.sqrt(sim.tiles.length) * 3.5),
  ))
  const geo         = new THREE.SphereGeometry(config.radius, segs, Math.round(segs / 2))
  const pos         = geo.getAttribute('position') as THREE.BufferAttribute
  const col         = new Float32Array(pos.count * 3)
  const nearestTile = buildNearestTileFn(sim)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n     = elevationAt(x, y, z)
    const level = getTileLevel(n, levels)
    const state = nearestTile(x, y, z)
    const ei  = level.emissiveIntensity ?? 0
    const vis = state
      ? applyResourceBlend(
          level.color, level.roughness ?? 0.85, level.metalness ?? 0.0,
          level.emissive, ei, state.biome, sim.resourceMap.get(state.tileId) ?? new Map(),
        )
      : {
          r: addEmissive(level.color.r, level.emissive?.r, ei),
          g: addEmissive(level.color.g, level.emissive?.g, ei),
          b: addEmissive(level.color.b, level.emissive?.b, ei),
        }
    col[i * 3] = vis.r; col[i * 3 + 1] = vis.g; col[i * 3 + 2] = vis.b
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  const libType   = bodyTypeToLibType(config.type)
  const params    = configToLibParams(config, variation)

  // Ocean mask — replicates the CPU simplex3D elevation in GLSL so crack/lava
  // effects match the tile-level ocean boundary exactly. Only enabled on
  // rocky bodies that actually have surface water.
  const useOceanMask = libType === 'rocky' && sim.seaLevelElevation > -1
  const ocean = useOceanMask
    ? {
        permTexture: permTableToTexture(buildPermTable(config.name)),
        seaLevel:    sim.seaLevelElevation,
        noiseScale:  config.noiseScale ?? 1.4,
        radius:      config.radius,
      }
    : undefined

  const planetMat = new BodyMaterial(libType, params, { vertexColors: true, ocean })
  return { mesh: new THREE.Mesh(geo, planetMat.material), planetMaterial: planetMat }
}

// ── Interactive mesh (focused planet) ────────────────────────────
// Single merged hex mesh (1 draw call) + 2 hover overlay meshes:
//   - fill  : additive semi-transparent fan covering the tile top face
//   - border: thin quad-strip along the tile boundary perimeter
// All visual parameters are driven by HoverConfig (see config/render.ts).

/**
 * Computes the expanded top-face ring for a hovered tile.
 * The ring is slightly lifted above the tile surface (surfaceOffset)
 * and expanded outward (ringExpand) so it visually frames the tile.
 * Exported for unit testing.
 */
export function buildTileRing(
  tile:          Tile,
  height:        number,
  surfaceOffset: number,
  ringExpand:    number,
): { center: THREE.Vector3; ring: THREE.Vector3[]; avgRadius: number } {
  const { centerPoint, boundary } = tile
  const len    = Math.sqrt(centerPoint.x ** 2 + centerPoint.y ** 2 + centerPoint.z ** 2)
  const scale  = (len + height) / len + surfaceOffset
  const center = v(centerPoint.x * scale, centerPoint.y * scale, centerPoint.z * scale)

  const baseCenter = v(centerPoint.x, centerPoint.y, centerPoint.z)
  const avgRadius  = boundary.reduce(
    (sum, p) => sum + v(p.x, p.y, p.z).distanceTo(baseCenter), 0,
  ) / boundary.length
  const expand = avgRadius * ringExpand

  const ring = boundary.map(p => {
    const bp  = v(p.x * scale, p.y * scale, p.z * scale)
    const dir = bp.clone().sub(center).normalize()
    return bp.addScaledVector(dir, expand)
  })

  return { center, ring, avgRadius }
}

/**
 * Builds the fill fan geometry: triangles from center to each boundary edge.
 * Used with additive blending for a soft glow overlay on the tile top face.
 * Exported for unit testing.
 */
export function buildFillPositions(center: THREE.Vector3, ring: THREE.Vector3[]): Float32Array {
  const out: number[] = []
  for (let i = 0; i < ring.length; i++) {
    pushVec(out, center)
    pushVec(out, ring[i])
    pushVec(out, ring[(i + 1) % ring.length])
  }
  return new Float32Array(out)
}

/**
 * Builds the border quad-strip geometry: a thin perimeter band inset from
 * the outer ring toward the tile center by `borderWidth` fraction of avgRadius.
 * Each edge becomes two triangles (one quad).
 * Exported for unit testing.
 */
export function buildBorderPositions(
  center:      THREE.Vector3,
  ring:        THREE.Vector3[],
  avgRadius:   number,
  borderWidth: number,
): Float32Array {
  const borderSize = avgRadius * borderWidth
  const n          = ring.length

  // Each outer vertex is pulled inward by borderSize to form the inner ring
  const innerRing = ring.map(op => {
    const toCenter = center.clone().sub(op).normalize()
    return op.clone().addScaledVector(toCenter, borderSize)
  })

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = ring[i],      b = ring[(i + 1) % n]
    const c = innerRing[(i + 1) % n], d = innerRing[i]
    pushVec(out, a); pushVec(out, b); pushVec(out, c)
    pushVec(out, a); pushVec(out, c); pushVec(out, d)
  }
  return new Float32Array(out)
}

/**
 * Builds a vertical quad-strip running along the outside wall of the tile
 * from the top edge down to `depthWorld` below (in world units). Produces
 * one quad per boundary edge, so the strip wraps all 6 wall faces of the
 * hex prism. Exported for testing.
 *
 * Used to continue the top-face border over the hex walls so the outline
 * stays visible when the tile is viewed from a grazing angle.
 */
export function buildSideBorderPositions(
  tile:          Tile,
  height:        number,
  surfaceOffset: number,
  depthWorld:    number,
): Float32Array {
  const { boundary } = tile
  const depth = depthWorld
  const n     = boundary.length

  const topRing: THREE.Vector3[] = []
  const lowRing: THREE.Vector3[] = []
  for (const p of boundary) {
    const len      = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    const topScale = (len + height) / len + surfaceOffset
    const lowScale = topScale - depth / len
    topRing.push(v(p.x * topScale, p.y * topScale, p.z * topScale))
    lowRing.push(v(p.x * lowScale, p.y * lowScale, p.z * lowScale))
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = topRing[i],      b = topRing[(i + 1) % n]
    const c = lowRing[(i + 1) % n], d = lowRing[i]
    pushVec(out, a); pushVec(out, b); pushVec(out, c)
    pushVec(out, a); pushVec(out, c); pushVec(out, d)
  }
  return new Float32Array(out)
}

/**
 * Creates the border overlay material for the hovered tile.
 * Additive blending with high brightness seeds the bloom / hover rays pass.
 */
function makeBorderMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     1.0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    depthTest:   false,
    side:        THREE.DoubleSide,
  })
}

// ── Ocean layer ────────────────────────────────────────────────────

/** Smooth sphere rendered at the planet radius to represent the liquid surface. */
interface OceanLayer {
  mesh:    THREE.Mesh
  dispose: () => void
}

/**
 * Builds a smooth ocean sphere whose surface sits at the planet's sphere
 * radius. Used in hex-mode rendering so oceans appear as a continuous body
 * rather than a tiled hex grid — adjacent ocean tiles would otherwise z-fight
 * via coplanar side walls, and the shoreline would expose a vertical gap
 * between the sunken ocean tops and the land tile bases.
 *
 * Hosts the water shader (wave bump-mapping, animated colour drift, fresnel +
 * sun-glint + caustic specular highlights). Unlike the hex-shader variant the
 * effects are applied unconditionally — the whole sphere IS the ocean, so no
 * per-fragment `vOcean` gate is needed.
 *
 * @param sim         - Body simulation (used for the target radius only).
 * @param levels      - Palette — sea-level tile colour + material are read here.
 * @param timeUniform - Shared time uniform (same instance as the hex shader) so
 *                      ocean waves stay in sync with the rest of the surface.
 * @returns Mesh + dispose wrapper.
 */
function buildOceanLayer(
  sim:         BodySimulation,
  levels:      TerrainLevel[],
  timeUniform: { value: number },
): OceanLayer {
  // Deep-sea palette entry — always the first band when a liquid surface
  // exists (see generateTerrainPalette). Reading via getTileLevel would fall
  // through to the shore level because `seaLevelElevation === levels[0].threshold`
  // and the comparison is strict (`elevation < threshold`).
  const seaLevel = levels[0]
  // Sit a hair below the land tile bases (r). Touching the bases exactly
  // would z-fight with the land wall bottoms along the shoreline; the tiny
  // inset is invisible and covered by the wave bump anyway.
  const oceanRadius = sim.config.radius * 0.999
  const geo = new THREE.SphereGeometry(oceanRadius, 96, 48)
  // Emissive baseline — ensures the water reads as its palette colour even on
  // the planet's night side / in shadow. Without it the lit-only diffuse model
  // would collapse to black wherever the sun isn't facing the fragment.
  const emissive = seaLevel.color.clone().multiplyScalar(0.55)
  const mat = new THREE.MeshStandardMaterial({
    color:             seaLevel.color.clone(),
    roughness:         seaLevel.roughness ?? 0.38,
    metalness:         seaLevel.metalness ?? 0.12,
    emissive,
    emissiveIntensity: 1.0,
    side:              THREE.FrontSide,
    transparent:       true,
    // Initial opacity — the real runtime value comes from the uOceanOpacity
    // uniform (wired below) so playground sliders can tune it live.
    opacity:           hexGraphicsUniforms.uOceanOpacity.value,
    // depthWrite stays enabled: the water surface occludes everything behind
    // it (sea floor on the far side of the planet, stars beyond). Without it
    // the transparent sphere lets the background leak through the planet.
    depthWrite:        true,
  })

  mat.customProgramCacheKey = () => 'ocean_sphere_water'
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\nvarying vec3 vObjectPos;\n' +
      shader.vertexShader

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      'vWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vObjectPos   = transformed;',
    ].join('\n'))

    shader.fragmentShader =
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\nvarying vec3 vObjectPos;\n' +
      'uniform float uTime;\n' +
      'uniform float uWaterEnabled;\n' +
      'uniform float uWaveStrength;\n' +
      'uniform float uWaveSpeed;\n' +
      'uniform float uSpecularIntensity;\n' +
      'uniform float uDepthDarken;\n' +
      'uniform float uOceanOpacity;\n' +
      'uniform float uOceanVisible;\n' +
      WATER_NOISE_GLSL +
      'vec3  _cachedWaveNormal = vec3(0.0);\n' +
      'float _cachedWaveH     = 0.0;\n' +
      shader.fragmentShader

    // Early discard when the water layer is hidden — exposes the sea floor.
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (uOceanVisible < 0.5) discard;\n',
    )

    // Wave bump-mapping — unconditional (whole sphere is ocean).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' +
      'if (uWaterEnabled > 0.5) {\n' +
      '  normal = _waveNormal(vObjectPos, normal, uTime * uWaveSpeed, uWaveStrength);\n' +
      '  _cachedWaveNormal = normal;\n' +
      '  _cachedWaveH      = _waveHeight(vObjectPos * 5.0, uTime * uWaveSpeed);\n' +
      '}\n',
    )

    // Animated colour drift + subtle hue shift. No depth term (the sphere is
    // flat in world-space), so the uDepthDarken uniform modulates the base
    // wave-driven luminance instead of a per-tile depth factor.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' +
      'if (uWaterEnabled > 0.5) {\n' +
      '  float _wH = _cachedWaveH;\n' +
      '  diffuseColor.rgb *= 1.0 + (_wH - 0.5) * 0.12;\n' +
      '  float _t = uTime * uWaveSpeed;\n' +
      '  float _hueNoise = _wNoise(vObjectPos * 3.0 + vec3(_t * 0.015, -_t * 0.010, _t * 0.008));\n' +
      '  vec3 _tealShift = vec3(-0.02, 0.03, 0.04);\n' +
      '  vec3 _deepShift = vec3(-0.01, -0.02, 0.01);\n' +
      '  diffuseColor.rgb += mix(_deepShift, _tealShift, _hueNoise) * 0.35;\n' +
      '  diffuseColor.rgb *= mix(1.0, 0.85, uDepthDarken);\n' +
      '}\n',
    )

    // Fresnel + sun glint + caustic highlights.
    const extra = `
{
  if (uWaterEnabled > 0.5) {
    vec3  _toSun   = normalize(-vWorldPos);
    float _ndl     = dot(vWorldNormal, _toSun);
    float _lit     = smoothstep(-0.10, 0.28, _ndl);
    vec3  _viewDir = normalize(cameraPosition - vWorldPos);
    vec3  _wN      = _cachedWaveNormal;
    float _fresnel = pow(1.0 - max(0.0, dot(_wN, _viewDir)), 5.0);
    float _sunSpec = pow(max(0.0, dot(reflect(-_toSun, _wN), _viewDir)), 80.0);
    float _caustic = _waterCaustic(vObjectPos * 6.0, uTime * uWaveSpeed);
    vec3  _waterHL = vec3(0.75, 0.88, 1.0)
      * (_fresnel * 0.08 + _sunSpec * 0.25 * _lit + _caustic * 0.03 * _lit)
      * uSpecularIntensity;
    reflectedLight.directSpecular += _waterHL;
  }
}
`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>' + extra,
    )

    // Runtime-tunable ocean opacity — overrides the material's static opacity
    // so playground sliders can change it without rebuilding the material.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.a = uOceanOpacity;\n#include <opaque_fragment>',
    )

    shader.uniforms.uTime              = timeUniform
    shader.uniforms.uWaterEnabled      = hexGraphicsUniforms.uWaterEnabled
    shader.uniforms.uWaveStrength      = hexGraphicsUniforms.uWaveStrength
    shader.uniforms.uWaveSpeed         = hexGraphicsUniforms.uWaveSpeed
    shader.uniforms.uSpecularIntensity = hexGraphicsUniforms.uSpecularIntensity
    shader.uniforms.uDepthDarken       = hexGraphicsUniforms.uDepthDarken
    shader.uniforms.uOceanOpacity      = hexGraphicsUniforms.uOceanOpacity
    shader.uniforms.uOceanVisible      = hexGraphicsUniforms.uOceanVisible
  }

  const mesh = new THREE.Mesh(geo, mat)
  // Rendered after the opaque hex surface so transparency composites
  // against the already-written land colour.
  mesh.renderOrder   = 1
  mesh.frustumCulled = false
  return {
    mesh,
    dispose: () => { geo.dispose(); mat.dispose() },
  }
}

/** Reusable Color objects for hover tinting (avoid per-frame allocations). */
const _hoverColor = new THREE.Color()
const _white      = new THREE.Color(1, 1, 1)

/**
 * Public surface returned by {@link buildInteractiveMesh}. Exposes reusable
 * primitives (tileGeometry / writeTileColor / computeTileBaseRGB /
 * onHoverChange / surfaceOffset) that any overlay renderer can consume to
 * paint tiles without knowing about the underlying mesh layout.
 */
export interface InteractiveMesh {
  group:              THREE.Group
  faceToTileId:       number[]
  /** Baseline radial offset (body-relative) applied to the interactive surface. */
  surfaceOffset:      number
  setHover:           (tileId: number | null) => void
  /**
   * Pins the given tile as the popover anchor. Unlike setHover, the pin
   * persists when the cursor leaves the tile — its world-space position is
   * projected every frame by PinnedTileProjector so the popover and marker
   * stay centered on the hex as the planet rotates.
   */
  setPinnedTile:      (tileId: number | null) => void
  setFill:            (on: boolean) => void

  // ── Primitives for external overlay renderers ──────────────────────

  /**
   * Resolves the geometry context for a tile (tile + terrain level).
   * Returns null when the id is unknown. Consumed by overlay factories
   * such as {@link createTileOverlayMesh}.
   */
  tileGeometry:       (tileId: number) => TileGeometryInfo | null
  /**
   * Writes a raw RGB value to every vertex of a tile in the merged color
   * buffer. No palette logic — callers decide the color.
   */
  writeTileColor:     (tileId: number, rgb: { r: number; g: number; b: number }) => void
  /**
   * Computes the palette base RGB for a tile given its current resource map.
   * Returns null when the tile id is unknown.
   */
  computeTileBaseRGB: (tileId: number, resources: TileResources) => { r: number; g: number; b: number } | null
  /**
   * Registers a callback fired whenever the hovered tile id changes.
   * Used by external overlays that need to repaint tiles entering or leaving
   * hover state. Returns an unsubscribe function.
   */
  onHoverChange:      (listener: HoverListener) => () => void

  /** Advances the water-shader animation clock (call each frame with elapsed seconds). */
  tick:               (elapsed: number) => void
  dispose:            () => void
}

export function buildInteractiveMesh(
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  hoverCfg?: HoverConfig,
): InteractiveMesh {
  const cfg = hoverCfg ?? DEFAULT_HOVER

  // Ocean tiles are rendered as a separate smooth sphere (see buildOceanLayer
  // below) — the hex mesh omits their prisms so the shore has no vertical
  // gap and adjacent ocean tiles don't z-fight via coplanar side walls.
  const surfaceLiquid = hasLiquidSurface(sim.config)
  const { geometry, faceToTileId, tileVertexRange } = buildMergedGeometry(
    sim, levels, { excludeOceanVisual: surfaceLiquid },
  )

  const selfLit     = levels.some(l => (l.emissiveIntensity ?? 0) > 0)
  const fillUniform = { value: 0.0 }

  const timeUniform = { value: 0.0 }

  let hexMat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  if (selfLit) {
    hexMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  } else {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })
    applyHexShader(m, fillUniform, timeUniform, sim.config.type === 'metallic' ? 1.0 : 0.0)
    hexMat = m
  }
  const hexMesh = new THREE.Mesh(geometry, hexMat)
  hexMesh.renderOrder = 0
  // Disable frustum culling on the planet surface mesh.
  // In hex mode the camera orbits close to the sphere and the bounding
  // sphere can graze the frustum edges — floating-point precision in the
  // containment test then oscillates between culled/visible, causing
  // single-frame black flashes ("voile noir") at specific camera angles.
  hexMesh.frustumCulled = false

  // Border overlay — thin bright contour that seeds hover rays via bloom
  const borderGeo = new THREE.BufferGeometry()
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3))
  const borderMat  = makeBorderMaterial()
  const borderMesh = new THREE.Mesh(borderGeo, borderMat)
  borderMesh.renderOrder = 1
  borderMesh.visible     = false

  const group = new THREE.Group()
  group.add(hexMesh)
  group.add(borderMesh)

  // Ocean layer — smooth sphere at the planet radius. Only mounted when the
  // surface is liquid. Its top matches the land tile bases (r), eliminating
  // the shore gap without needing per-tile walls on sunken ocean tiles.
  const oceanLayer = surfaceLiquid ? buildOceanLayer(sim, levels, timeUniform) : null
  if (oceanLayer) group.add(oceanLayer.mesh)

  const tileById = new Map<number, Tile>()
  for (const tile of sim.tiles) tileById.set(tile.id, tile)

  const tileLevel = new Map<number, TerrainLevel>()
  for (const tile of sim.tiles) {
    const state = sim.tileStates.get(tile.id)!
    tileLevel.set(tile.id, getTileLevel(state.elevation, levels))
  }

  let currentHoverId: number | null = null

  /** Callbacks fired when the hovered tile id changes. */
  const hoverListeners = new Set<HoverListener>()

  /** Tile geometry lookup exposed as a public primitive. */
  function tileGeometry(tileId: number): TileGeometryInfo | null {
    const tile  = tileById.get(tileId)
    const level = tileLevel.get(tileId)
    if (!tile || !level) return null
    return { tile, level }
  }

  /** Registers a hover listener and returns an unsubscribe function. */
  function onHoverChange(listener: HoverListener): () => void {
    hoverListeners.add(listener)
    return () => { hoverListeners.delete(listener) }
  }

  /**
   * Border width as a fraction of the tile's average boundary radius.
   * Tuned to produce a ~3-4 px visible stroke at typical zoom levels.
   */
  const BORDER_WIDTH = 0.15

  function setHover(tileId: number | null) {
    if (tileId === currentHoverId) return
    currentHoverId = tileId

    // Notify external overlay renderers of the hover change so they can
    // repaint tiles entering/leaving hover state.
    for (const cb of hoverListeners) cb(tileId)

    if (tileId === null) {
      borderMesh.visible      = false
      hoverLocalPos.value     = null
      hoverParentGroup.value  = null
      return
    }

    const tile  = tileById.get(tileId)
    const level = tileLevel.get(tileId)
    if (!tile || !level) {
      borderMesh.visible      = false
      hoverLocalPos.value     = null
      hoverParentGroup.value  = null
      return
    }

    // ringExpand = 0 so the border sits flush on the tile edge, not outside it
    const { center, ring, avgRadius } = buildTileRing(
      tile, level.height, cfg.surfaceOffset, 0,
    )

    // ── Border overlay (thin bright contour → seeds bloom + hover rays) ──
    const borderPos = buildBorderPositions(center, ring, avgRadius, BORDER_WIDTH)
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3))
    borderGeo.attributes.position.needsUpdate = true
    borderGeo.computeBoundingSphere()
    borderMesh.visible = true

    // Tint border with tile color (lerped toward white, boosted for HDR bloom)
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const range     = tileVertexRange.get(tileId)!
    _hoverColor.set(
      colorAttr.getX(range.start),
      colorAttr.getY(range.start),
      colorAttr.getZ(range.start),
    )
    _hoverColor.lerp(_white, 0.5).multiplyScalar(3.0)
    borderMat.color.copy(_hoverColor)

    // Publish hover position for TileCenterProjector
    hoverLocalPos.value    = center.clone()
    hoverParentGroup.value = group
  }

  /**
   * Pins a tile for the popover anchor. Writes pinLocalPos / pinParentGroup
   * so PinnedTileProjector keeps projecting the tile center every frame,
   * independently of hover state. Pass null to clear.
   */
  function setPinnedTile(tileId: number | null) {
    if (tileId === null) {
      pinLocalPos.value    = null
      pinParentGroup.value = null
      return
    }
    const tile  = tileById.get(tileId)
    const level = tileLevel.get(tileId)
    if (!tile || !level) {
      pinLocalPos.value    = null
      pinParentGroup.value = null
      return
    }
    const { center } = buildTileRing(tile, level.height, cfg.surfaceOffset, 0)
    pinLocalPos.value    = center.clone()
    pinParentGroup.value = group
  }

  function setFill(on: boolean) {
    fillUniform.value = on ? 0.35 : 0.0
  }

  /** Base (overlay-free) RGB for a tile given its current resources. */
  function computeTileBaseRGB(tileId: number, resources: TileResources): { r: number; g: number; b: number } | null {
    const state = sim.tileStates.get(tileId)
    const level = tileLevel.get(tileId)
    if (!state || !level) return null

    const vis = applyResourceBlend(
      level.color,
      level.roughness ?? 0.85,
      level.metalness ?? 0.0,
      level.emissive,
      level.emissiveIntensity ?? 0,
      state.biome,
      resources,
    )
    return { r: vis.r, g: vis.g, b: vis.b }
  }

  /** Writes an RGB value to every vertex of a tile in the merged color buffer. */
  function writeTileColor(tileId: number, rgb: { r: number; g: number; b: number }): void {
    const range = tileVertexRange.get(tileId)
    if (!range) return
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = range.start; i < range.start + range.count; i++) {
      colorAttr.setXYZ(i, rgb.r, rgb.g, rgb.b)
    }
    colorAttr.needsUpdate = true
  }

  function dispose() {
    // Clear hover + pin state so the post-processing pass stops rendering stale rays
    setHover(null)
    setPinnedTile(null)

    hexMesh.geometry.dispose()
    ;(hexMesh.material as THREE.Material).dispose()
    borderGeo.dispose()
    borderMat.dispose()
    oceanLayer?.dispose()
  }

  /**
   * Advances the water-shader animation clock.
   * Must be called every frame with elapsed seconds since start.
   */
  function tick(elapsed: number): void {
    timeUniform.value = elapsed
  }

  return {
    group,
    faceToTileId,
    surfaceOffset: cfg.surfaceOffset,
    setHover,
    setPinnedTile,
    setFill,
    tileGeometry,
    writeTileColor,
    computeTileBaseRGB,
    onHoverChange,
    tick,
    dispose,
  }
}
