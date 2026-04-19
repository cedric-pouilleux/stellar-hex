import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDepletion,
  getConcentration,
  getAllConcentrations,
  deplete,
  drainTile,
  isFullyDepleted,
  resetDepletion,
  hasDepletionEntry,
  hadInitialResource,
  regenerate,
  getInitialConcentration,
  getBodyTileIds,
  suspendResource,
  restoreResource,
} from './tileDepletion'
import type { TileResources } from './TileState'

// ── Fixtures ──────────────────────────────────────────────────────

const BODY = 0  // body index used throughout tests

function makeFixture(entries: Array<[number, Array<[string, number]>]>): {
  ids:  number[]
  map:  Map<number, TileResources>
} {
  const map = new Map<number, TileResources>()
  const ids: number[] = []
  for (const [id, resources] of entries) {
    ids.push(id)
    map.set(id, new Map(resources) as unknown as TileResources)
  }
  return { ids, map }
}

const ALL_TILES = makeFixture([
  [1, [['basalt', 0.8], ['iron', 0.4]]],
  [2, [['granite', 0.6]]],
  [3, []],
])
const TILE_A = makeFixture([[1, [['basalt', 0.8], ['iron', 0.4]]]])
const TILE_B = makeFixture([[2, [['granite', 0.6]]]])

beforeEach(() => {
  resetDepletion()
  initDepletion(ALL_TILES.ids, ALL_TILES.map, BODY)
})

// ── Tests ─────────────────────────────────────────────────────────

describe('initDepletion', () => {
  it('copies initial concentrations from tile states', () => {
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.8)
    expect(getConcentration(BODY, 1, 'iron')).toBeCloseTo(0.4)
    expect(getConcentration(BODY, 2, 'granite')).toBeCloseTo(0.6)
  })

  it('returns 0 for unknown resource on a known tile', () => {
    expect(getConcentration(BODY, 1, 'water')).toBe(0)
  })

  it('returns 0 for unknown tile', () => {
    expect(getConcentration(BODY, 999, 'basalt')).toBe(0)
  })

  it('does not reset already-tracked tiles (non-destructive on refocus)', () => {
    // Deplete tile 1 partially
    deplete(BODY, 1, 'basalt', 0.5)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.3)

    // Calling initDepletion again (simulating a planet refocus) must not restore it
    initDepletion(TILE_A.ids, TILE_A.map, BODY)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.3)
  })

  it('initialises new tiles not yet tracked', () => {
    resetDepletion()
    initDepletion(TILE_A.ids, TILE_A.map, BODY)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.8)
    // Tile 2 not yet tracked → returns 0
    expect(getConcentration(BODY, 2, 'granite')).toBe(0)
    // Now init tile 2
    initDepletion(TILE_B.ids, TILE_B.map, BODY)
    expect(getConcentration(BODY, 2, 'granite')).toBeCloseTo(0.6)
  })

  it('two bodies with the same tileId do not interfere', () => {
    const OTHER = 1
    const other = makeFixture([[1, [['gold', 0.9]]]])
    initDepletion(other.ids, other.map, OTHER)

    // Body 0 tile 1 keeps its own values
    expect(getConcentration(BODY,  1, 'basalt')).toBeCloseTo(0.8)
    // Body 1 tile 1 has its own values
    expect(getConcentration(OTHER, 1, 'gold')).toBeCloseTo(0.9)
  })

  it('two layers of the same body with the same tileId do not interfere', () => {
    // Simulates a gaseous planet: gas and core sims share bodyIndex and reuse
    // the same tileId space. Resources on one layer must not leak to the other.
    const gas  = makeFixture([[1, [['hydrogen', 0.85], ['helium', 0.72]]]])
    const core = makeFixture([[1, [['iron', 0.6]]]])

    resetDepletion()
    initDepletion(gas.ids,  gas.map,  BODY, 'gas')
    initDepletion(core.ids, core.map, BODY, 'core')

    expect(getConcentration(BODY, 1, 'hydrogen' as any, 'gas')).toBeCloseTo(0.85)
    expect(getConcentration(BODY, 1, 'helium'   as any, 'gas')).toBeCloseTo(0.72)
    expect(getConcentration(BODY, 1, 'iron',             'gas')).toBe(0)

    expect(getConcentration(BODY, 1, 'iron',             'core')).toBeCloseTo(0.6)
    expect(getConcentration(BODY, 1, 'hydrogen' as any, 'core')).toBe(0)

    const gasAll  = getAllConcentrations(BODY, 1, 'gas')
    const coreAll = getAllConcentrations(BODY, 1, 'core')
    expect(gasAll.has('iron')).toBe(false)
    expect(coreAll.has('hydrogen' as any)).toBe(false)
  })

  it('deplete on one layer leaves the other layer untouched', () => {
    const gas  = makeFixture([[1, [['hydrogen', 0.85]]]])
    const core = makeFixture([[1, [['iron', 0.6]]]])

    resetDepletion()
    initDepletion(gas.ids,  gas.map,  BODY, 'gas')
    initDepletion(core.ids, core.map, BODY, 'core')

    deplete(BODY, 1, 'iron', 0.3, 'core')

    expect(getConcentration(BODY, 1, 'iron',             'core')).toBeCloseTo(0.3)
    expect(getConcentration(BODY, 1, 'hydrogen' as any, 'gas')).toBeCloseTo(0.85)
  })

  it('registers body tile ids', () => {
    const ids = getBodyTileIds(BODY)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).toContain(3)
  })
})

describe('hasDepletionEntry', () => {
  it('returns true for a tracked tile', () => {
    expect(hasDepletionEntry(BODY, 1)).toBe(true)
  })

  it('returns false for an unknown tile', () => {
    expect(hasDepletionEntry(BODY, 999)).toBe(false)
  })

  it('returns true for a fully depleted tile (entry exists, map empty)', () => {
    drainTile(BODY, 1)
    expect(hasDepletionEntry(BODY, 1)).toBe(true)
  })
})

describe('deplete', () => {
  it('reduces concentration by the requested amount', () => {
    deplete(BODY, 1, 'basalt', 0.2)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.6)
  })

  it('returns the actual amount depleted', () => {
    const actual = deplete(BODY, 1, 'basalt', 0.2)
    expect(actual).toBeCloseTo(0.2)
  })

  it('clamps to available amount when over-depleting', () => {
    const actual = deplete(BODY, 1, 'iron', 1.0)
    expect(actual).toBeCloseTo(0.4)
    expect(getConcentration(BODY, 1, 'iron')).toBe(0)
  })

  it('removes resource entry when fully depleted', () => {
    deplete(BODY, 1, 'iron', 1.0)
    const all = getAllConcentrations(BODY, 1)
    expect(all.has('iron' as any)).toBe(false)
  })

  it('returns 0 for unknown tile', () => {
    expect(deplete(BODY, 999, 'basalt', 0.1)).toBe(0)
  })
})

describe('regenerate', () => {
  it('restores a partially depleted resource', () => {
    deplete(BODY, 1, 'basalt', 0.5)
    const actual = regenerate(BODY, 1, 'basalt', 0.3)
    expect(actual).toBeCloseTo(0.3)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.6)
  })

  it('caps at initial concentration', () => {
    deplete(BODY, 1, 'basalt', 0.5)
    const actual = regenerate(BODY, 1, 'basalt', 999)
    expect(actual).toBeCloseTo(0.5)
    expect(getConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.8)
  })

  it('returns 0 when already at full concentration', () => {
    expect(regenerate(BODY, 1, 'basalt', 0.1)).toBe(0)
  })

  it('returns 0 for unknown tile', () => {
    expect(regenerate(BODY, 999, 'basalt', 0.1)).toBe(0)
  })
})

describe('getInitialConcentration', () => {
  it('returns initial value regardless of current depletion', () => {
    deplete(BODY, 1, 'basalt', 0.5)
    expect(getInitialConcentration(BODY, 1, 'basalt')).toBeCloseTo(0.8)
  })

  it('returns 0 for unknown tile', () => {
    expect(getInitialConcentration(BODY, 999, 'basalt')).toBe(0)
  })
})

describe('drainTile', () => {
  it('returns a map of all resources that were present', () => {
    const drained = drainTile(BODY, 1)
    expect(drained.get('basalt' as any)).toBeCloseTo(0.8)
    expect(drained.get('iron' as any)).toBeCloseTo(0.4)
  })

  it('tile is fully depleted after drain', () => {
    drainTile(BODY, 1)
    expect(isFullyDepleted(BODY, 1)).toBe(true)
  })

  it('returns empty map for tile with no resources', () => {
    const drained = drainTile(BODY, 3)
    expect(drained.size).toBe(0)
  })
})

describe('hadInitialResource', () => {
  it('returns true for a resource the tile originally had', () => {
    expect(hadInitialResource(BODY, 1, 'basalt' as any)).toBe(true)
    expect(hadInitialResource(BODY, 1, 'iron'   as any)).toBe(true)
  })

  it('returns false for a resource the tile never had', () => {
    expect(hadInitialResource(BODY, 1, 'water' as any)).toBe(false)
  })

  it('remains true after the resource is fully depleted', () => {
    deplete(BODY, 1, 'iron', 1.0)
    expect(getConcentration(BODY, 1, 'iron'  as any)).toBe(0)
    expect(hadInitialResource(BODY, 1, 'iron' as any)).toBe(true)
  })

  it('returns false for an unknown tile', () => {
    expect(hadInitialResource(BODY, 999, 'basalt' as any)).toBe(false)
  })

  it('returns false after resetDepletion', () => {
    resetDepletion()
    expect(hadInitialResource(BODY, 1, 'basalt' as any)).toBe(false)
  })
})

describe('suspendResource / restoreResource', () => {
  it('zeros the live concentration while preserving the stashed value', () => {
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBeCloseTo(0.8)
    suspendResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBe(0)

    restoreResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBeCloseTo(0.8)
  })

  it('restore is capped at the initial concentration', () => {
    suspendResource(BODY, 1, 'basalt' as any)
    // Simulate someone tampering by changing the stash is not possible via API;
    // instead ensure that restoring still caps at initial (initial = 0.8).
    restoreResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBeLessThanOrEqual(0.8)
  })

  it('suspend is idempotent — a second call does not overwrite the stash', () => {
    suspendResource(BODY, 1, 'basalt' as any)
    // basalt is now 0 — a second suspend would stash 0 and destroy the
    // original value if it were not guarded.
    suspendResource(BODY, 1, 'basalt' as any)
    restoreResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBeCloseTo(0.8)
  })

  it('restore is a no-op when nothing was suspended', () => {
    restoreResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'basalt' as any)).toBeCloseTo(0.8)
  })

  it('suspend leaves untouched resources intact', () => {
    suspendResource(BODY, 1, 'basalt' as any)
    expect(getConcentration(BODY, 1, 'iron' as any)).toBeCloseTo(0.4)
  })
})

describe('isFullyDepleted', () => {
  it('returns false for a tile with resources', () => {
    expect(isFullyDepleted(BODY, 1)).toBe(false)
  })

  it('returns true for a tile with no initial resources', () => {
    expect(isFullyDepleted(BODY, 3)).toBe(true)
  })

  it('returns true for unknown tileId', () => {
    expect(isFullyDepleted(BODY, 999)).toBe(true)
  })

  it('returns true after all resources are depleted', () => {
    deplete(BODY, 2, 'granite', 1.0)
    expect(isFullyDepleted(BODY, 2)).toBe(true)
  })
})
