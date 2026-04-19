import * as THREE from 'three'
import type { TerrainLevel } from '../types/body.types'
import type { BodyConfig } from '../types/body.types'
import { GAS_TILE_ARCH } from './colorAnchors'

/**
 * Build a gas giant TerrainLevel palette from atmospheric composition.
 * Continuous weighted blending of molecule archetypes — every composition
 * mix yields a unique base color rather than a hard preset bucket.
 *
 * @param composition  Atmospheric molecule fractions
 * @param T_eq         Equilibrium temperature (K)
 */
export function buildGasPalette(
  composition?: BodyConfig['gasComposition'],
  T_eq?: number,
): TerrainLevel[] {
  const temp = T_eq ?? 250

  if (temp > 700) {
    return GAS_TILE_ARCH.hot.map((rgb, i) => ({
      threshold: [-0.30, 0.10, 0.50, Infinity][i],
      height: 0,
      color: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255),
      metalness: 0,
      roughness: [0.65, 0.55, 0.45, 0.40][i],
    }))
  }

  const comp = composition ?? { H2He: 1, CH4: 0, NH3: 0, H2O: 0, sulfur: 0 }

  if (comp.H2He < 0.25) {
    return GAS_TILE_ARCH.sulfur.map((rgb, i) => ({
      threshold: [-0.30, 0.10, 0.50, Infinity][i],
      height: 0,
      color: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255),
      metalness: 0,
      roughness: [0.70, 0.62, 0.55, 0.50][i],
    }))
  }

  const weights: [string, number][] = [
    ['H2He',   comp.H2He   ?? 0],
    ['CH4',    comp.CH4    ?? 0],
    ['NH3',    comp.NH3    ?? 0],
    ['H2O',    comp.H2O    ?? 0],
    ['sulfur', comp.sulfur ?? 0],
  ]
  const totalW     = weights.reduce((s, [, w]) => s + w, 0) || 1
  const thresholds = [-0.30, 0.10, 0.50, Infinity]
  const roughness  = [0.60, 0.50, 0.44, 0.52]

  return thresholds.map((threshold, slot) => {
    let r = 0, g = 0, b = 0
    for (const [mol, w] of weights) {
      const t   = w / totalW
      const rgb = GAS_TILE_ARCH[mol][slot]
      r += rgb[0] * t; g += rgb[1] * t; b += rgb[2] * t
    }
    return { threshold, height: 0, color: new THREE.Color(r / 255, g / 255, b / 255), metalness: 0, roughness: roughness[slot] }
  })
}
