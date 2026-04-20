/**
 * `BodyMaterial` — wrapper around a `THREE.ShaderMaterial` for procedural planets.
 *
 * Available types: `'rocky' | 'gas' | 'metallic' | 'star'`.
 * Zero Vue dependency — usable in any Three.js project.
 */

import * as THREE from 'three'
import { VERTEX_SHADER, FRAG_SHADERS } from './shaderSources'
import { kelvinToThreeColor } from './kelvin'
import { getDefaultParams, type LibBodyType } from './params'

/**
 * Ocean-mask configuration (rocky bodies with surface water).
 *
 * When provided, the fragment shader excludes ocean regions from per-fragment
 * effects (cracks, lava) by replicating the CPU simplex3D elevation field
 * through `uOceanPerm` and comparing against `seaLevel`.
 */
export interface OceanMaskOptions {
  /** 512×1 `UNSIGNED_BYTE` permutation texture (see `core/oceanMask.ts`). */
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
 * support and an optional ocean mask texture bundle.
 */
export interface BodyMaterialOptions {
  lightKelvin?:    number
  lightIntensity?: number
  lightDir?:       number[] | THREE.Vector3
  ambientColor?:   string   | THREE.Color
  vertexColors?:   boolean
  ocean?:          OceanMaskOptions
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
const FLAT_TYPES: ReadonlySet<LibBodyType> = new Set<LibBodyType>(['gas', 'star'])

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
 * planet.setType('gas')
 *
 * // Light configuration
 * planet.setLight({ kelvin: 3500, intensity: 1.8, direction: [0, 1, 0.5] })
 *
 * planet.dispose()
 */
export class BodyMaterial {
  private _type:         LibBodyType
  private _params:       ParamMap
  private _vertexColors: boolean
  private _light:        LightState
  private _ocean?:       OceanMaskOptions
  private _material:     THREE.ShaderMaterial

  constructor(type: LibBodyType, params: ParamMap = {}, options: BodyMaterialOptions = {}) {
    this._type         = type
    this._params       = { ...getDefaultParams(type), ...params }
    this._vertexColors = options.vertexColors ?? false
    this._ocean        = options.ocean
    this._light = {
      kelvin:    options.lightKelvin    ?? 5778,
      intensity: options.lightIntensity ?? 2.0,
      dir:       resolveDir(options.lightDir ?? [1, 0.5, 1]),
      ambient:   resolveColor(options.ambientColor ?? '#0d0d1a'),
    }
    this._material = this._build()
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** `THREE.ShaderMaterial` ready to assign to a `THREE.Mesh`. */
  get material(): THREE.ShaderMaterial {
    return this._material
  }

  /** Snapshot of the current scalar/string params (excludes light config). */
  get params(): ParamMap {
    return { ...this._params }
  }

  /** Updates time (call every frame in the render loop). */
  tick(elapsed: number): void {
    this._material.uniforms.uTime.value = elapsed
  }

  /** Updates one or more params **without rebuilding** the material. */
  setParams(partial: ParamMap): void {
    Object.assign(this._params, partial)
    this._syncTypeUniforms()
  }

  /**
   * Switches the shader type. **The material is rebuilt.**
   * Params that exist in the new type are preserved; the others are reset to defaults.
   */
  setType(type: LibBodyType): void {
    const savedTime = this._material.uniforms.uTime.value
    this._type = type
    const defaults = getDefaultParams(type)
    this._params = {
      ...defaults,
      ...Object.fromEntries(Object.entries(this._params).filter(([k]) => k in defaults)),
    }
    this._material = this._build()
    this._material.uniforms.uTime.value = savedTime
  }

  /** Toggles vertex-colour support. **The material is rebuilt.** */
  setVertexColors(enabled: boolean): void {
    const savedTime = this._material.uniforms.uTime.value
    this._vertexColors = enabled
    this._material = this._build()
    this._material.uniforms.uTime.value = savedTime
  }

  /** Updates the light config. Only provided fields are changed. */
  setLight({ kelvin, intensity, direction, ambientColor }: BodyLightUpdate = {}): void {
    if (kelvin       !== undefined) this._light.kelvin    = kelvin
    if (intensity    !== undefined) this._light.intensity = intensity
    if (direction    !== undefined) this._light.dir       = resolveDir(direction)
    if (ambientColor !== undefined) this._light.ambient   = resolveColor(ambientColor)
    this._syncLightUniforms()
  }

  /**
   * Enables / disables flat lighting (top-down view).
   * When enabled, `diff = 1` over the whole surface — removes directional gradients
   * and dark areas caused by the surface normal when seen from above.
   */
  setFlatLighting(enabled: boolean): void {
    if (this._material.uniforms.uFlatLighting) {
      this._material.uniforms.uFlatLighting.value = enabled ? 1.0 : 0.0
    }
  }

  /** Releases the material's GPU memory. */
  dispose(): void {
    this._material.dispose()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _build(): THREE.ShaderMaterial {
    const defines: Record<string, string | number | boolean> = {}
    if (this._ocean) defines.USE_OCEAN_MASK = ''
    return new THREE.ShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAG_SHADERS[this._type],
      uniforms:       this._buildUniforms(),
      defines,
      vertexColors:   this._vertexColors,
      side:           THREE.FrontSide,
    })
  }

  private _buildUniforms(): Record<string, THREE.IUniform> {
    const { kelvin, intensity, dir, ambient } = this._light
    const { r, g, b } = kelvinToThreeColor(kelvin)
    const uniforms: Record<string, THREE.IUniform> = {
      uTime:           { value: 0 },
      uLightColor:     { value: new THREE.Color(r, g, b) },
      uLightDir:       { value: dir.clone() },
      uLightIntensity: { value: intensity },
      uAmbientColor:   { value: ambient.clone() },
      uFlatLighting:   { value: 0.0 },
      ...paramsToUniforms(this._type, this._params),
    }
    if (this._ocean) {
      uniforms.uOceanPerm       = { value: this._ocean.permTexture }
      uniforms.uSeaLevel        = { value: this._ocean.seaLevel }
      uniforms.uOceanNoiseScale = { value: this._ocean.noiseScale }
      uniforms.uOceanRadius     = { value: this._ocean.radius }
    }
    return uniforms
  }

  /** Pushes current params into existing uniforms (no reallocation). */
  private _syncTypeUniforms(): void {
    const u    = this._material.uniforms
    const unis = paramsToUniforms(this._type, this._params)
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
  private _syncLightUniforms(): void {
    const u = this._material.uniforms
    const { kelvin, intensity, dir, ambient } = this._light
    const { r, g, b } = kelvinToThreeColor(kelvin)
    u.uLightColor.value.setRGB(r, g, b)
    u.uLightIntensity.value = intensity
    u.uLightDir.value.copy(dir)
    u.uAmbientColor.value.copy(ambient)
  }
}
