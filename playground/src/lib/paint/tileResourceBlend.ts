import * as THREE from 'three'
import { getResourceVisual } from './resourceVisualRegistry'

/**
 * Blends the dominant resource visual onto a tile's base material colour.
 *
 * Pure function — no Three.js mesh state is touched. The returned struct is
 * splat into per-vertex / per-tile colour buffers by the caller.
 *
 * Playground-local: the lib no longer carries any resource vocabulary.
 * Callers supply a small {@link ResourceRules} object to answer the two
 * questions the blend curve needs (metallic? surface-liquid?). No bridge,
 * no SimContext, no registry coupling on the lib side.
 */

/** Per-tile resource concentrations (resourceId → 0..1), playground-local alias. */
export type TileResources = ReadonlyMap<string, number>

/**
 * Small catalogue callbacks supplied by the consumer.
 *
 *  - `isMetallic`        drives the steeper material-property blend curve
 *                        for ore-like resources.
 *  - `isSurfaceLiquid`   gates out blending on the canonical liquid resource
 *                        so the caller-chosen ocean colour stays intact.
 */
export interface ResourceRules {
  isMetallic(id: string):       boolean
  isSurfaceLiquid(id: string):  boolean
}

/** Amplifies resource color so small deposits remain visible at low concentrations. */
const COLOR_BLEND_SCALE    = 2.5
/** Metallic ores drive a steeper roughness/metalness material shift than color blending. */
const METALLIC_BLEND_SCALE = 1.6
/** Emissive resources reach peak glow intensity at half-concentration (50% deposit). */
const EMISSIVE_BLEND_SCALE = 2.0

/**
 * Returns the resource ID with the highest concentration on a tile, or
 * undefined when no resources are present.
 */
function dominantResource(resources: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined
  let bestAmt = 0
  for (const [id, amt] of resources) {
    if (amt > bestAmt) { bestAmt = amt; best = id }
  }
  return best
}

/** Adds emissive contribution to a base channel, clamped to [0, 1]. */
export function addEmissive(base: number, emissiveChannel: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissiveChannel ?? 0) * intensity)
}

/** Material-ready visual snapshot for a tile after resource blending. */
export interface TileVisual {
  r:         number
  g:         number
  b:         number
  rough:     number
  metal:     number
  emissive:  THREE.Color | undefined
  emissiveI: number
}

/**
 * Folds the dominant tile resource (if any) into the base material values.
 * Submerged tiles and surface-liquid resources pass through unchanged so the
 * caller-chosen liquid colour is never overridden by a canonical resource one.
 *
 * @param baseColor      - Untinted tile base colour.
 * @param baseRough      - Base material roughness `[0, 1]`.
 * @param baseMetal      - Base material metalness `[0, 1]`.
 * @param baseEmissive   - Optional base emissive colour (palette-driven, e.g. lava).
 * @param baseEmissiveI  - Base emissive intensity multiplier.
 * @param submerged      - Whether the tile sits below sea level.
 * @param resources      - Per-resource concentration on the tile.
 * @param rules          - Metallic / surface-liquid catalogue callbacks.
 *                          When omitted, non-liquid / non-metallic rules
 *                          apply by default (resource colour still blends).
 */
export function applyResourceBlend(
  baseColor:     THREE.Color,
  baseRough:     number,
  baseMetal:     number,
  baseEmissive:  THREE.Color | undefined,
  baseEmissiveI: number,
  submerged:     boolean,
  resources:     TileResources,
  rules?:        ResourceRules | null,
): TileVisual {
  const dominant         = dominantResource(resources)
  const dominantIsLiquid = !!dominant && !!rules?.isSurfaceLiquid(dominant)

  // Submerged tiles are fully caller-owned visually: the palette's sea bands
  // already carry `liquidColor`, so resource blending must not override it
  // (otherwise a canonical "water" resource color leaks back in and hides
  // the user-chosen liquid colour). Surface-liquid deposits on
  // land tiles are underground — no visual change. No dominant resource:
  // base colors pass through unchanged. Without rules, non-liquid rules
  // apply by default.
  if (!dominant || submerged || dominantIsLiquid) {
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

  const vis = getResourceVisual(dominant)
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
  // so the tile reads as ore/metal at full concentration. The rules callback
  // is queried for metal membership so the blend stays decoupled from any
  // concrete catalogue.
  const matT = rules?.isMetallic(dominant)
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
