import { describe, it, expect, vi } from 'vitest'
import type { Body } from '@lib'
import {
  createGameBodyState,
  type PersistedBodyState,
  type TileChangeEvent,
} from './GameBodyState'
import type { TileResources } from '../lib/paint/tileResourceBlend'

/**
 * Covers the merge + mutation + persistence contract of `GameBodyState`.
 *
 * The lib `Body` is faked: we only need `sim.tileStates`, `sim.seaLevelElevation`,
 * `config.name`, `palette`, and `tiles.updateTileSolHeight` for the
 * elevation-mutation path. Resource mutation never touches the mesh, so a
 * spy on `updateTileSolHeight` is enough to assert the visual propagation.
 */

type BaselineTile = { tileId: number; elevation: number }

function makeFakeBody(
  configSeed: string,
  baseline:   BaselineTile[],
): { body: Body; updateTileSolHeight: ReturnType<typeof vi.fn> } {
  const tileStates = new Map<number, BaselineTile>()
  for (const t of baseline) tileStates.set(t.tileId, t)
  const updateTileSolHeight = vi.fn()
  const fake = {
    config: { name: configSeed } as unknown as Body['config'],
    sim:    {
      tileStates,
      seaLevelElevation: -1,
    } as unknown as Body['sim'],
    palette: [] as unknown as Body['palette'],
    tiles:   {
      sol: { updateTileSolHeight },
    } as unknown as Body['tiles'],
  } as unknown as Body
  return { body: fake, updateTileSolHeight }
}

const BASELINE: BaselineTile[] = [
  { tileId: 1, elevation: 5 },
  { tileId: 2, elevation: 3 },
  { tileId: 7, elevation: 1 },
]

/**
 * Sol-layer baseline used by every spec. The tests model minerals on sol only;
 * layered-distribution specifics (atmo entries) are covered separately.
 */
const INITIAL_RESOURCES = {
  sol: new Map<number, TileResources>([
    [1, new Map([['iron', 0.9]])],
    [2, new Map([['gold', 0.4]])],
  ]),
  atmo: new Map<number, TileResources>(),
}

describe('createGameBodyState — reading', () => {
  it('returns the baseline when no override exists', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    const view     = state.getTile(1)!
    expect(view.elevation).toBe(5)
    expect(view.resources.get('iron')).toBe(0.9)
  })

  it('returns empty resources for tiles absent from the initial distribution', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    const view     = state.getTile(7)!
    expect(view.resources.size).toBe(0)
  })

  it('returns null for unknown tile ids', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    expect(state.getTile(999)).toBeNull()
  })

  it('`isDestroyed` is true only when the tile elevation is 0', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    expect(state.isDestroyed(7)).toBe(false)
    state.setElevation(7, 0)
    expect(state.isDestroyed(7)).toBe(true)
  })
})

describe('createGameBodyState — mutation', () => {
  it('setElevation stores an absolute override + pushes the mesh mutation', () => {
    const { body, updateTileSolHeight } = makeFakeBody('seed-a', BASELINE)
    const state = createGameBodyState(body, INITIAL_RESOURCES)
    state.setElevation(1, 2)
    expect(state.getTile(1)!.elevation).toBe(2)
    expect(updateTileSolHeight).toHaveBeenCalledTimes(1)
  })

  it('setElevation no-ops when the value is unchanged', () => {
    const { body, updateTileSolHeight } = makeFakeBody('seed-a', BASELINE)
    const state = createGameBodyState(body, INITIAL_RESOURCES)
    state.setElevation(1, 5)
    expect(updateTileSolHeight).not.toHaveBeenCalled()
  })

  it('setResourceAmount overrides the baseline entry', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    state.setResourceAmount(1, 'iron', 0.3)
    expect(state.getResourceAmount(1, 'iron')).toBe(0.3)
    // Other baseline entries on the same tile are erased because the
    // override replaces the whole Map.
    state.setResourceAmount(2, 'gold', 0)
    expect(state.getResourceAmount(2, 'gold')).toBe(0)
  })

  it('setResourceAmount can add a new resource that wasn’t in the baseline', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    state.setResourceAmount(7, 'silicon', 0.6)
    expect(state.getResourceAmount(7, 'silicon')).toBe(0.6)
  })

  it('clearResources empties every resource on the tile', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    state.clearResources(1)
    expect(state.getTile(1)!.resources.size).toBe(0)
  })
})

describe('createGameBodyState — reactivity', () => {
  it('subscribe fires on mutation and can be unsubscribed', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    const events: TileChangeEvent[] = []
    const stop = state.subscribe((ev) => events.push(ev))
    state.setElevation(1, 4)
    state.setResourceAmount(2, 'gold', 0.1)
    stop()
    state.setElevation(1, 3)
    expect(events).toHaveLength(2)
    expect(events[0].changed.has('elevation')).toBe(true)
    expect(events[1].changed.has('resources')).toBe(true)
  })
})

describe('createGameBodyState — persistence', () => {
  it('serialize captures every override with absolute values', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    state.setElevation(1, 2)
    state.setResourceAmount(1, 'iron', 0.1)
    const snap = state.serialize()
    expect(snap.configSeed).toBe('seed-a')
    expect(snap.overrides).toHaveLength(1)
    const [, data] = snap.overrides[0]
    expect(data.elevation).toBe(2)
    expect(data.resources?.get('iron')).toBe(0.1)
  })

  it('restore replays a snapshot onto a fresh state', () => {
    const { body, updateTileSolHeight } = makeFakeBody('seed-a', BASELINE)
    const state = createGameBodyState(body, INITIAL_RESOURCES)
    const snap: PersistedBodyState = {
      configSeed: 'seed-a',
      overrides:  [
        [1, { elevation: 2, resources: new Map([['iron', 0.1]]) }],
        [7, { resources: new Map([['silicon', 0.4]]) }],
      ],
    }
    state.restore(snap)
    expect(state.getTile(1)!.elevation).toBe(2)
    expect(state.getResourceAmount(1, 'iron')).toBe(0.1)
    expect(state.getResourceAmount(7, 'silicon')).toBe(0.4)
    expect(updateTileSolHeight).toHaveBeenCalled()
  })

  it('restore is a no-op when the configSeed mismatches', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const state    = createGameBodyState(body, INITIAL_RESOURCES)
    state.restore({
      configSeed: 'seed-b',
      overrides:  [[1, { elevation: 0 }]],
    })
    expect(state.getTile(1)!.elevation).toBe(5)
  })

  it('reset drops overrides and restores baseline elevations on the mesh', () => {
    const { body, updateTileSolHeight } = makeFakeBody('seed-a', BASELINE)
    const state = createGameBodyState(body, INITIAL_RESOURCES)
    state.setElevation(1, 2)
    updateTileSolHeight.mockClear()
    state.reset()
    expect(state.getTile(1)!.elevation).toBe(5)
    expect(updateTileSolHeight).toHaveBeenCalledTimes(1)
  })

  it('construction with a snapshot replays it immediately', () => {
    const { body } = makeFakeBody('seed-a', BASELINE)
    const snap: PersistedBodyState = {
      configSeed: 'seed-a',
      overrides:  [[1, { elevation: 0 }]],
    }
    const state = createGameBodyState(body, INITIAL_RESOURCES, snap)
    expect(state.isDestroyed(1)).toBe(true)
  })
})
