import { describe, it, expect, vi } from 'vitest'
import type { BodyConfig } from '@lib'
import {
  captureBodyTopology,
  captureBodyStateSnapshot,
  isTopologyCompatible,
  replayIceColumns,
  type BodyStateSnapshot,
  type IceColumnSnapshot,
  type SolidShellAdjuster,
} from './bodyStateSnapshot'
import type { GameBodyState, PersistedBodyState } from '../game/GameBodyState'

// ── Fixtures ────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name:                'fixture',
    type:                'planetary',
    surfaceLook:         'terrain',
    radius:              1,
    rotationSpeed:       0,
    axialTilt:           0,
    temperatureMin:     -50,
    temperatureMax:      50,
    atmosphereThickness: 0.2,
    ...overrides,
  } as BodyConfig
}

const TILE_SIZE = 0.18

function makeGameState(serialized: PersistedBodyState): GameBodyState {
  // Only `serialize` is exercised by the snapshot module — every other
  // method is stubbed loosely so the type assertion holds without pulling
  // in a real lib body.
  return { serialize: vi.fn(() => serialized) } as unknown as GameBodyState
}

// ── captureBodyTopology ─────────────────────────────────────────────

describe('captureBodyTopology', () => {
  it('captures the inputs that drive subdivisions', () => {
    const fp = captureBodyTopology(makeConfig(), TILE_SIZE)
    expect(fp).toEqual({
      type:         'planetary',
      radius:       1,
      tileSize:     TILE_SIZE,
      atmoFraction: 0.2,
    })
  })

  it('clamps atmosphereThickness through resolveAtmosphereThickness', () => {
    const fp = captureBodyTopology(makeConfig({ atmosphereThickness: 1.7 }), TILE_SIZE)
    expect(fp.atmoFraction).toBe(1)
  })

  it('treats missing atmosphereThickness as 0', () => {
    const fp = captureBodyTopology(makeConfig({ atmosphereThickness: undefined }), TILE_SIZE)
    expect(fp.atmoFraction).toBe(0)
  })
})

// ── isTopologyCompatible ────────────────────────────────────────────

describe('isTopologyCompatible', () => {
  function snap(config = makeConfig()): BodyStateSnapshot {
    return {
      topology: captureBodyTopology(config, TILE_SIZE),
      game:     { configSeed: config.name, overrides: [] },
      ice:      [],
    }
  }

  it('returns true when every topology field matches', () => {
    expect(isTopologyCompatible(snap(), makeConfig(), TILE_SIZE)).toBe(true)
  })

  it('returns false when type changes (planet ↔ star)', () => {
    const star = makeConfig({ type: 'star', spectralType: 'G' })
    expect(isTopologyCompatible(snap(), star, TILE_SIZE)).toBe(false)
  })

  it('returns false when radius changes', () => {
    expect(isTopologyCompatible(snap(), makeConfig({ radius: 2 }), TILE_SIZE)).toBe(false)
  })

  it('returns false when tileSize changes', () => {
    expect(isTopologyCompatible(snap(), makeConfig(), TILE_SIZE * 2)).toBe(false)
  })

  it('returns false when atmoFraction changes', () => {
    expect(isTopologyCompatible(snap(), makeConfig({ atmosphereThickness: 0.5 }), TILE_SIZE)).toBe(false)
  })

  it('returns true on seed (`name`) change — guarded downstream by gameState.restore', () => {
    expect(isTopologyCompatible(snap(), makeConfig({ name: 'other' }), TILE_SIZE)).toBe(true)
  })

  it('returns false when the snapshot is null/undefined', () => {
    expect(isTopologyCompatible(null,      makeConfig(), TILE_SIZE)).toBe(false)
    expect(isTopologyCompatible(undefined, makeConfig(), TILE_SIZE)).toBe(false)
  })
})

// ── captureBodyStateSnapshot ────────────────────────────────────────

describe('captureBodyStateSnapshot', () => {
  it('serialises the gameState, freezes the ice map, and stamps topology', () => {
    const persisted: PersistedBodyState = {
      configSeed: 'fixture',
      overrides:  [[3, { elevation: 7 }]],
    }
    const game = makeGameState(persisted)
    const ice  = new Map<number, { top: number; base: number }>([
      [10, { top: 5, base: 2 }],
      [11, { top: 3, base: 3 }],
    ])

    const snap = captureBodyStateSnapshot(game, ice, makeConfig(), TILE_SIZE)

    expect(game.serialize).toHaveBeenCalledOnce()
    expect(snap.game).toBe(persisted)
    expect(snap.topology).toEqual({
      type: 'planetary', radius: 1, tileSize: TILE_SIZE, atmoFraction: 0.2,
    })
    expect(snap.ice).toEqual([
      { tileId: 10, top: 5, base: 2 },
      { tileId: 11, top: 3, base: 3 },
    ])
  })

  it('decouples the snapshot from later mutations of the live ice map', () => {
    const ice = new Map<number, { top: number; base: number }>([
      [10, { top: 5, base: 2 }],
    ])
    const snap = captureBodyStateSnapshot(makeGameState({ configSeed: 'x', overrides: [] }), ice, makeConfig(), TILE_SIZE)

    ice.get(10)!.top = 0
    ice.clear()

    expect(snap.ice).toEqual([{ tileId: 10, top: 5, base: 2 }])
  })
})

// ── replayIceColumns ────────────────────────────────────────────────

describe('replayIceColumns', () => {
  function makeShellSpy(): SolidShellAdjuster & { lowerCalls: Array<[number, number]>; removeCalls: number[] } {
    const lowerCalls: Array<[number, number]> = []
    const removeCalls: number[] = []
    return {
      lowerTile(id, delta) { lowerCalls.push([id, delta]) },
      removeTile(id)       { removeCalls.push(id) },
      lowerCalls,
      removeCalls,
    }
  }

  it('removes fully-consumed caps and rewrites the live entry', () => {
    const live = new Map([[7, { top: 10, base: 2 }]])
    const shell = makeShellSpy()
    const snap: IceColumnSnapshot[] = [{ tileId: 7, top: 2, base: 2 }]

    replayIceColumns(snap, live, shell, /*defaultTop*/ 10)

    expect(shell.removeCalls).toEqual([7])
    expect(shell.lowerCalls).toEqual([])
    expect(live.get(7)).toEqual({ top: 2, base: 2 })
  })

  it('lowers partially-mined caps by the consumed delta', () => {
    const live = new Map([[7, { top: 10, base: 2 }]])
    const shell = makeShellSpy()
    const snap: IceColumnSnapshot[] = [{ tileId: 7, top: 6, base: 2 }]

    replayIceColumns(snap, live, shell, /*defaultTop*/ 10)

    expect(shell.lowerCalls).toEqual([[7, 4]])
    expect(shell.removeCalls).toEqual([])
    expect(live.get(7)).toEqual({ top: 6, base: 2 })
  })

  it('leaves intact caps untouched', () => {
    const live = new Map([[7, { top: 10, base: 2 }]])
    const shell = makeShellSpy()
    const snap: IceColumnSnapshot[] = [{ tileId: 7, top: 10, base: 2 }]

    replayIceColumns(snap, live, shell, /*defaultTop*/ 10)

    expect(shell.lowerCalls).toEqual([])
    expect(shell.removeCalls).toEqual([])
    expect(live.get(7)).toEqual({ top: 10, base: 2 })
  })

  it('ignores snapshot entries whose tile is not in the live ice map', () => {
    const live = new Map<number, { top: number; base: number }>()
    const shell = makeShellSpy()
    const snap: IceColumnSnapshot[] = [{ tileId: 99, top: 0, base: 0 }]

    replayIceColumns(snap, live, shell, /*defaultTop*/ 10)

    expect(shell.lowerCalls).toEqual([])
    expect(shell.removeCalls).toEqual([])
  })

  it('is a safe no-op when no shell is provided', () => {
    const live = new Map([[7, { top: 10, base: 2 }]])
    const snap: IceColumnSnapshot[] = [
      { tileId: 7, top: 2, base: 2 },
    ]

    expect(() => replayIceColumns(snap, live, null, 10)).not.toThrow()
    expect(live.get(7)).toEqual({ top: 2, base: 2 })
  })
})
