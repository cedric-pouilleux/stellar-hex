import * as THREE from 'three'
import {
  registerResourceDistributor,
  registerBodyResourceBridge,
  registerResourceVisual,
} from '@lib'
import type { TileResources, BiomeType } from '@lib'

/** Minimal tile shape used for cluster seeding — avoids a deep relative import. */
type SeedTile = { id: number; centerPoint: { x: number; y: number; z: number } }

type ResourceSpec = {
  id:         string
  label:      string
  color:      number
  metallic?:  boolean
  liquid?:    boolean
  roughness?: number
  metalness?: number
  emissive?:  number
}

export const DEMO_RESOURCES: ResourceSpec[] = [
  { id: 'iron',    label: 'Iron',    color: 0x7c6b5c, metallic: true,  roughness: 0.55, metalness: 0.85 },
  { id: 'copper',  label: 'Copper',  color: 0xb87333, metallic: true,  roughness: 0.45, metalness: 0.90 },
  { id: 'gold',    label: 'Gold',    color: 0xe6c36a, metallic: true,  roughness: 0.30, metalness: 0.95, emissive: 0.15 },
  { id: 'silicon', label: 'Silicon', color: 0x8993a0, metallic: false, roughness: 0.80, metalness: 0.10 },
  { id: 'sulfur',  label: 'Sulfur',  color: 0xd8c040, metallic: false, roughness: 0.85, metalness: 0.00 },
  { id: 'ice',     label: 'Ice',     color: 0xc8e8f4, metallic: false, roughness: 0.30, metalness: 0.00 },
  { id: 'water',   label: 'Water',   color: 0x1f6fb8, metallic: false, roughness: 0.20, metalness: 0.00, liquid: true },
]

const BY_ID = new Map(DEMO_RESOURCES.map(r => [r.id, r]))

// Very small deterministic hash → 0..1 in [0, 1)
function hash01(seed: string, x: number | string): number {
  let h = 2166136261
  const s = seed + ':' + x
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

/**
 * Builds a cluster-based concentration map for a single resource.
 *
 * Picks `seedCount` eligible tiles (filtered by biome) as cluster centers, then
 * for every tile sums a gaussian falloff from each seed — matches how real ore
 * deposits look: a dense core that fades with distance. `sigmaFrac` is sigma
 * expressed as a fraction of the body radius, so clusters scale with the body.
 *
 * Returns `null` when no eligible seed can be found (keeps the resource absent
 * rather than smearing it everywhere).
 */
function buildClusterConcentration(opts: {
  tiles:       readonly SeedTile[]
  biomeMap:    ReadonlyMap<number, BiomeType>
  eligible:    ReadonlySet<BiomeType>
  hashKey:     string
  seedCount:   number
  sigmaFrac:   number
  radius:      number
  peak:        number    // max concentration at cluster center (tile is eligible)
  threshold?:  number    // values below this are dropped (default 0.08)
}): Map<number, number> | null {
  const { tiles, biomeMap, eligible, hashKey, seedCount, sigmaFrac, radius, peak } = opts
  const threshold = opts.threshold ?? 0.08

  const candidates = tiles.filter(t => {
    const b = biomeMap.get(t.id)
    return b !== undefined && eligible.has(b)
  })
  if (candidates.length === 0) return null

  const seeds: SeedTile[] = []
  for (let i = 0; i < seedCount; i++) {
    const idx = Math.floor(hash01(hashKey, 'seed-' + i) * candidates.length)
    seeds.push(candidates[idx])
  }

  const sigma  = Math.max(1e-4, sigmaFrac * radius)
  const denom  = 2 * sigma * sigma
  const result = new Map<number, number>()

  for (const t of tiles) {
    const b = biomeMap.get(t.id)
    if (b === undefined || !eligible.has(b)) continue
    let amount = 0
    for (const s of seeds) {
      const dx = t.centerPoint.x - s.centerPoint.x
      const dy = t.centerPoint.y - s.centerPoint.y
      const dz = t.centerPoint.z - s.centerPoint.z
      amount += Math.exp(-(dx*dx + dy*dy + dz*dz) / denom)
    }
    amount = Math.min(1, amount) * peak
    if (amount >= threshold) result.set(t.id, amount)
  }
  return result
}

/**
 * Registers a deterministic demo distributor + bridge so the playground shows
 * realistic resource hover data without depending on the host application's
 * resource catalog. Pure illustration — not a gameplay distribution.
 */
export function installDemoResources(): void {
  registerResourceDistributor(({ tiles, biomeMap, config }) => {
    const seed = config.name
    const R    = config.radius

    // ── Cluster-based metals & non-biome-wide deposits ────────────────
    // Each metal is seeded at a small number of eligible tiles and falls
    // off gaussian-style with distance. Rarer resources use tighter sigma
    // and fewer seeds so they look like localised veins rather than a
    // uniform sprinkle over every mountain.
    const clusterSpecs: Array<{
      id:        string
      eligible:  BiomeType[]
      seeds:     number
      sigmaFrac: number
      peak:      number
    }> = [
      { id: 'iron',    eligible: ['mountain', 'volcanic'],            seeds: 3, sigmaFrac: 0.35, peak: 0.9 },
      { id: 'copper',  eligible: ['mountain'],                        seeds: 2, sigmaFrac: 0.25, peak: 0.8 },
      { id: 'gold',    eligible: ['mountain'],                        seeds: 2, sigmaFrac: 0.18, peak: 0.7 },
      { id: 'sulfur',  eligible: ['volcanic'],                        seeds: 2, sigmaFrac: 0.25, peak: 0.9 },
      { id: 'silicon', eligible: ['plains', 'forest', 'desert'],      seeds: 3, sigmaFrac: 0.30, peak: 0.7 },
    ]

    const clusterMaps = new Map<string, Map<number, number>>()
    for (const spec of clusterSpecs) {
      const m = buildClusterConcentration({
        tiles, biomeMap,
        eligible:  new Set(spec.eligible),
        hashKey:   seed + ':' + spec.id,
        seedCount: spec.seeds,
        sigmaFrac: spec.sigmaFrac,
        radius:    R,
        peak:      spec.peak,
      })
      if (m) clusterMaps.set(spec.id, m)
    }

    // ── Compose per-tile resource maps ────────────────────────────────
    // Biome-wide deposits (water on oceans, ice on polar/peak) stay
    // saturated because they are geographically defined; metals come
    // from clusterMaps; multiple resources can coexist on the same tile.
    const out = new Map<number, TileResources>()
    for (const tile of tiles) {
      const biome = biomeMap.get(tile.id)
      const m = new Map<string, number>()

      if (biome === 'ocean' || biome === 'ocean_deep') {
        m.set('water', 1.0)
      } else if (biome === 'ice_sheet' || biome === 'ice_peak') {
        m.set('ice', 0.8 + hash01(seed, tile.id) * 0.2)
      }

      for (const [id, map] of clusterMaps) {
        const amount = map.get(tile.id)
        if (amount !== undefined) m.set(id, amount)
      }

      if (m.size) out.set(tile.id, m)
    }
    return out
  })

  const biomeLabels: Partial<Record<BiomeType, string>> = {
    ocean:      'Ocean',
    ocean_deep: 'Deep ocean',
    ice_sheet:  'Ice sheet',
    ice_peak:   'Ice peak',
    plains:     'Plains',
    forest:     'Forest',
    desert:     'Desert',
    mountain:   'Mountain',
    volcanic:   'Volcanic',
    star:       'Stellar surface',
  }

  registerBodyResourceBridge({
    getCompatibleResourceColors({ bodyType, solidSurfaceOnly }) {
      return DEMO_RESOURCES
        .filter(r => bodyType !== 'star')
        .filter(r => !solidSurfaceOnly || !r.liquid)
        .map(r => ({ id: r.id, color: r.color }))
    },
    isMetallic(id)               { return !!BY_ID.get(id)?.metallic },
    isSurfaceLiquidResource(id)  { return !!BY_ID.get(id)?.liquid },
    getResourceDisplay(id) {
      const r = BY_ID.get(id); if (!r) return undefined
      return { label: r.label, color: r.color }
    },
    getBiomeLabel(b)             { return biomeLabels[b] ?? String(b) },
  })

  for (const r of DEMO_RESOURCES) {
    registerResourceVisual(r.id, {
      color:             new THREE.Color(r.color),
      roughness:         r.roughness ?? 0.6,
      metalness:         r.metalness ?? 0.0,
      colorBlend:        0.9,
      emissive:          r.emissive ? new THREE.Color(r.color) : undefined,
      emissiveIntensity: r.emissive ?? 0,
    })
  }
}
