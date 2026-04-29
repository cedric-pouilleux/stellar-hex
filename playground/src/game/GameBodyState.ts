/**
 * Gameplay state wrapper around a lib `Body`.
 *
 * Owns the MUTABLE game state (destroyed tiles, extracted resources),
 * while delegating geometry + rendering to the immutable `Body` snapshot
 * returned by `useBody(config)`.
 *
 * Contract:
 *   - `body.sim.tileStates` + the `initialResources` map supplied at
 *     construction are the initial geological state.
 *   - Per-tile overrides store the ABSOLUTE current state (not deltas),
 *     so a change to the generator between save/load can't silently
 *     move the ground under a touched tile.
 *   - `getTile(id)` always returns the merged view.
 *   - Every mutation (a) updates overrides, (b) pushes the change to the
 *     body's render API, (c) emits a change event for UI observers.
 *
 * Framework-agnostic: `subscribe()` is a plain callback. A Pinia store
 * (or any reactivity layer) can wrap the wrapper if needed.
 */

import type { PlanetBody } from '@lib'
import { resolveTileHeight } from '@lib'
import type { TileResources } from '../lib/paint/tileResourceBlend'
import type { LayeredDistribution } from '../lib/paint/paintBody'

// ── Types ────────────────────────────────────────────────────────────

/**
 * Absolute per-tile override. Values stored here REPLACE the baseline
 * from the sim — never deltas. A tile with no entry falls back to its
 * baseline.
 */
export interface TileOverride {
  /** Current elevation band (absolute). When absent, tile keeps its baseline. */
  elevation?: number
  /** Current per-resource amounts in [0, 1]. Empty map = tile has been stripped bare. */
  resources?: ReadonlyMap<string, number>
}

/** Per-tile view merging baseline + override — the single source of truth. */
export interface TileView {
  readonly tileId:        number
  readonly elevation:     number
  /** Sol-layer resources on this tile (metals + minerals). */
  readonly solResources:  ReadonlyMap<string, number>
  /** Atmo-layer resources on this tile (gases). */
  readonly atmoResources: ReadonlyMap<string, number>
  /**
   * Merged view — sol entries take precedence over atmo on conflicting ids.
   * Kept for consumers that don't need per-layer granularity (dig, extraction).
   */
  readonly resources:     ReadonlyMap<string, number>
}

/** Event emitted whenever a tile changes (mutation, load, reset). */
export interface TileChangeEvent {
  tileId:  number
  /** Fields that actually changed, so UI doesn't over-render. */
  changed: ReadonlySet<'elevation' | 'resources'>
}

/** Serialised save payload — compact, seed-scoped. */
export interface PersistedBodyState {
  /** `BodyConfig.name` used to generate the body. Guards a mismatched restore. */
  configSeed: string
  overrides:  Array<[tileId: number, data: TileOverride]>
}

/** Listener signature for `subscribe`. */
export type TileChangeListener = (ev: TileChangeEvent) => void

// ── GameBodyState ────────────────────────────────────────────────────

export interface GameBodyState {
  /** Underlying lib body — rendering, raycasting, geometry. */
  readonly body: PlanetBody

  // Reading (merged baseline + override) ───────────────────────────
  getTile(tileId: number):                                            TileView | null
  getResourceAmount(tileId: number, resourceId: string):              number
  /** True when a tile has been mined down to the core (elevation 0). */
  isDestroyed(tileId: number):                                        boolean
  /**
   * Resolves the atmo-board tile resources for a given atmo tile id. Atmo
   * tiles live on a separate hexasphere from sol — the id is meaningful
   * only against `body.tiles.atmo.tiles`. Returns `null` when the body
   * carries no atmo board, an empty map when the tile exists but has no
   * resource distribution attached to it.
   */
  getAtmoTile(atmoTileId: number):                                    { resources: ReadonlyMap<string, number> } | null

  // Mutation (absolute writes, not deltas) ─────────────────────────
  /** Sets a tile's current elevation band. Mutates mesh geometry in place. */
  setElevation(tileId: number, elevation: number):                    void
  /**
   * Batch variant of {@link setElevation}: applies many elevation
   * updates in a single mesh / BVH-refit pass. Use this for any
   * operation that touches more than one tile at a time (digging,
   * scripted lift, …) — repeated single-tile calls trigger a per-tile
   * BVH refit and stutter visibly on dense bodies.
   */
  setElevations(updates: ReadonlyMap<number, number>):                void
  /** Sets resource amount on a tile. `amount <= 0` removes it from the map. */
  setResourceAmount(tileId: number, resourceId: string, amount: number): void
  /** Clears every resource on a tile — e.g. fully strip-mined. */
  clearResources(tileId: number):                                     void

  // Reactivity ─────────────────────────────────────────────────────
  subscribe(listener: TileChangeListener):                            () => void

  // Persistence ────────────────────────────────────────────────────
  serialize():                                PersistedBodyState
  /** Re-applies an external snapshot. No-op when `configSeed` mismatches. */
  restore(snapshot: PersistedBodyState):      void
  /** Drops every override, restoring the initial geological state. */
  reset():                                    void
}

// ── Factory ──────────────────────────────────────────────────────────

const EMPTY_RESOURCES: ReadonlyMap<string, number> = new Map()

/**
 * Builds a {@link GameBodyState} around a lib body.
 *
 * @param body             - Body handle returned by `useBody(...)`.
 * @param initialResources - Baseline distribution produced by the game's
 *                           generator — layered so sol and atmo resources
 *                           stay separate on every tile. Tiles without an
 *                           entry in either bucket are treated as empty.
 * @param snapshot         - Optional persisted payload to replay. Ignored
 *                           when its `configSeed` doesn't match the body.
 */
export function createGameBodyState(
  body:             PlanetBody,
  initialResources: LayeredDistribution,
  snapshot?:        PersistedBodyState,
): GameBodyState {
  const solInitial  = initialResources.sol
  const atmoInitial = initialResources.atmo
  const overrides = new Map<number, TileOverride>()
  const listeners = new Set<TileChangeListener>()

  // ── Internal helpers ─────────────────────────────────────────────

  function emit(tileId: number, changed: ReadonlySet<'elevation' | 'resources'>): void {
    if (listeners.size === 0) return
    const ev: TileChangeEvent = { tileId, changed }
    for (const l of listeners) l(ev)
  }

  /** Converts a band index to the world-space sol height expected by `updateTileSolHeight`. */
  function bandToWorldHeight(band: number): number {
    return resolveTileHeight(body.config, band, body.palette)
  }

  /** Pushes a batch of elevation mutations to the mesh in one call. */
  function applyHeights(updates: Map<number, number>): void {
    if (updates.size === 0) return
    const heights = new Map<number, number>()
    for (const [id, band] of updates) heights.set(id, bandToWorldHeight(band))
    body.tiles.sol.updateTileSolHeight(heights)
  }

  // ── Reading ──────────────────────────────────────────────────────

  function getTile(tileId: number): TileView | null {
    const base = body.sim.tileStates.get(tileId)
    if (!base) return null
    const override = overrides.get(tileId)
    const solResources  = solInitial.get(tileId)  ?? EMPTY_RESOURCES
    const atmoResources = atmoInitial.get(tileId) ?? EMPTY_RESOURCES
    // Merged view — sol entries win on conflicting ids. When an override has
    // written a bespoke resource map (dig / extraction), surface it verbatim
    // AS the merged map; per-layer buckets keep their baseline for now
    // (mutations target the merged view; layer-split mutation is a follow-up).
    const merged = override?.resources ?? (
      atmoResources.size === 0 ? solResources :
      solResources.size  === 0 ? atmoResources :
      (() => {
        const m = new Map<string, number>(atmoResources)
        for (const [id, v] of solResources) m.set(id, v)
        return m
      })()
    )
    return {
      tileId,
      elevation: override?.elevation ?? base.elevation,
      solResources,
      atmoResources,
      resources: merged,
    }
  }

  function getResourceAmount(tileId: number, resourceId: string): number {
    const view = getTile(tileId)
    if (!view) return 0
    return view.resources.get(resourceId) ?? 0
  }

  function isDestroyed(tileId: number): boolean {
    const view = getTile(tileId)
    return view?.elevation === 0
  }

  function getAtmoTile(atmoTileId: number): { resources: ReadonlyMap<string, number> } | null {
    if (!body.tiles.atmo) return null
    return { resources: atmoInitial.get(atmoTileId) ?? EMPTY_RESOURCES }
  }

  // ── Mutation ─────────────────────────────────────────────────────

  function setElevation(tileId: number, elevation: number): void {
    const view = getTile(tileId)
    if (!view || view.elevation === elevation) return
    const prev = overrides.get(tileId) ?? {}
    overrides.set(tileId, { ...prev, elevation })
    applyHeights(new Map([[tileId, elevation]]))
    emit(tileId, new Set(['elevation']))
  }

  function setElevations(updates: ReadonlyMap<number, number>): void {
    if (updates.size === 0) return
    const heights = new Map<number, number>()
    const touched: number[] = []
    for (const [id, elev] of updates) {
      const view = getTile(id)
      if (!view || view.elevation === elev) continue
      const prev = overrides.get(id) ?? {}
      overrides.set(id, { ...prev, elevation: elev })
      heights.set(id, elev)
      touched.push(id)
    }
    if (heights.size === 0) return
    // Single mesh / BVH-refit pass for the whole batch.
    applyHeights(heights)
    const elevSet: ReadonlySet<'elevation'> = new Set(['elevation'])
    for (const id of touched) emit(id, elevSet)
  }

  function setResourceAmount(tileId: number, resourceId: string, amount: number): void {
    const view = getTile(tileId)
    if (!view) return
    const current = view.resources
    if (amount <= 0 && !current.has(resourceId)) return
    const next = new Map(current)
    if (amount <= 0) next.delete(resourceId)
    else             next.set(resourceId, amount)
    const prev = overrides.get(tileId) ?? {}
    overrides.set(tileId, { ...prev, resources: next })
    emit(tileId, new Set(['resources']))
  }

  function clearResources(tileId: number): void {
    const view = getTile(tileId)
    if (!view || view.resources.size === 0) return
    const prev = overrides.get(tileId) ?? {}
    overrides.set(tileId, { ...prev, resources: new Map() })
    emit(tileId, new Set(['resources']))
  }

  // ── Reactivity ───────────────────────────────────────────────────

  function subscribe(listener: TileChangeListener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  // ── Persistence ──────────────────────────────────────────────────

  function serialize(): PersistedBodyState {
    const out: Array<[number, TileOverride]> = []
    for (const [id, data] of overrides) {
      // Clone so the caller can't mutate our internal state by writing into
      // the serialised shape (resources is a Map, elevation is a primitive).
      const cloned: TileOverride = {}
      if (data.elevation !== undefined) cloned.elevation = data.elevation
      if (data.resources !== undefined) cloned.resources = new Map(data.resources)
      out.push([id, cloned])
    }
    return { configSeed: body.config.name, overrides: out }
  }

  function restore(snap: PersistedBodyState): void {
    // Seed mismatch means the snapshot was built against a different body
    // (different noise field, different tile count). Silently ignore — the
    // caller is in charge of detecting this earlier if they want to warn.
    if (snap.configSeed !== body.config.name) return

    // Collect the tiles we're about to mutate BEFORE clearing so we can
    // reset any currently-overridden tile that isn't in the new snapshot.
    const previouslyElevated = new Set<number>()
    for (const [id, data] of overrides) {
      if (data.elevation !== undefined) previouslyElevated.add(id)
    }
    overrides.clear()

    const heights = new Map<number, number>()
    for (const [id, data] of snap.overrides) {
      const cloned: TileOverride = {}
      if (data.elevation !== undefined) cloned.elevation = data.elevation
      if (data.resources !== undefined) cloned.resources = new Map(data.resources)
      overrides.set(id, cloned)
      if (cloned.elevation !== undefined) heights.set(id, cloned.elevation)
    }

    // Restore baseline elevation for tiles we had overridden but the new
    // snapshot doesn't touch — otherwise the mesh keeps the old mutation.
    for (const id of previouslyElevated) {
      if (heights.has(id)) continue
      const base = body.sim.tileStates.get(id)
      if (base) heights.set(id, base.elevation)
    }

    applyHeights(heights)

    // Notify listeners: everything that changed (restored or re-reset).
    const touched = new Set<number>([...heights.keys(), ...snap.overrides.map(([id]) => id)])
    for (const id of touched) emit(id, new Set(['elevation', 'resources']))
  }

  function reset(): void {
    if (overrides.size === 0) return
    const heights = new Map<number, number>()
    const touched = new Set<number>()
    for (const [id, data] of overrides) {
      touched.add(id)
      if (data.elevation !== undefined) {
        const base = body.sim.tileStates.get(id)
        if (base) heights.set(id, base.elevation)
      }
    }
    overrides.clear()
    applyHeights(heights)
    for (const id of touched) emit(id, new Set(['elevation', 'resources']))
  }

  // ── Apply initial snapshot, if any ───────────────────────────────
  if (snapshot) restore(snapshot)

  return {
    body,
    getTile,
    getResourceAmount,
    isDestroyed,
    getAtmoTile,
    setElevation,
    setElevations,
    setResourceAmount,
    clearResources,
    subscribe,
    serialize,
    restore,
    reset,
  }
}
