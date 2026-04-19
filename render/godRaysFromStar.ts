import type { StarConfig } from '../types/body.types'
import type { GodRaysParams } from '../config/render'
import { resolveStarData, SPECTRAL_TABLE } from '../physics/starPhysics'
import { clamp } from '../core/math'

/**
 * Derives screen-space god rays parameters from a star's physical properties.
 *
 * - exposure : driven by luminosity, compensated by visual size (see below)
 * - decay    : driven by baseline radius (larger type → longer rays)
 * - density  : driven by baseline radius (larger type → denser step stretch)
 * - weight   : driven by tempK           (hotter star → sharper, more incisive rays)
 *
 * Visual-size compensation: stars are rendered larger than their SPECTRAL_TABLE
 * reference radius (× ~3 scale), which multiplies the sun's screen footprint
 * and floods the god-rays mask with seed pixels. Exposure is divided by the
 * area ratio (baseRadius / actualRadius)² so the perceived ray intensity
 * matches the baseline calibration regardless of visual scale.
 *
 * Calibrated on G-type reference (no radius override): exposure≈0.44,
 * decay≈0.94, density≈0.70, weight≈0.36.
 */
export function godRaysFromStar(cfg: StarConfig): GodRaysParams {
  const { luminosity, radius: actualRadius, tempK } = resolveStarData(cfg)
  const baseRadius = SPECTRAL_TABLE[cfg.spectralType].radius
  const areaScale  = (baseRadius / actualRadius) ** 2
  return {
    exposure: clamp((0.30 + luminosity * 0.14) * areaScale, 0.05, 1.20),
    decay:    clamp(0.88 + baseRadius * 0.020, 0.88, 0.97),
    density:  clamp(0.52 + baseRadius * 0.060, 0.52, 0.88),
    weight:   clamp(0.28 + tempK      / 70_000, 0.28, 0.56),
  }
}
