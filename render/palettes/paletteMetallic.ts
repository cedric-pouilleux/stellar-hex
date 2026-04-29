import * as THREE from 'three'
import type { TerrainLevel } from '../types/terrain.types'
import type { MetallicBand } from '../../types/body.types'
import { METALLIC_PLAIN_THRESH, METALLIC_PEAK_THRESH } from '../../physics/body'

/**
 * Neutral 4-band metallic palette used when the caller omits
 * {@link BodyConfig.metallicBands}. Ordered crater floor → plains →
 * highlands → peaks; greyscale so the sphere reads as a generic polished
 * metal without claiming any specific composition. Callers wire their own
 * catalogue (the playground ships a reference implementation).
 *
 * Single source of truth: this table also feeds the per-slot fallbacks
 * applied when a caller-supplied band omits a field (so a `color`-only
 * override still produces a coherent material + height schedule).
 */
const NEUTRAL_METALLIC_BANDS: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
  { color: '#1e2228', metalness: 0.62, roughness: 0.50, height: 0.000 },
  { color: '#686e76', metalness: 0.78, roughness: 0.38, height: 0.018 },
  { color: '#949ca8', metalness: 0.90, roughness: 0.22, height: 0.060 },
  { color: '#c4ccd4', metalness: 0.96, roughness: 0.14, height: 0.120 },
]

/** Shared band thresholds — four slots, last band unbounded. */
const BAND_THRESHOLDS = [METALLIC_PLAIN_THRESH, 0.55, METALLIC_PEAK_THRESH, Infinity] as const

/**
 * Build a metallic-body {@link TerrainLevel} palette from four caller-supplied
 * bands. The lib stays agnostic about the body composition — the caller
 * computes the four bands from its own catalogue and passes the result in.
 * When `bands` is omitted, the neutral grey ladder in
 * {@link NEUTRAL_METALLIC_BANDS} is used.
 *
 * Thresholds and slot count are fixed (four bands — crater floor, plains,
 * highlands, peaks). Per-band `metalness / roughness / height` are
 * optional on every input entry; omitted fields fall back to the neutral
 * ladder so a colour-only override still produces a coherent material
 * schedule. `emissive` / `emissiveIntensity` propagate as-is — useful
 * for self-lit peaks.
 *
 * @param bands - Optional four-band spec ordered deep → plain → high → peak.
 */
export function buildMetallicPalette(
  bands?: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand],
): TerrainLevel[] {
  const source = bands ?? NEUTRAL_METALLIC_BANDS
  return source.map((band, slot) => {
    const fallback = NEUTRAL_METALLIC_BANDS[slot]!
    const level: TerrainLevel = {
      threshold: BAND_THRESHOLDS[slot],
      height:    band.height    ?? fallback.height!,
      color:     new THREE.Color(band.color),
      metalness: band.metalness ?? fallback.metalness!,
      roughness: band.roughness ?? fallback.roughness!,
    }
    if (band.emissive !== undefined) {
      level.emissive          = new THREE.Color(band.emissive)
      level.emissiveIntensity = band.emissiveIntensity ?? 1.0
    }
    return level
  })
}
