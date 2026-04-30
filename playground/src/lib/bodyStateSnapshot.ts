/**
 * Body-state snapshot — captures the playground-side mutable state of the
 * active body (dig overrides + ice column heights) so a `useBody` rebuild
 * can replay it on the freshly built body.
 *
 * Without this layer, every reactive mutation on `bodyConfig` that flips
 * `rebuildKey` (palette anchors, noise knobs, liquid color, …) wipes the
 * user's carved craters and retracted ice caps. The snapshot lives entirely
 * playground-side: it composes the lib's existing public surface
 * ({@link GameBodyState.serialize} + {@link SolidShellHandle.lowerTile}
 * primitives) without touching the lib API.
 *
 * Topology fingerprint guards the replay — restoring dig overrides onto a
 * body whose subdivisions changed would map tile id 7 onto a different hex.
 * The fingerprint covers the inputs of `tileSizeToSubdivisions`:
 * `(type, radius, tileSize, atmoFraction)`. The seed (`name`) is delegated
 * to {@link GameBodyState.restore}'s built-in seed guard so renaming the
 * body still drops the dig (deliberate "new world" intent).
 */

import { resolveAtmosphereThickness, type BodyConfig } from '@lib'
import type { GameBodyState, PersistedBodyState } from '../game/GameBodyState'

/** Per-tile ice column entry — mirrors HexaPane's `iceColumns` map shape. */
export interface IceColumnSnapshot {
  readonly tileId: number
  /** Current cap top in band space. Equals `base` when the cap was fully consumed. */
  readonly top:    number
  /** Underlying sol elevation when the cap was first extruded. */
  readonly base:   number
}

/**
 * Inputs to `tileSizeToSubdivisions(solRefRadius, tileSize)` — when these
 * match between two `useBody` invocations, the resulting hexasphere has
 * the same tile count and tile ids are stable.
 */
export interface BodyTopology {
  readonly type:         BodyConfig['type']
  readonly radius:       number
  readonly tileSize:     number
  readonly atmoFraction: number
}

export interface BodyStateSnapshot {
  readonly topology: BodyTopology
  readonly game:     PersistedBodyState
  readonly ice:      readonly IceColumnSnapshot[]
}

/** Topology fingerprint of a config + tileSize pair. */
export function captureBodyTopology(config: BodyConfig, tileSize: number): BodyTopology {
  return {
    type:         config.type,
    radius:       config.radius,
    tileSize,
    atmoFraction: resolveAtmosphereThickness(config),
  }
}

/**
 * Captures the mutable per-tile state of the running body — dig overrides
 * via `gameState.serialize()` and the active ice column heights as a frozen
 * array. The topology fingerprint is stamped from the body's current config
 * so the replay-side guard can compare apples to apples.
 */
export function captureBodyStateSnapshot(
  gameState:  GameBodyState,
  iceColumns: ReadonlyMap<number, { top: number; base: number }>,
  config:     BodyConfig,
  tileSize:   number,
): BodyStateSnapshot {
  const ice: IceColumnSnapshot[] = []
  for (const [tileId, col] of iceColumns) {
    ice.push({ tileId, top: col.top, base: col.base })
  }
  return {
    topology: captureBodyTopology(config, tileSize),
    game:     gameState.serialize(),
    ice,
  }
}

/**
 * Returns `true` iff the snapshot was captured against a body whose
 * subdivisions match the new (config, tileSize) pair. When `false`, tile
 * ids are unstable and the caller MUST drop the snapshot rather than
 * replaying it onto a mismatched topology.
 */
export function isTopologyCompatible(
  snapshot: BodyStateSnapshot | null | undefined,
  config:   BodyConfig,
  tileSize: number,
): snapshot is BodyStateSnapshot {
  if (!snapshot) return false
  const next = captureBodyTopology(config, tileSize)
  const prev = snapshot.topology
  return prev.type         === next.type
      && prev.radius       === next.radius
      && prev.tileSize     === next.tileSize
      && prev.atmoFraction === next.atmoFraction
}

/** Minimal solid-shell surface needed to replay a snapshot — keeps this
 *  module decoupled from the full `SolidShellHandle` import. */
export interface SolidShellAdjuster {
  lowerTile(tileId: number, bandsDelta: number): unknown
  removeTile(tileId: number): void
}

/**
 * Replays an ice-column snapshot onto a freshly rebuilt body whose default
 * caps stand at uniform `defaultTop`. For each snapshot entry:
 *
 *   - If the cap was fully consumed (`top === base`) the prism is removed.
 *   - If the cap was partially mined (`base < top < defaultTop`) the prism
 *     is lowered by the consumed delta.
 *   - If the snapshot top is at or above `defaultTop` (no mining happened
 *     since the cap was last extruded) the default state is correct as-is.
 *
 * Mutates `iceColumns` in place so the playground's per-tile bookkeeping
 * tracks the visual state of the shell.
 */
export function replayIceColumns(
  snapshot:    readonly IceColumnSnapshot[],
  iceColumns:  Map<number, { top: number; base: number }>,
  solidShell:  SolidShellAdjuster | null,
  defaultTop:  number,
): void {
  for (const entry of snapshot) {
    const live = iceColumns.get(entry.tileId)
    if (!live) continue
    if (entry.top <= entry.base) {
      solidShell?.removeTile(entry.tileId)
      live.top = live.base
      continue
    }
    if (entry.top >= defaultTop) continue
    const consumed = defaultTop - entry.top
    solidShell?.lowerTile(entry.tileId, consumed)
    live.top = entry.top
  }
}
