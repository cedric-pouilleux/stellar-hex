import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateHexasphere,
  buildNeighborMap,
  resolveTerrainLevelCount,
  type BodyConfig,
  type Tile,
} from '@lib'
import { useTileDig, type DigBodyHandle } from './useTileDig'

// â”€â”€ Test fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RADIUS         = 1
const CORE_RATIO     = 0.5
// Derive N the same way the sim does so the initial band is always valid.
const BAND_COUNT     = resolveTerrainLevelCount(RADIUS, CORE_RATIO)
const INITIAL_BAND   = Math.min(5, BAND_COUNT - 1)

function makeConfig(): BodyConfig {
  return {
    name:               'test',
    type:               'planetary', surfaceLook: 'terrain',
    radius:             RADIUS,
    temperatureMin:     -50,
    temperatureMax:     50,
    rotationSpeed:      0,
    axialTilt:          0,
    coreRadiusRatio:    CORE_RATIO,
  }
}

interface Harness {
  body:       DigBodyHandle
  tiles:      Tile[]
  bands:      Map<number, number>
  setElevation: ReturnType<typeof vi.fn>
  centerId:   number
  ringIds:    Map<number, number[]>
}

/**
 * Builds a real hexasphere fixture + a minimal state adapter that keeps
 * per-tile elevations in a local map. `setElevation` is a spy so each
 * test can assert the exact sequence of writes the digger performed.
 */
function buildHarness(initialBand = INITIAL_BAND): Harness {
  const { tiles } = generateHexasphere(RADIUS, 3)
  const center    = tiles.find(t => !t.isPentagon)!

  const bands = new Map<number, number>()
  for (const t of tiles) bands.set(t.id, initialBand)

  const setElevation = vi.fn((id: number, newElev: number) => {
    bands.set(id, newElev)
  })

  const body: DigBodyHandle = {
    config:       makeConfig(),
    sim:          { tiles },
    getElevation: (id) => bands.get(id),
    setElevation,
  }

  const map = buildNeighborMap(tiles)
  const ringIds = new Map<number, number[]>()
  ringIds.set(0, [center.id])
  const seen = new Set<number>([center.id])
  let frontier = [center.id]
  for (let r = 1; r <= 3; r++) {
    const next: number[] = []
    for (const id of frontier) {
      for (const peer of map.get(id) ?? []) {
        if (seen.has(peer)) continue
        seen.add(peer)
        next.push(peer)
      }
    }
    ringIds.set(r, next)
    frontier = next
  }

  return { body, tiles, bands, setElevation, centerId: center.id, ringIds }
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('useTileDig', () => {
  let h: Harness
  beforeEach(() => { h = buildHarness() })

  it('lowers the central tile by `centerDrop` and adjacent tiles by 1', () => {
    const { dig } = useTileDig(h.body)
    const touched = dig(h.centerId, { centerDrop: 2, radius: 1 })

    expect(h.bands.get(h.centerId)).toBe(INITIAL_BAND - 2)
    for (const id of h.ringIds.get(1)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND - 1)
    }
    for (const id of h.ringIds.get(2)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND)
    }
    expect(touched.size).toBe(1 + h.ringIds.get(1)!.length)
  })

  it('extends the cone to further rings â€” drop(ring) = max(0, centerDrop - ring)', () => {
    const { dig } = useTileDig(h.body)
    dig(h.centerId, { centerDrop: 3, radius: 2 })

    expect(h.bands.get(h.centerId)).toBe(INITIAL_BAND - 3)
    for (const id of h.ringIds.get(1)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND - 2)
    }
    for (const id of h.ringIds.get(2)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND - 1)
    }
    for (const id of h.ringIds.get(3)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND)
    }
  })

  it('stops walking once the ring drop reaches zero, even if radius is larger', () => {
    const { dig } = useTileDig(h.body)
    // centerDrop=2 but radius=5 â†’ only the centre and ring 1 should change.
    dig(h.centerId, { centerDrop: 2, radius: 5 })

    expect(h.bands.get(h.centerId)).toBe(INITIAL_BAND - 2)
    for (const id of h.ringIds.get(1)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND - 1)
    }
    for (const id of h.ringIds.get(2)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND)
    }
  })

  it('clamps the resulting elevation to band 0 (cannot dig below the core)', () => {
    h = buildHarness(1)  // start one band above the floor
    const { dig } = useTileDig(h.body)
    const touched = dig(h.centerId, { centerDrop: 4, radius: 1 })

    expect(h.bands.get(h.centerId)).toBe(0)
    for (const id of h.ringIds.get(1)!) {
      expect(h.bands.get(id)).toBe(0)  // 1 - 3 clamped to 0
    }
    expect(touched.has(h.centerId)).toBe(true)
  })

  it('skips tiles already at band 0 (no spurious writes)', () => {
    h = buildHarness(0)
    const { dig } = useTileDig(h.body)
    const touched = dig(h.centerId, { centerDrop: 5, radius: 2 })

    expect(touched.size).toBe(0)
    expect(h.setElevation).not.toHaveBeenCalled()
  })

  it('calls setElevation exactly once per touched tile, with the new band', () => {
    const { dig } = useTileDig(h.body)
    dig(h.centerId, { centerDrop: 2, radius: 1 })

    // 1 centre + all ring-1 neighbours.
    const expectedCount = 1 + h.ringIds.get(1)!.length
    expect(h.setElevation).toHaveBeenCalledTimes(expectedCount)
    // Centre gets (INITIAL - 2); ring-1 gets (INITIAL - 1).
    expect(h.setElevation).toHaveBeenCalledWith(h.centerId, INITIAL_BAND - 2)
    for (const id of h.ringIds.get(1)!) {
      expect(h.setElevation).toHaveBeenCalledWith(id, INITIAL_BAND - 1)
    }
  })

  it('returns an empty set and skips writes for unknown tile ids', () => {
    const { dig } = useTileDig(h.body)
    const touched = dig(99_999, { centerDrop: 2, radius: 1 })
    expect(touched.size).toBe(0)
    expect(h.setElevation).not.toHaveBeenCalled()
  })

  it('treats radius=0 as "centre only"', () => {
    const { dig } = useTileDig(h.body)
    const touched = dig(h.centerId, { centerDrop: 2, radius: 0 })

    expect(touched).toEqual(new Set([h.centerId]))
    expect(h.bands.get(h.centerId)).toBe(INITIAL_BAND - 2)
    for (const id of h.ringIds.get(1)!) {
      expect(h.bands.get(id)).toBe(INITIAL_BAND)
    }
  })
})
