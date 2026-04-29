import * as THREE from 'three'
import type { TerrainLevel } from '../types/terrain.types'
import type { ColorInput } from '../../types/body.types'

/**
 * Neutral 4-stop band palette used when the caller omits `bandColors` on a
 * gaseous body. Ordered dark → mid-dark → mid-light → light, matching the
 * threshold schedule hardcoded in {@link buildGasPalette}. A warm-tan set —
 * readable as "generic gas giant" without claiming a specific composition;
 * callers wire their own gas catalogues in to override this fallback.
 */
const GAS_BAND_DEFAULT: readonly [THREE.Color, THREE.Color, THREE.Color, THREE.Color] = [
  new THREE.Color(0xc08040),
  new THREE.Color(0xe8b870),
  new THREE.Color(0xf0d0a0),
  new THREE.Color(0xd4956a),
]

/**
 * Four-stop band-colour input consumed by {@link buildGasPalette}. Ordered
 * dark → mid-dark → mid-light → light, matching the threshold schedule
 * hardcoded below.
 */
export interface GasBandColors {
  colorA: ColorInput
  colorB: ColorInput
  colorC: ColorInput
  colorD: ColorInput
}

/**
 * Build a gas giant {@link TerrainLevel} palette from four band colours
 * supplied by the caller. The lib stays agnostic about the chemistry — the
 * caller computes the four stops from its own gas catalogue + body
 * composition and passes the result in. When `bands` is omitted, a neutral
 * warm-tan default is used.
 *
 * Thresholds and roughness schedule are identical to the legacy molecule-
 * specific branches so existing materials continue to band-edge correctly.
 */
export function buildGasPalette(bands?: GasBandColors): TerrainLevel[] {
  const thresholds = [-0.30, 0.10, 0.50, Infinity]
  const roughness  = [0.60,  0.50, 0.44, 0.52]
  const colors: THREE.Color[] = bands === undefined
    ? GAS_BAND_DEFAULT.map(c => c.clone())
    : [
        new THREE.Color(bands.colorA),
        new THREE.Color(bands.colorB),
        new THREE.Color(bands.colorC),
        new THREE.Color(bands.colorD),
      ]

  return thresholds.map((threshold, slot) => ({
    threshold,
    height:    0,
    color:     colors[slot],
    metalness: 0,
    roughness: roughness[slot],
  }))
}
