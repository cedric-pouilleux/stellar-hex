/**
 * `BodyMaterial` — wrapper around a `THREE.ShaderMaterial` for procedural planets.
 *
 * Available types: `'rocky' | 'gaseous' | 'metallic' | 'star'`.
 * Zero Vue dependency — usable in any Three.js project.
 */

import * as THREE from 'three'
import { VERTEX_SHADER, FRAG_SHADERS } from './shaderSources'
import { kelvinToThreeColor } from './kelvin'
import { getDefaultParams, type LibBodyType } from './params'
import type { TerrainLevel } from '../types/terrain.types'

/**
 * Maximum number of palette entries passed to the rocky shader. Matches
 * `PALETTE_MAX` in `shaders/glsl/bodies/rocky.frag` — entries beyond this are
 * silently dropped. Sized generously so the derived band count
 * (`resolveTerrainLevelCount` — ≈ `shell / DEFAULT_TERRAIN_STEP`) always fits
 * for any playable body radius / core ratio combination.
 */
export const BODY_SHADER_PALETTE_MAX = 128

/**
 * Finite stand-in value pushed into `uPaletteThresholds` when a palette entry
 * declares `threshold: Infinity` (last band). WebGL floats cannot carry
 * `Infinity`; any value greater than the palette's native [-1..1] range works.
 */
const PALETTE_INFINITY_SENTINEL = 10.0

/**
 * Liquid-mask configuration (rocky bodies with a surface liquid shell).
 *
 * When provided, the fragment shader excludes submerged regions from
 * per-fragment effects (cracks, lava) by replicating the CPU simplex3D
 * elevation field through `uLiquidPerm` and comparing against
 * `seaLevel`. Substance-agnostic — the same mask drives water, methane,
 * nitrogen or any other caller-defined liquid.
 */
export interface LiquidMaskOptions {
  /** 512×1 `UNSIGNED_BYTE` permutation texture (see `shaders/simplexPerm.ts`). */
  permTexture: THREE.DataTexture
  /** Elevation threshold from `BodySimulation.seaLevelElevation`. */
  seaLevel:    number
  /** `config.noiseScale` — must match the CPU sampling frequency. */
  noiseScale:  number
  /** Body radius used to normalise object-space positions to the unit sphere. */
  radius:      number
}

/**
 * Constructor options for {@link BodyMaterial}. Configures the primary
 * light (kelvin + intensity + direction), ambient tint, vertex-color
 * support and an optional liquid-mask texture bundle.
 */
export interface BodyMaterialOptions {
  lightKelvin?:    number
  lightIntensity?: number
  lightDir?:       number[] | THREE.Vector3
  ambientColor?:   string   | THREE.Color
  vertexColors?:   boolean
  liquid?:         LiquidMaskOptions
  /**
   * Optional terrain palette — when set, the rocky fragment shader samples its
   * base colour from the palette (same thresholds & colours as the hex tile
   * bands) instead of the two-tone `uColorA/uColorB` gradient. Non-rocky
   * shaders ignore the palette uniforms.
   */
  palette?:        TerrainLevel[]
}

/**
 * Mutable subset of the light state accepted by `BodyMaterial.updateLight`.
 * Any field omitted leaves the current value untouched.
 */
export interface BodyLightUpdate {
  kelvin?:       number
  intensity?:    number
  direction?:    number[] | THREE.Vector3
  ambientColor?: string | THREE.Color
}

/**
 * Shader parameter value — broad enough to cover all presets across
 * rocky / gas / metallic / star bodies (scalar floats, hex colours,
 * `noiseSeed` arrays, feature toggles).
 */
export type ParamValue = number | string | number[] | boolean

/** Flat bag of shader parameters keyed by uniform name. */
export type ParamMap   = Record<string, ParamValue>

interface LightState {
  kelvin:    number
  intensity: number
  dir:       THREE.Vector3
  ambient:   THREE.Color
}

// Types whose geometry stays a smooth sphere (no vertex displacement)
const FLAT_TYPES: ReadonlySet<LibBodyType> = new Set<LibBodyType>(['gaseous', 'star'])

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts a #hex colour to a linear `THREE.Vector3(r, g, b)`. */
function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex)
  return new THREE.Vector3(c.r, c.g, c.b)
}

/** Normalises a direction to a unit `THREE.Vector3`. */
function resolveDir(dir: number[] | THREE.Vector3): THREE.Vector3 {
  return Array.isArray(dir)
    ? new THREE.Vector3(...dir).normalize()
    : dir.clone().normalize()
}

/** Normalises a colour to a `THREE.Color`. */
function resolveColor(c: string | THREE.Color): THREE.Color {
  return c instanceof THREE.Color ? c.clone() : new THREE.Color(c)
}

/**
 * Packs a `TerrainLevel[]` into fixed-size arrays suitable for the rocky
 * fragment shader uniforms. The arrays are always {@link BODY_SHADER_PALETTE_MAX}
 * long — unused slots are zero-filled. `Infinity` thresholds (typically the
 * last palette entry) are replaced by {@link PALETTE_INFINITY_SENTINEL} so the
 * shader's `smoothstep` still behaves correctly at the top end of the range.
 */
function buildPaletteUniformData(palette: TerrainLevel[] | undefined): {
  count:      number
  colors:     THREE.Vector3[]
  thresholds: Float32Array
} {
  const colors:     THREE.Vector3[] = []
  const thresholds                  = new Float32Array(BODY_SHADER_PALETTE_MAX)
  for (let i = 0; i < BODY_SHADER_PALETTE_MAX; i++) {
    colors.push(new THREE.Vector3(0, 0, 0))
  }
  if (!palette || palette.length === 0) {
    return { count: 0, colors, thresholds }
  }
  const count = Math.min(palette.length, BODY_SHADER_PALETTE_MAX)
  for (let i = 0; i < count; i++) {
    const level = palette[i]
    colors[i].set(level.color.r, level.color.g, level.color.b)
    thresholds[i] = Number.isFinite(level.threshold) ? level.threshold : PALETTE_INFINITY_SENTINEL
  }
  return { count, colors, thresholds }
}

/**
 * Converts JS params to Three.js uniforms.
 *
 * Naming convention: `camelCase` → `uCamelCase`.
 * Colours (`#hex`) are converted to `Vector3(r, g, b)`.
 * The `uHeightScale` uniform drives vertex displacement:
 *   - 0 for flat types (gas, star)
 *   - `heightScale` or `roughness` otherwise
 */
function paramsToUniforms(type: LibBodyType, params: ParamMap): Record<string, THREE.IUniform> {
  const out: Record<string, THREE.IUniform> = {}

  for (const [key, val] of Object.entries(params)) {
    const uKey = 'u' + key[0].toUpperCase() + key.slice(1)
    let value: unknown
    if (typeof val === 'string' && val.startsWith('#')) {
      value = hexToVec3(val)
    } else if (Array.isArray(val) && val.length === 3 && val.every(v => typeof v === 'number')) {
      value = new THREE.Vector3(val[0], val[1], val[2])
    } else {
      value = val
    }
    out[uKey] = { value }
  }

  if (FLAT_TYPES.has(type)) {
    out.uHeightScale = { value: 0 }
  } else {
    const height = params.heightScale ?? params.roughness ?? 0.4
    out.uHeightScale = { value: height }
  }

  return out
}

// ── Main class ────────────────────────────────────────────────────────────────

/**
 * @example
 * ```ts
 * const planet = new BodyMaterial('rocky', { roughness: 0.8, colorA: '#c87941' })
 * sphere.material = planet.material
 *
 * // Render loop
 * planet.tick(elapsed)
 *
 * // Live-update params without rebuilding
 * planet.setParams({ lavaAmount: 0.5 })
 *
 * // Switch type (rebuilds the material, keeps common params)
 * planet.setType('gaseous')
 *
 * // Light configuration
 * planet.setLight({ kelvin: 3500, intensity: 1.8, direction: [0, 1, 0.5] })
 *
 * planet.dispose()
 * ```
 */
export class BodyMaterial {
  #type:         LibBodyType
  #params:       ParamMap
  #vertexColors: boolean
  #light:        LightState
  #liquid?:      LiquidMaskOptions
  #palette?:     TerrainLevel[]
  #material:     THREE.ShaderMaterial

  constructor(type: LibBodyType, params: ParamMap = {}, options: BodyMaterialOptions = {}) {
    this.#type         = type
    this.#params       = { ...getDefaultParams(type), ...params }
    this.#vertexColors = options.vertexColors ?? false
    this.#liquid       = options.liquid
    this.#palette      = options.palette
    this.#light = {
      kelvin:    options.lightKelvin    ?? 5778,
      intensity: options.lightIntensity ?? 2.0,
      dir:       resolveDir(options.lightDir ?? [1, 0.5, 1]),
      ambient:   resolveColor(options.ambientColor ?? '#0d0d1a'),
    }
    this.#material = this.#build()
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** `THREE.ShaderMaterial` ready to assign to a `THREE.Mesh`. */
  get material(): THREE.ShaderMaterial {
    return this.#material
  }

  /** Snapshot of the current scalar/string params (excludes light config). */
  get params(): ParamMap {
    return { ...this.#params }
  }

  /** Updates time (call every frame in the render loop). */
  tick(elapsed: number): void {
    this.#material.uniforms.uTime.value = elapsed
  }

  /** Updates one or more params **without rebuilding** the material. */
  setParams(partial: ParamMap): void {
    Object.assign(this.#params, partial)
    this.#syncTypeUniforms()
  }

  /**
   * Switches the shader type. **The material is rebuilt.**
   * Params that exist in the new type are preserved; the others are reset to defaults.
   */
  setType(type: LibBodyType): void {
    const savedTime = this.#material.uniforms.uTime.value
    this.#type = type
    const defaults = getDefaultParams(type)
    this.#params = {
      ...defaults,
      ...Object.fromEntries(Object.entries(this.#params).filter(([k]) => k in defaults)),
    }
    this.#material = this.#build()
    this.#material.uniforms.uTime.value = savedTime
  }

  /** Toggles vertex-colour support. **The material is rebuilt.** */
  setVertexColors(enabled: boolean): void {
    const savedTime = this.#material.uniforms.uTime.value
    this.#vertexColors = enabled
    this.#material = this.#build()
    this.#material.uniforms.uTime.value = savedTime
  }

  /** Updates the light config. Only provided fields are changed. */
  setLight({ kelvin, intensity, direction, ambientColor }: BodyLightUpdate = {}): void {
    if (kelvin       !== undefined) this.#light.kelvin    = kelvin
    if (intensity    !== undefined) this.#light.intensity = intensity
    if (direction    !== undefined) this.#light.dir       = resolveDir(direction)
    if (ambientColor !== undefined) this.#light.ambient   = resolveColor(ambientColor)
    this.#syncLightUniforms()
  }

  /**
   * Enables / disables flat lighting (top-down view).
   * When enabled, `diff = 1` over the whole surface — removes directional gradients
   * and dark areas caused by the surface normal when seen from above.
   */
  setFlatLighting(enabled: boolean): void {
    if (this.#material.uniforms.uFlatLighting) {
      this.#material.uniforms.uFlatLighting.value = enabled ? 1.0 : 0.0
    }
  }

  /**
   * Moves the liquid-mask waterline in simplex-noise space. Silently
   * ignored when the material was built without a liquid mask (non-rocky
   * or no surface liquid). Drives the `uSeaLevel` uniform consumed by
   * `liquidMask.glsl` — cracks/lava/craters flip their submerged gating
   * as the threshold slides.
   */
  setSeaLevel(simplexThreshold: number): void {
    const u = this.#material.uniforms.uSeaLevel
    if (!u) return
    u.value = simplexThreshold
  }

  /**
   * Backdrop attenuation in `[0, 1]` driving `uViewDim` on `gas.frag`.
   * `1.0` = full-intensity (Shader view); lower values fade the disc
   * into the background (Sol view). No-op on shaders that don't consume
   * the uniform.
   */
  setViewDim(value: number): void {
    const u = this.#material.uniforms.uViewDim
    if (!u) return
    u.value = Math.max(0, Math.min(1, value))
  }

  /**
   * Replaces the terrain palette uniforms at runtime (no material rebuild).
   * Pass `null`/`undefined` to clear the palette and fall back to the legacy
   * two-tone gradient.
   */
  setPalette(palette: TerrainLevel[] | null | undefined): void {
    this.#palette = palette ?? undefined
    this.#syncPaletteUniforms()
  }

  /** Releases the material's GPU memory. */
  dispose(): void {
    this.#material.dispose()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #build(): THREE.ShaderMaterial {
    const defines: Record<string, string | number | boolean> = {}
    if (this.#liquid) defines.USE_LIQUID_MASK = ''
    return new THREE.ShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAG_SHADERS[this.#type],
      uniforms:       this.#buildUniforms(),
      defines,
      vertexColors:   this.#vertexColors,
      side:           THREE.FrontSide,
    })
  }

  #buildUniforms(): Record<string, THREE.IUniform> {
    const { kelvin, intensity, dir, ambient } = this.#light
    const { r, g, b } = kelvinToThreeColor(kelvin)
    const uniforms: Record<string, THREE.IUniform> = {
      uTime:           { value: 0 },
      uLightColor:     { value: new THREE.Color(r, g, b) },
      uLightDir:       { value: dir.clone() },
      uLightIntensity: { value: intensity },
      uAmbientColor:   { value: ambient.clone() },
      uFlatLighting:   { value: 0.0 },
      // Read by `gas.frag` only; declared on every type for a uniform
      // bag layout. Other shaders silently ignore it.
      uViewDim:        { value: 1.0 },
      // Declared by `body.vert` for every type so the vertex displacement
      // can pick the planet's archetype. Overridden below when the type's
      // params expose `terrainArchetype` (rocky, metallic).
      uTerrainArchetype: { value: 0 },
      ...paramsToUniforms(this.#type, this.#params),
    }
    if (this.#liquid) {
      uniforms.uLiquidPerm       = { value: this.#liquid.permTexture }
      uniforms.uSeaLevel         = { value: this.#liquid.seaLevel }
      uniforms.uLiquidNoiseScale = { value: this.#liquid.noiseScale }
      uniforms.uLiquidRadius     = { value: this.#liquid.radius }
    }
    // Palette uniforms — always allocated (fixed-size arrays are required by
    // GLSL) and zero-filled when no palette is provided. `uPaletteCount` at 0
    // tells the shader to fall back to the legacy gradient.
    const { count, colors, thresholds } = buildPaletteUniformData(this.#palette)
    uniforms.uPaletteCount      = { value: count }
    uniforms.uPaletteColors     = { value: colors }
    uniforms.uPaletteThresholds = { value: thresholds }
    return uniforms
  }

  /** Pushes the current palette into existing uniforms (no reallocation). */
  #syncPaletteUniforms(): void {
    const u = this.#material.uniforms
    if (!u.uPaletteCount) return
    const { count, colors, thresholds } = buildPaletteUniformData(this.#palette)
    u.uPaletteCount.value = count
    // Copy into the existing Vector3 slots so Three.js does not reallocate
    // the uniform array on the GPU — identical pattern to `#syncTypeUniforms`.
    const curColors = u.uPaletteColors.value as THREE.Vector3[]
    for (let i = 0; i < BODY_SHADER_PALETTE_MAX; i++) curColors[i].copy(colors[i])
    u.uPaletteThresholds.value = thresholds
  }

  /** Pushes current params into existing uniforms (no reallocation). */
  #syncTypeUniforms(): void {
    const u    = this.#material.uniforms
    const unis = paramsToUniforms(this.#type, this.#params)
    for (const [key, uni] of Object.entries(unis)) {
      if (!u[key]) continue
      const cur = u[key].value
      // Vector3 (colours) : copy() avoids a reallocation
      if (cur instanceof THREE.Vector3 && uni.value instanceof THREE.Vector3) {
        cur.copy(uni.value)
      } else {
        u[key].value = uni.value
      }
    }
  }

  /** Pushes the current light config into existing uniforms. */
  #syncLightUniforms(): void {
    const u = this.#material.uniforms
    const { kelvin, intensity, dir, ambient } = this.#light
    const { r, g, b } = kelvinToThreeColor(kelvin)
    u.uLightColor.value.setRGB(r, g, b)
    u.uLightIntensity.value = intensity
    u.uLightDir.value.copy(dir)
    u.uAmbientColor.value.copy(ambient)
  }
}
