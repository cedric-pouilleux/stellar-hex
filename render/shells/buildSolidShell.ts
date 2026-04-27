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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../../types/terrain.types'
import { buildPrismGeometry } from '../hex/hexPrismGeometry'

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

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Linearly interpolates between palette band heights so a fractional band
 * resolves to a smooth world-space height. Out-of-range bands clamp.
 */
function bandToWorldHeight(band: number, palette: TerrainLevel[]): number {
  const N = palette.length
  if (N === 0) return 0
  const clamped = Math.max(0, Math.min(N - 1, band))
  const lo = Math.floor(clamped)
  const hi = Math.min(N - 1, lo + 1)
  const frac = clamped - lo
  return palette[lo].height + (palette[hi].height - palette[lo].height) * frac
}

/** Vertex range in the merged buffer for a single tile. */
interface TileSlot {
  tile:     Tile
  baseBand: number
  start:    number
  count:    number
}

/**
 * Re-extrudes the prism geometry of a tile into the shared position
 * buffer at the tile's known vertex range. Used both at build time (full
 * extrusion) and at runtime (`lowerTile` / `removeTile`).
 *
 * When `topBand <= baseBand` the prism is fully collapsed: every vertex
 * of the slot range — top cap AND walls — is forced onto the tile's base
 * centre point. All triangles thus degenerate (zero-area), the GPU drops
 * them at primitive-assembly time, and the raycaster never hits them.
 * This is what makes a `removeTile`d cap actually disappear (a partial
 * collapse leaves the flat top cap hexagon floating at base height —
 * exactly the artefact users see when "the destroyed tile keeps its
 * top face").
 *
 * `heightOffset` shifts every band height to the absolute world frame
 * `buildPrismGeometry` expects (`tileLen + delta`). The lib's sol mesh
 * extrudes from `coreRadius`, but `buildPrismGeometry` extrudes from the
 * tile's own length (= `bodyRadius`), so we add `coreRadius - bodyRadius`
 * to land on the same anchor as the underlying floor.
 */
function writeTilePrism(
  positions:    Float32Array,
  normals:      Float32Array,
  slot:         TileSlot,
  topBand:      number,
  palette:      TerrainLevel[],
  heightOffset: number,
): void {
  const baseHeight = bandToWorldHeight(slot.baseBand, palette)             + heightOffset
  const clampedTop = Math.max(slot.baseBand, topBand)
  const topHeight  = bandToWorldHeight(clampedTop, palette) + heightOffset

  // Fully-collapsed slot: every vertex of the slot collapses onto the
  // tile's base centre point. The top cap, the walls — everything goes
  // there. Result: every triangle is a 0-area degenerate, no fragments,
  // no raycast hit, no visible artefact.
  if (clampedTop <= slot.baseBand) {
    const c   = slot.tile.centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1
    const scale = (len + baseHeight) / len
    const cx = c.x * scale
    const cy = c.y * scale
    const cz = c.z * scale
    const nx = c.x / len
    const ny = c.y / len
    const nz = c.z / len
    const start = slot.start * 3
    const end   = (slot.start + slot.count) * 3
    for (let i = start; i < end; i += 3) {
      positions[i]     = cx
      positions[i + 1] = cy
      positions[i + 2] = cz
      normals[i]       = nx
      normals[i + 1]   = ny
      normals[i + 2]   = nz
    }
    return
  }

  // Standing prism — full top cap + walls.
  const geo = buildPrismGeometry(slot.tile, topHeight, baseHeight)
  const src = geo.getAttribute('position').array as Float32Array
  const nrm = geo.getAttribute('normal').array   as Float32Array

  positions.set(src, slot.start * 3)
  normals.set(nrm, slot.start * 3)

  // `buildPrismGeometry` skips the wall vertices when the resulting
  // prism is degenerate. Because `clampedTop > slot.baseBand` here, this
  // branch normally produces the full vertex set (top + walls), but a
  // micro-thin prism could still emit fewer vertices than the slot
  // allocated at build time. Pad any unused tail with the base centre
  // so leftover triangles stay degenerate.
  const writtenFloats = src.length
  const totalFloats   = slot.count * 3
  if (writtenFloats < totalFloats) {
    const c   = slot.tile.centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1
    const scale = (len + baseHeight) / len
    const cx = c.x * scale
    const cy = c.y * scale
    const cz = c.z * scale
    const start = slot.start * 3 + writtenFloats
    const end   = (slot.start + slot.count) * 3
    for (let i = start; i < end; i += 3) {
      positions[i]     = cx
      positions[i + 1] = cy
      positions[i + 2] = cz
      normals[i]       = c.x / len
      normals[i + 1]   = c.y / len
      normals[i + 2]   = c.z / len
    }
  }

  geo.dispose()
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
    tiles,
    baseElevation,
    topElevation,
    palette,
    bodyRadius,
    coreRadius,
    color,
    roughness = 0.8,
    metalness = 0.0,
  } = config

  // Sol mesh extrudes from coreRadius, prismGeometry extrudes from the
  // tile's own length (== bodyRadius). The offset bridges the two so the
  // cap walls meet the underlying mineral cap exactly.
  const heightOffset = coreRadius - bodyRadius

  // Filter eligible tiles + bake initial prism geometries. Skipping
  // happens here so the rest of the builder works with a packed list.
  const slots:      TileSlot[]            = []
  const geometries: THREE.BufferGeometry[] = []
  const slotByTileId = new Map<number, TileSlot>()
  const currentTopBand = new Map<number, number>()

  let vertexOffset = 0
  for (const tile of tiles) {
    const base = baseElevation.get(tile.id)
    if (base === undefined) continue
    if (base >= topElevation)  continue   // no room for ice above

    const baseHeight = bandToWorldHeight(base, palette)         + heightOffset
    const topHeight  = bandToWorldHeight(topElevation, palette) + heightOffset
    const geo        = buildPrismGeometry(tile, topHeight, baseHeight)
    const count      = geo.getAttribute('position').count

    const slot: TileSlot = { tile, baseBand: base, start: vertexOffset, count }
    slots.push(slot)
    slotByTileId.set(tile.id, slot)
    currentTopBand.set(tile.id, topElevation)
    geometries.push(geo)
    vertexOffset += count
  }

  const group = new THREE.Group()
  group.name  = 'solid-shell'

  // Empty cap: return a no-op handle with a hidden placeholder mesh so the
  // caller can unconditionally hold the handle without null-checks.
  if (geometries.length === 0) {
    const empty   = new THREE.BufferGeometry()
    const mat     = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    const mesh    = new THREE.Mesh(empty, mat)
    mesh.visible  = false
    group.add(mesh)
    return {
      group,
      mesh,
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

  const merged = mergeGeometries(geometries)
  geometries.forEach(g => g.dispose())

  // Build the face → tile id lookup in lockstep with the merge order. Each
  // triangle is 3 contiguous vertices in a non-indexed buffer, so a slot
  // contributing `count` vertices owns `count / 3` consecutive faces.
  const faceToTileId: number[] = []
  for (const slot of slots) {
    const faces = slot.count / 3
    for (let f = 0; f < faces; f++) faceToTileId.push(slot.tile.id)
  }

  const positions = merged.getAttribute('position').array as Float32Array
  const normals   = merged.getAttribute('normal').array   as Float32Array
  const positionAttr = merged.getAttribute('position') as THREE.BufferAttribute
  const normalAttr   = merged.getAttribute('normal')   as THREE.BufferAttribute

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    side: THREE.FrontSide,
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
    group,
    mesh,
    faceToTileId,
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
      // Re-extrude every standing prism so the cap surface tracks a moving
      // sea level (driven by an external sea-level slider on the caller).
      // Tiles already mined to their base stay collapsed.
      let touched = false
      for (const slot of slots) {
        const cur = currentTopBand.get(slot.tile.id)
        if (cur === undefined || cur <= slot.baseBand) continue   // collapsed → keep
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
