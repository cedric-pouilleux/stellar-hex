import type { SpectralType, StarConfig, ResolvedStarData } from '../types/body.types'
import { REF_STAR_RADIUS, REF_STAR_TEMP } from '../config/defaults'

// ── Spectral lookup table ─────────────────────────────────────────────────────
// Typical main-sequence values; radius in world units (Sun reference = 3).
// Luminosity is derived from the Stefan-Boltzmann formula, not hardcoded.
const SPECTRAL_TABLE: Record<SpectralType, { tempK: number; radius: number; color: string }> = {
  O: { tempK: 40_000, radius: 15,  color: '#9bb0ff' },  // blue-white, rare
  B: { tempK: 20_000, radius: 7,   color: '#aabfff' },  // blue-white
  A: { tempK:  9_000, radius: 4,   color: '#cad7ff' },  // white
  F: { tempK:  7_000, radius: 3.5, color: '#f8f7ff' },  // yellow-white
  G: { tempK:  5_500, radius: 3,   color: '#fff4ea' },  // yellow (Sun-like)
  K: { tempK:  4_500, radius: 2.5, color: '#ffd2a1' },  // orange
  M: { tempK:  3_000, radius: 1.5, color: '#ffcc6f' },  // red dwarf
}

export { SPECTRAL_TABLE }

// ── Physics ───────────────────────────────────────────────────────────────────

/** Relative luminosity vs. G-type reference (Stefan-Boltzmann). */
function computeLuminosity(radius: number, tempK: number): number {
  return (radius / REF_STAR_RADIUS) ** 2 * (tempK / REF_STAR_TEMP) ** 4
}

/** Resolve a StarConfig to concrete physical values, applying any overrides. */
export function resolveStarData(cfg: StarConfig): ResolvedStarData {
  const base = SPECTRAL_TABLE[cfg.spectralType]
  const tempK  = cfg.tempK  ?? base.tempK
  const radius = cfg.radius ?? base.radius
  return {
    tempK,
    radius,
    luminosity: computeLuminosity(radius, tempK),
    color:      base.color,
  }
}

/**
 * Returns `{ radius, tempAvg }` derived from a StarConfig — the minimal
 * star parameters consumed by orbital physics in downstream features.
 */
export function toStarParams(cfg: StarConfig): { radius: number; tempAvg: number } {
  const { radius, tempK } = resolveStarData(cfg)
  return { radius, tempAvg: tempK }
}
