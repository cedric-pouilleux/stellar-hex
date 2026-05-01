import type { Body, RGB } from '@cedric-pouilleux/stellar-hex/core'

/**
 * Demo helper that stamps a simple climate-band overlay on the atmo
 * board so the atmosphere view doesn't read as a flat grey hex grid.
 *
 * Tile latitude is derived from its centerPoint (`y / radius`) and
 * mapped to a three-stop ramp — polar / temperate / equatorial — with
 * a procedural micro-noise on top so neighbouring tiles vary slightly.
 *
 * Pure visual demo; no sim hookup. Real apps would push their own
 * resource / pollution / weather grid here.
 *
 * @param body - Body handle returned by `useBody`. No-op on stars or on
 *               planets without an atmo board.
 */
export function paintAtmoSample(body: Body): void {
  if (body.kind !== 'planet' || !body.tiles.atmo) return
  const overlay = new Map<number, RGB>()
  for (const tile of body.tiles.atmo.tiles) {
    const c   = tile.centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1
    const lat = Math.abs(c.y / len)               // 0 = equator, 1 = pole
    const jit = ((tile.id * 9301 + 49297) % 233281) / 233281 // [0, 1)
    const noise = (jit - 0.5) * 0.06
    let r: number, g: number, b: number
    if (lat > 0.7) {
      // Polar — pale icy blue.
      r = 0.78 + noise; g = 0.86 + noise; b = 0.95
    } else if (lat > 0.35) {
      // Temperate — soft cyan.
      r = 0.45 + noise; g = 0.72 + noise; b = 0.85
    } else {
      // Equatorial — warm cloud-tan.
      r = 0.86 + noise; g = 0.74 + noise; b = 0.55
    }
    overlay.set(tile.id, {
      r: Math.max(0, Math.min(1, r)),
      g: Math.max(0, Math.min(1, g)),
      b: Math.max(0, Math.min(1, b)),
    })
  }
  body.tiles.atmo.applyOverlay(overlay)
}
