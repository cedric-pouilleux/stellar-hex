import { createObservable, type MutableObservable } from '../core/observable'
import type { TileResources } from './TileState'

// ── Types ─────────────────────────────────────────────────────────

/**
 * Logical layer of a body.
 *   surface — single-layer bodies (rocky, icy, etc.)
 *   gas     — gaseous planet atmospheric tiles
 *   core    — gaseous planet inner rocky core tiles
 * Required to disambiguate tileId collisions between the two sims of a
 * gaseous planet (both use tileIds 0..n).
 */
export type BodyLayer = 'surface' | 'gas' | 'core'

/** Mutable resource concentrations for a single tile (0..1 per resource). */
type TileConcentrations = Map<string, number>

/** Per-layer bucket of tile-scoped state. */
interface LayerBucket {
  concentrations: Map<number, TileConcentrations>
  initial:        Map<number, ReadonlyMap<string, number>>
  initialSets:    Map<number, ReadonlySet<string>>
  tileIds:        number[]
  /**
   * Resources temporarily set aside via {@link suspendResource}. Values
   * stored here are not visible through getConcentration — the live
   * concentration reads 0 while suspended, and restoreResource() revives
   * the stashed amount when the suspension ends.
   */
  suspended:      Map<number, TileConcentrations>
}

// ── Singleton mutable state ───────────────────────────────────────

/**
 * Three-level nesting: bodyIndex → layer → tileId.
 * Two sims of the same gaseous planet (gas + core) share a bodyIndex but
 * live under distinct layer keys so their tileId sequences never clash.
 */
const _bodies: Map<number, Map<BodyLayer, LayerBucket>> = new Map()

/**
 * Framework-agnostic monotonic counter — incremented on every write
 * (deplete / regenerate / drainTile). Subscribers are notified synchronously.
 *
 * Vue consumers must import the reactive `depletionVersion` Ref from
 * `./useDepletionVersion.ts` so that `computed()` / `watch()` establish
 * proper reactive dependencies.
 */
export const depletionObservable: MutableObservable<number> = createObservable(0)

// ── Internal helpers ──────────────────────────────────────────────

function getBucket(bodyIndex: number, layer: BodyLayer): LayerBucket | undefined {
  return _bodies.get(bodyIndex)?.get(layer)
}

function ensureBucket(bodyIndex: number, layer: BodyLayer): LayerBucket {
  let byLayer = _bodies.get(bodyIndex)
  if (!byLayer) { byLayer = new Map(); _bodies.set(bodyIndex, byLayer) }
  let bucket = byLayer.get(layer)
  if (!bucket) {
    bucket = { concentrations: new Map(), initial: new Map(), initialSets: new Map(), tileIds: [], suspended: new Map() }
    byLayer.set(layer, bucket)
  }
  return bucket
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Initialises the depletion layer for all tiles of a planet layer.
 * Non-destructive per (body, layer): tiles already tracked retain their
 * current concentrations. To reset, call resetDepletion() first.
 *
 * @param tileIds    - Ordered list of tile IDs to register (from BodySimulation.tileStates.keys()).
 * @param resourceMap - Initial resource concentrations per tile (from BodySimulation.resourceMap).
 * @param bodyIndex  - Body index used to scope the tile data.
 * @param layer      - Body layer being initialised. Defaults to 'surface'.
 */
export function initDepletion(
  tileIds:     readonly number[],
  resourceMap: ReadonlyMap<number, TileResources>,
  bodyIndex:   number,
  layer:       BodyLayer = 'surface',
): void {
  const bucket = ensureBucket(bodyIndex, layer)
  const ids: number[] = []

  for (const tileId of tileIds) {
    ids.push(tileId)

    if (!bucket.concentrations.has(tileId)) {
      const resources = resourceMap.get(tileId) ?? new Map<string, number>()
      const map: TileConcentrations = new Map()
      for (const [res, val] of resources) map.set(res, val)
      bucket.concentrations.set(tileId, map)
      bucket.initialSets.set(tileId, new Set(resources.keys()))
      bucket.initial.set(tileId, new Map(resources))
    }
  }

  bucket.tileIds = ids
}

/**
 * Returns the tile IDs registered for a specific body layer.
 * Returns an empty array if the (body, layer) was never registered.
 *
 * @param bodyIndex - Target body index.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function getBodyTileIds(bodyIndex: number, layer: BodyLayer = 'surface'): readonly number[] {
  return getBucket(bodyIndex, layer)?.tileIds ?? []
}

/**
 * Returns true when the depletion layer has an entry for this tile.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function hasDepletionEntry(
  bodyIndex: number,
  tileId:    number,
  layer:     BodyLayer = 'surface',
): boolean {
  return getBucket(bodyIndex, layer)?.concentrations.has(tileId) ?? false
}

/**
 * Returns true when the tile originally had the given resource at init.
 * Stays true even after the resource has been fully depleted.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to check.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function hadInitialResource(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): boolean {
  return getBucket(bodyIndex, layer)?.initialSets.get(tileId)?.has(resource) ?? false
}

/**
 * Returns the initial (pre-depletion) concentration of a resource on a tile.
 * Returns 0 if the body, tile or resource is unknown.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to query.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function getInitialConcentration(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): number {
  return getBucket(bodyIndex, layer)?.initial.get(tileId)?.get(resource) ?? 0
}

/**
 * Returns the current concentration of a resource on a tile.
 * Returns 0 if the body, tile or resource is unknown.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to query.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function getConcentration(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): number {
  return getBucket(bodyIndex, layer)?.concentrations.get(tileId)?.get(resource) ?? 0
}

/**
 * Returns all current concentrations for a tile.
 * Returns an empty map if the body or tile is unknown.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function getAllConcentrations(
  bodyIndex: number,
  tileId:    number,
  layer:     BodyLayer = 'surface',
): ReadonlyMap<string, number> {
  return getBucket(bodyIndex, layer)?.concentrations.get(tileId) ?? new Map()
}

/**
 * Depletes a resource on a tile by the given amount, clamped to [0, current].
 * Returns the actual amount depleted.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to deplete.
 * @param amount    - Amount to remove (>0).
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function deplete(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  amount:    number,
  layer:     BodyLayer = 'surface',
): number {
  const tile = getBucket(bodyIndex, layer)?.concentrations.get(tileId)
  if (!tile) return 0

  const current  = tile.get(resource) ?? 0
  const actual   = Math.min(amount, current)
  const newValue = current - actual

  if (newValue <= 0) tile.delete(resource)
  else               tile.set(resource, newValue)

  depletionObservable.value++
  return actual
}

/**
 * Regenerates a resource on a tile by the given amount, capped at its
 * initial concentration. No-op when already at full or when the tile is
 * unknown. Returns the actual amount regenerated.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to regenerate.
 * @param amount    - Amount to restore (>0).
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function regenerate(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  amount:    number,
  layer:     BodyLayer = 'surface',
): number {
  const bucket  = getBucket(bodyIndex, layer)
  const tile    = bucket?.concentrations.get(tileId)
  const initial = bucket?.initial.get(tileId)?.get(resource) ?? 0

  if (!tile || initial <= 0) return 0

  const current = tile.get(resource) ?? 0
  if (current >= initial) return 0

  const actual   = Math.min(amount, initial - current)
  const newValue = current + actual

  tile.set(resource, newValue)
  depletionObservable.value++
  return actual
}

/**
 * Immediately drains all resources from a tile to zero.
 * Returns a snapshot of what was removed, keyed by string.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function drainTile(
  bodyIndex: number,
  tileId:    number,
  layer:     BodyLayer = 'surface',
): Map<string, number> {
  const tile    = getBucket(bodyIndex, layer)?.concentrations.get(tileId)
  const drained = new Map<string, number>()

  if (!tile) return drained

  for (const [res, val] of tile) {
    if (val > 0) drained.set(res, val)
  }

  tile.clear()
  depletionObservable.value++
  return drained
}

/**
 * Returns true when every resource on this tile has reached zero, or when
 * the tile has no resources at all.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function isFullyDepleted(
  bodyIndex: number,
  tileId:    number,
  layer:     BodyLayer = 'surface',
): boolean {
  const tile = getBucket(bodyIndex, layer)?.concentrations.get(tileId)
  if (!tile) return true
  return tile.size === 0
}

/**
 * Suspends a resource on a tile: moves its current concentration into a
 * side storage, zeroing the live value. No-op if already suspended or if
 * the resource is not present.
 *
 * The stashed amount is preserved so {@link restoreResource} can revive it
 * when the suspension ends. Useful whenever a caller needs to temporarily
 * hide a resource from simulation reads without losing its value.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to suspend.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function suspendResource(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): void {
  const bucket = getBucket(bodyIndex, layer)
  if (!bucket) return

  const tile = bucket.concentrations.get(tileId)
  if (!tile) return

  // Already suspended — leave the stash untouched
  let stash = bucket.suspended.get(tileId)
  if (stash?.has(resource)) return

  const current = tile.get(resource) ?? 0
  if (!stash) { stash = new Map(); bucket.suspended.set(tileId, stash) }
  stash.set(resource, current)

  tile.delete(resource)
  depletionObservable.value++
}

/**
 * Restores a previously suspended resource to its live concentration.
 * The restored value is capped at the initial concentration in case the
 * initial value was lowered (shouldn't happen, but stays safe). No-op if
 * nothing is suspended for this tile/resource.
 *
 * @param bodyIndex - Target body index.
 * @param tileId    - Target tile id.
 * @param resource  - Resource type to restore.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function restoreResource(
  bodyIndex: number,
  tileId:    number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): void {
  const bucket = getBucket(bodyIndex, layer)
  if (!bucket) return

  const stash = bucket.suspended.get(tileId)
  if (!stash?.has(resource)) return

  const stashed = stash.get(resource) ?? 0
  stash.delete(resource)
  if (stash.size === 0) bucket.suspended.delete(tileId)

  const tile = bucket.concentrations.get(tileId)
  if (!tile) return

  const initial = bucket.initial.get(tileId)?.get(resource) ?? 0
  const revived = Math.min(stashed, initial)
  if (revived > 0) tile.set(resource, revived)
  depletionObservable.value++
}

/**
 * Returns the summed concentration of a resource across every tile of a body
 * layer. Useful for planet-scoped totals.
 *
 * @param bodyIndex - Target body index.
 * @param resource  - Resource type to sum.
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function getBodyResourceTotal(
  bodyIndex: number,
  resource:  string,
  layer:     BodyLayer = 'surface',
): number {
  const bucket = getBucket(bodyIndex, layer)
  if (!bucket) return 0
  let total = 0
  for (const tile of bucket.concentrations.values()) {
    total += tile.get(resource) ?? 0
  }
  return total
}

/**
 * Depletes a resource across a body by distributing the requested amount
 * over tiles proportionally to their current concentration. Returns the
 * actual amount removed — may be less than `amount` if total stock is
 * insufficient. Touches `depletionVersion` once per affected tile.
 *
 * @param bodyIndex - Target body index.
 * @param resource  - Resource type to drain.
 * @param amount    - Total amount to remove across the body (>0).
 * @param layer     - Body layer. Defaults to 'surface'.
 */
export function depleteBodyResource(
  bodyIndex: number,
  resource:  string,
  amount:    number,
  layer:     BodyLayer = 'surface',
): number {
  if (amount <= 0) return 0
  const bucket = getBucket(bodyIndex, layer)
  if (!bucket) return 0

  // Two-pass proportional drain: gather totals first, then remove.
  let total = 0
  for (const tile of bucket.concentrations.values()) total += tile.get(resource) ?? 0
  if (total <= 0) return 0

  const toRemove = Math.min(amount, total)
  const ratio = toRemove / total

  for (const [, tile] of bucket.concentrations) {
    const current = tile.get(resource) ?? 0
    if (current <= 0) continue
    const take = current * ratio
    const next = current - take
    if (next <= 1e-9) tile.delete(resource)
    else              tile.set(resource, next)
  }

  depletionObservable.value++
  return toRemove
}

/**
 * Resets the entire depletion layer.
 * Call when the solar system is rerolled.
 */
export function resetDepletion(): void {
  _bodies.clear()
}
