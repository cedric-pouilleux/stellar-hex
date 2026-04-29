/**
 * Hex ice cap — stacked prisms covering submerged tiles when the body's
 * surface liquid is in the `frozen` state.
 *
 * Each input tile receives a hex prism whose **top** sits at a uniform
 * `topElevation` (the waterline) and whose **walls** start at the tile's
 * own `baseElevation` (the underlying mineral cap). The result is a
 * second hex layer stacked on top of the existing sol mesh, mineable
 * tile-by-tile via {@link SolidShellHandle.lowerTile} /
 * {@link SolidShellHandle.removeTile}: digging through the cap exposes
 * the original mineral tile beneath, exactly the gameplay primitive a
 * caller-side ice-mining flow wants.
 *
 * Substance-agnostic by design — the lib carries no concept of "ice" or
 * "water". The caller resolves the substance (h2o / ch4 / nh3 / n2 …),
 * picks its solid-phase tint, and pushes a single {@link SolidShellConfig.color}
 * value here. Multi-substance ice caps blend caller-side and present a
 * single dominant tint to this builder.
 *
 * Geometry is a single merged `BufferGeometry` so the shell costs **one**
 * draw call regardless of tile count. Per-tile mutations (mining) patch
 * the shared position buffer at the tile's known vertex range.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../../types/terrain.types'
import { buildHexShellGeometry, writeTilePrism } from './hexShellGeometry'

// ── Public types ──────────────────────────────────────────────────

/** Inputs for {@link buildSolidShell}. */
export interface SolidShellConfig {
  /** Tiles eligible for the cap — typically every tile below the waterline. */
  tiles:                readonly Tile[]
  /**
   * Per-tile underlying mineral elevation in band space. The cap's wall
   * starts here; the top sits at {@link topElevation}. Tiles missing from
   * the map are skipped.
   */
  baseElevation:        ReadonlyMap<number, number>
  /**
   * Uniform top elevation in band space — the waterline. Same value for
   * every cap tile so the surface reads as a sealed sheet. Fractional
   * values are linearly interpolated against {@link palette}.
   */
  topElevation:         number
  /**
   * Palette feeding the band → world-height conversion. Must be the same
   * palette the underlying sol mesh uses, otherwise the cap and the floor
   * separate. Heights are interpreted as offsets above {@link coreRadius}
   * (matching the lib's `terrainBandLayout` convention).
   */
  palette:              TerrainLevel[]
  /**
   * World-space surface radius of the body — equals `BodyConfig.radius`.
   * Required so the cap aligns with the underlying sol mesh, which is
   * extruded from `coreRadius` rather than the surface.
   */
  bodyRadius:           number
  /**
   * World-space radius of the inner core sphere — anchors `palette[0].height`.
   * Pass `body.config.radius * coreRatio` (or compute via `resolveCoreRadiusRatio`).
   */
  coreRadius:           number
  /** Resolved solid-phase tint (caller-owned chemistry). */
  color:                THREE.ColorRepresentation
  /** PBR roughness override. Defaults to a snowy matte (0.8). */
  roughness?:           number
  /** PBR metalness override. Defaults to 0 (non-metallic). */
  metalness?:           number
}

/** Handle returned by {@link buildSolidShell}. */
export interface SolidShellHandle {
  /** Root group — attach under the body's group. */
  group:    THREE.Group
  /** The merged ice mesh — single draw call, single material. */
  mesh:     THREE.Mesh
  /**
   * Per-triangle tile id lookup — `faceToTileId[faceIndex]` returns the
   * tile id whose ice prism owns the triangle. Lets callers pick which
   * frozen tile the user clicked on by raycasting against the cap mesh
   * directly (without going through the body's sol interactive layer).
   *
   * Triangles whose tile has been collapsed via {@link removeTile} keep
   * their entry: the lookup remains valid for the lifetime of the handle,
   * but the corresponding triangles are degenerate so the raycaster
   * naturally skips them.
   */
  faceToTileId: readonly number[]
  /**
   * Lowers the cap top of `tileId` by `bandsDelta` (must be ≥ 0). When the
   * new top reaches the tile's base, the prism collapses into a degenerate
   * shape (no fragments rendered). Returns the new band-space top, or
   * `undefined` if the tile was unknown / already collapsed.
   */
  lowerTile: (tileId: number, bandsDelta: number) => number | undefined
  /**
   * Collapses the cap over `tileId` entirely (equivalent to mining out the
   * full ice column). Idempotent.
   */
  removeTile: (tileId: number) => void
  /**
   * Re-elevates every still-standing prism to a new uniform top band
   * (band space). Already-collapsed tiles (those whose `lowerTile` /
   * `removeTile` brought them to base) are NOT re-extruded — they stay
   * mined out. Useful when a slider drives the canonical sea level and
   * the cap must follow without rebuilding the whole shell.
   */
  setTopElevation: (newTopBand: number) => void
  /**
   * Sets the cap material's alpha in `[0, 1]`. Values below `1` flip the
   * material to translucent; `1` restores opaque rendering. The handle
   * keeps `depthWrite` aligned with opacity so transparent caps don't
   * stomp over the underlying mineral floor sort order.
   */
  setOpacity: (alpha: number) => void
  /** Releases GPU resources. Called by the body's owning lifecycle. */
  dispose: () => void
}

// ── Builder ───────────────────────────────────────────────────────

/**
 * Builds the merged hex ice cap and returns a mining-aware handle.
 *
 * Tiles missing from `baseElevation`, or whose base is at or above
 * `topElevation`, are silently skipped (no contribution to the cap).
 * Empty input produces an empty mesh with a no-op handle so callers can
 * unconditionally instantiate.
 */
export function buildSolidShell(config: SolidShellConfig): SolidShellHandle {
  const {
    tiles, baseElevation, topElevation, palette, bodyRadius, coreRadius,
    color, roughness = 0.8, metalness = 0.0,
  } = config

  const group = new THREE.Group()
  group.name  = 'solid-shell'

  const shell = buildHexShellGeometry({
    tiles, baseElevation, topElevation, palette, bodyRadius, coreRadius,
  })

  // Empty cap: return a no-op handle with a hidden placeholder mesh so the
  // caller can unconditionally hold the handle without null-checks.
  if (!shell) {
    const empty   = new THREE.BufferGeometry()
    const mat     = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    const mesh    = new THREE.Mesh(empty, mat)
    mesh.visible  = false
    group.add(mesh)
    return {
      group, mesh,
      faceToTileId:    [],
      lowerTile:       () => undefined,
      removeTile:      () => { /* no-op */ },
      setTopElevation: () => { /* no-op */ },
      setOpacity:      () => { /* no-op */ },
      dispose() {
        empty.dispose()
        mat.dispose()
      },
    }
  }

  const { merged, slots, slotByTileId, faceToTileId, positionAttr, normalAttr, heightOffset, currentTopBand } = shell
  const positions = positionAttr.array as Float32Array
  const normals   = normalAttr.array   as Float32Array

  const material = new THREE.MeshStandardMaterial({
    color, roughness, metalness, side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(merged, material)
  mesh.name           = 'solid-shell-mesh'
  mesh.castShadow     = true
  mesh.receiveShadow  = true
  group.add(mesh)

  function setTileTop(tileId: number, newTopBand: number): number | undefined {
    const slot = slotByTileId.get(tileId)
    if (!slot) return undefined
    const clamped = Math.max(slot.baseBand, newTopBand)
    if (clamped === currentTopBand.get(tileId)) return clamped
    writeTilePrism(positions, normals, slot, clamped, palette, heightOffset)
    positionAttr.needsUpdate = true
    normalAttr.needsUpdate   = true
    currentTopBand.set(tileId, clamped)
    return clamped
  }

  return {
    group, mesh, faceToTileId,
    lowerTile(tileId, bandsDelta) {
      if (!(bandsDelta >= 0)) return undefined
      const cur = currentTopBand.get(tileId)
      if (cur === undefined) return undefined
      return setTileTop(tileId, cur - bandsDelta)
    },
    removeTile(tileId) {
      const slot = slotByTileId.get(tileId)
      if (!slot) return
      setTileTop(tileId, slot.baseBand)
    },
    setTopElevation(newTopBand) {
      let touched = false
      for (const slot of slots) {
        const cur = currentTopBand.get(slot.tile.id)
        if (cur === undefined || cur <= slot.baseBand) continue
        const clamped = Math.max(slot.baseBand, newTopBand)
        if (clamped === cur) continue
        writeTilePrism(positions, normals, slot, clamped, palette, heightOffset)
        currentTopBand.set(slot.tile.id, clamped)
        touched = true
      }
      if (touched) {
        positionAttr.needsUpdate = true
        normalAttr.needsUpdate   = true
      }
    },
    setOpacity(alpha) {
      const clamped = Math.max(0, Math.min(1, alpha))
      material.opacity     = clamped
      material.transparent = clamped < 1
      material.depthWrite  = clamped >= 1
      material.needsUpdate = true
    },
    dispose() {
      merged.dispose()
      material.dispose()
    },
  }
}
