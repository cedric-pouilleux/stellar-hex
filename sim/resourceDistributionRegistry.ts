import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig } from '../types/body.types'
import type { BiomeType, BodyType } from '../types/surface.types'
import type { TileResources } from './TileState'

/**
 * Callback used by `initBodySimulation` to produce per-tile resource concentrations.
 * Body never imports the concrete distributor — the resources feature (or any
 * other provider) registers one at app startup via `registerResourceDistributor`.
 *
 * When no distributor is registered, sims expose an empty `resourceMap` — body
 * remains fully functional (rendering, terrain, biomes) without the resources feature.
 */
export type ResourceDistributor = (input: {
  tiles:         readonly Tile[]
  biomeMap:      ReadonlyMap<number, BiomeType>
  config:        BodyConfig
  liquidCoverage: number
  surfaceLiquid:  string | undefined
}) => ReadonlyMap<number, TileResources>

/**
 * Render-time bridge to the resources feature. Body's rendering pipeline queries
 * this bridge for palette derivation and material classification without
 * importing the resources feature directly. When no bridge is registered, body
 * falls back to neutral defaults (grey palette, non-metallic blending).
 */
export interface BodyResourceBridge {
  /**
   * Returns the {id, color} pairs of resources compatible with the given body
   * conditions. Used by `rockyColors` to derive surface palette from available
   * ores. Colors are 0xRRGGBB hex integers.
   *
   * When `solidSurfaceOnly` is true, the consumer must omit resources that do
   * not form solid surface deposits (typically liquids and organics) so the
   * caller receives only mineral-like entries suitable for a surface palette.
   */
  getCompatibleResourceColors(opts: {
    bodyType:          BodyType
    tempMin?:          number
    tempMax?:          number
    atmo?:             number
    solidSurfaceOnly?: boolean
  }): Array<{ id: string; color: number }>
  /** True if the given resource ID belongs to the metallic category. Drives material blend curves. */
  isMetallic(id: string): boolean
  /**
   * True if the given resource ID represents a surface-liquid deposit — i.e.
   * the resource whose concentration fills ocean tiles (water, liquid ammonia,
   * liquid methane, liquid nitrogen). Drives ocean/non-ocean blend rules in
   * the mesh shader without hardcoding any resource-id vocabulary in body.
   */
  isSurfaceLiquidResource(id: string): boolean
  /** Returns label + color for UI display, or undefined for unknown IDs. */
  getResourceDisplay(id: string): { label: string; color: number } | undefined
  /** Returns the display label for a biome ID. */
  getBiomeLabel(biome: BiomeType): string
}

let _distributor: ResourceDistributor | null = null
let _bridge: BodyResourceBridge | null = null

/**
 * Registers the resource distribution callback used by every `initBodySimulation`
 * call that doesn't pass an explicit override. The app entry point typically
 * registers the resources feature's `distributeResources` here.
 */
export function registerResourceDistributor(fn: ResourceDistributor | null): void {
  _distributor = fn
}

/** Returns the currently registered distributor, or null if none is installed. */
export function getResourceDistributor(): ResourceDistributor | null {
  return _distributor
}

/**
 * Registers the render-time bridge used by body's color derivation. Pass `null`
 * to clear. When no bridge is installed, rocky planets fall back to neutral grey
 * colors and metallic blending is disabled.
 */
export function registerBodyResourceBridge(bridge: BodyResourceBridge | null): void {
  _bridge = bridge
}

/** Returns the currently registered render-time bridge, or null if none is installed. */
export function getBodyResourceBridge(): BodyResourceBridge | null {
  return _bridge
}
