import * as THREE from 'three'
import type { SpectralType } from '../../types/body.types'
import type { TerrainLevel } from '../types/terrain.types'

// ── Per-type granulation colors ───────────────────────────────────────────────
// Four hex values: dark sunspot → mid granule → bright granule → hot plage.
// Contrast is intentionally high so the hexagonal tiling remains visible.
const GRANULATION: Record<SpectralType, [number, number, number, number]> = {
  O: [0x001188, 0x2255dd, 0x7799ff, 0xbbddff],  // deep navy → blue → pale blue-white
  B: [0x1122aa, 0x3366ee, 0x88aaff, 0xcce0ff],  // dark blue → blue → light blue
  A: [0x223388, 0x5577cc, 0x99bbee, 0xddeeff],  // slate blue → periwinkle → pale blue
  F: [0x664400, 0xcc9933, 0xffe8a0, 0xfff8e8],  // dark amber → golden → warm cream
  G: [0x660000, 0xcc4400, 0xff9900, 0xffee88],  // dark red → orange → gold (Sun-like)
  K: [0x440000, 0xaa3300, 0xff6600, 0xffaa44],  // near-black red → deep orange → amber
  M: [0x1a0000, 0x660000, 0xcc1100, 0xff5533],  // black-red → deep red → bright red
}

const THRESHOLDS         = [-0.20, 0.30, 0.70, Infinity] as const
const EMISSIVE_INTENSITY = [1.2, 1.5, 1.8, 2.0] as const

/** Build a TerrainLevel palette for a star mesh based on its spectral type. */
export function buildStarPalette(spectralType: SpectralType): TerrainLevel[] {
  const colors = GRANULATION[spectralType]
  return colors.map((hex, i) => ({
    threshold:         THRESHOLDS[i],
    height:            0,
    color:             new THREE.Color(hex),
    emissive:          new THREE.Color(hex),
    emissiveIntensity: EMISSIVE_INTENSITY[i],
    metalness:         0,
    roughness:         1,
  }))
}
