/**
 * Atmosphere board mesh — playable hex grid floating above the sol surface.
 *
 * Built from a dedicated hexasphere (independent subdivision count from the
 * sol board), this mesh hosts the atmo gameplay: each tile is a flat
 * hex/pent prism spanning the radial slice
 * `[innerRadius, outerRadius]` (= `[solOuterRadius, atmoOuterRadius]`), all
 * tiles at the same height. The atmo board carries no elevation staircase
 * — it is purely a planar resource board, with a single colour per tile
 * driven by an off-lib resource overlay.
 *
 * Decoupled from the sol mesh by design: a sol tile id has no relation to
 * an atmo tile id, the two boards live on separate hexaspheres with their
 * own raycast targets. Mining "tile 42 atmo" is a strictly different
 * action from mining "tile 42 sol".
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../../geometry/hexasphere.types'
import { accelerateRaycast } from '../lighting/accelerateRaycast'
import { applyFlatLightingPatch } from '../lighting/flatLightingPatch'
import type { RaycastState } from '../body/interactiveController'
import type { RGB } from '../types/bodyHandle.types'

/** Per-tile vertex range in the merged board buffer. */
interface AtmoTileRange { start: number; count: number }

/** Inputs accepted by {@link buildAtmoBoardMesh}. */
export interface AtmoBoardMeshOptions {
  /** Atmosphere hexasphere tiles (own subdivision, ids unrelated to sol ids). */
  tiles:        readonly Tile[]
  /** Inner radius of the atmo prism band (= sol outer radius). */
  innerRadius:  number
  /** Outer radius of the atmo prism band (= body silhouette radius). */
  outerRadius:  number
  /** Initial vertex colour applied to every tile before any overlay. */
  defaultColor?: RGB
}

/**
 * Public handle returned by {@link buildAtmoBoardMesh}. Mirrors the surface
 * of the sol board's interactive mesh closely enough that the orchestrator
 * (`assemblePlanetSceneGraph` + view switcher) can route hover, paint and
 * raycast through the same state machine.
 */
export interface AtmoBoardMesh {
  /** Root group that mounts the atmo mesh into the body scene graph. */
  group:        THREE.Group
  /** Atmo tiles (re-export from input — convenience for downstream consumers). */
  tiles:        readonly Tile[]
  /** Toggles the board's visibility wholesale. */
  setVisible(visible: boolean):                                void
  /**
   * Forces the board material to render with flat (light-independent)
   * shading when enabled. Used by the playable atmosphere view so the
   * star's directional lighting doesn't hide tiles on the night side.
   */
  setFlatLighting(enabled: boolean):                           void
  /** Stamps a single tile's vertex colour. Silently skips unknown ids. */
  writeTileColor(tileId: number, rgb: RGB):                    void
  /** Bulk overlay — same effect as calling `writeTileColor` once per entry. */
  applyOverlay(colors: Map<number, RGB>):                      void
  /**
   * World-space top-cap centre of a tile (projected to `outerRadius`).
   * Returns `null` for unknown ids. Used by overlays that anchor markers
   * on the atmo board.
   */
  getTilePosition(tileId: number):                             THREE.Vector3 | null
  /** Resolves the raycast target for the atmo board (mesh + face → tile). */
  getRaycastState():                                           RaycastState
  /**
   * Runs a hover query against the atmo board's own BVH-accelerated mesh.
   * Returns the tile id under the ray, or `null` when the ray misses or
   * the board is hidden. The returned id is **only** comparable against
   * other atmo tile ids — atmo and sol live on independent hexaspheres,
   * so a sol id `42` and an atmo id `42` are unrelated.
   */
  queryHover(raycaster: THREE.Raycaster, parentGroup: THREE.Object3D): number | null
  /**
   * Highlights an atmo tile by overlaying a hover tint on top of its
   * current colour. Pass `null` to clear the highlight. The previous
   * colour is restored when the highlight clears or moves to another tile.
   * The hover tint is purely a vertex-colour overlay — no extra mesh.
   */
  setHover(tileId: number | null, tint?: RGB): void
  /** Releases the BVH and the merged geometry. Idempotent. */
  dispose():                                                   void
}

const DEFAULT_COLOR: RGB = { r: 0.5, g: 0.55, b: 0.7 }
const DEFAULT_HOVER_TINT: RGB = { r: 1.0, g: 0.9, b: 0.4 }

/** Projects a point on a sphere of given radius (preserves direction). */
function project(p: { x: number; y: number; z: number }, r: number): THREE.Vector3 {
  const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
  const s   = r / len
  return new THREE.Vector3(p.x * s, p.y * s, p.z * s)
}

function pushVec(arr: number[], v: THREE.Vector3): void {
  arr.push(v.x, v.y, v.z)
}

/**
 * Emits a single closed prism (top cap + walls + bottom cap) for one tile
 * into the shared attribute buffers. The bottom cap uses reversed winding
 * so its outward face points inward (toward the sphere centre) — always
 * back-face-culled from outside, never paints over the sol mesh below.
 */
function emitTilePrism(
  tile:      Tile,
  bottom:    number,
  top:       number,
  positions: number[],
  normals:   number[],
): number {
  const { centerPoint, boundary } = tile
  const n         = boundary.length
  const topNormal = new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z).normalize()
  const botNormal = topNormal.clone().negate()

  const topCenter = project(centerPoint, top)
  const botCenter = project(centerPoint, bottom)
  const topRing   = boundary.map(p => project(p, top))
  const botRing   = boundary.map(p => project(p, bottom))

  let written = 0

  // Top fan
  for (let i = 0; i < n; i++) {
    pushVec(positions, topCenter)
    pushVec(positions, topRing[i])
    pushVec(positions, topRing[(i + 1) % n])
    for (let k = 0; k < 3; k++) pushVec(normals, topNormal)
    written += 3
  }

  // Walls — CCW winding from outside so geometric normal points outward.
  for (let i = 0; i < n; i++) {
    const tA = topRing[i],     tB = topRing[(i + 1) % n]
    const bA = botRing[i],     bB = botRing[(i + 1) % n]
    const sideNormal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(bA, tA),
        new THREE.Vector3().subVectors(bB, tA),
      )
      .normalize()
    pushVec(positions, tA); pushVec(positions, bA); pushVec(positions, bB)
    pushVec(positions, tA); pushVec(positions, bB); pushVec(positions, tB)
    for (let k = 0; k < 6; k++) pushVec(normals, sideNormal)
    written += 6
  }

  // Bottom fan — reversed winding so outward face points inward.
  for (let i = 0; i < n; i++) {
    pushVec(positions, botCenter)
    pushVec(positions, botRing[(i + 1) % n])
    pushVec(positions, botRing[i])
    for (let k = 0; k < 3; k++) pushVec(normals, botNormal)
    written += 3
  }

  return written
}

/**
 * Builds the atmosphere board mesh from a dedicated hexasphere.
 *
 * The mesh is fully self-contained: own geometry, own BVH, own raycast
 * proxy. The orchestrator (`assemblePlanetSceneGraph`) mounts it on the
 * body group; the view switcher toggles its visibility against the sol
 * board.
 */
export function buildAtmoBoardMesh(options: AtmoBoardMeshOptions): AtmoBoardMesh {
  const { tiles, innerRadius, outerRadius } = options
  const defaultColor = options.defaultColor ?? DEFAULT_COLOR

  // ── Geometry merge ──────────────────────────────────────────────
  const pieces:       THREE.BufferGeometry[] = []
  const faceToTileId: number[]               = []
  const tileRange     = new Map<number, AtmoTileRange>()
  let vertexOffset    = 0

  for (const tile of tiles) {
    const positions: number[] = []
    const normals:   number[] = []
    const written  = emitTilePrism(tile, innerRadius, outerRadius, positions, normals)
    const piece    = new THREE.BufferGeometry()
    piece.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    piece.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
    pieces.push(piece)

    const faceCount = written / 3
    for (let f = 0; f < faceCount; f++) faceToTileId.push(tile.id)
    tileRange.set(tile.id, { start: vertexOffset, count: written })
    vertexOffset += written
  }

  const geometry = mergeGeometries(pieces)
  pieces.forEach(g => g.dispose())

  // Vertex colour buffer — one RGB triple per vertex, init to defaultColor.
  const totalVertices = vertexOffset
  const colors = new Float32Array(totalVertices * 3)
  for (let i = 0; i < totalVertices; i++) {
    colors[i * 3]     = defaultColor.r
    colors[i * 3 + 1] = defaultColor.g
    colors[i * 3 + 2] = defaultColor.b
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  // ── Material ────────────────────────────────────────────────────
  // Vanilla vertex-coloured PBR — opaque, FrontSide. The procedural look
  // (cloud bands, noise) is owned by the smooth-sphere atmo backdrop on
  // gas giants; the playable board reads as a solid resource grid.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.85,
    metalness:    0.0,
    side:         THREE.FrontSide,
  })
  const flatLighting = applyFlatLightingPatch(material)
  // Atmo board is only ever shown in the playable atmosphere view — keep
  // the flat-lighting override on by default so star-driven shading
  // never hides tiles on the night side, regardless of when (or if) the
  // view switcher fires.
  flatLighting.setFlatLighting(true)

  const mesh           = new THREE.Mesh(geometry, material)
  mesh.frustumCulled   = false
  mesh.renderOrder     = 0
  const releaseBVH     = accelerateRaycast(mesh)

  const group = new THREE.Group()
  group.add(mesh)

  // ── API ─────────────────────────────────────────────────────────
  function setVisible(visible: boolean): void {
    mesh.visible = visible
  }

  function writeTileColor(tileId: number, rgb: RGB): void {
    const range = tileRange.get(tileId)
    if (!range) return
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const arr       = colorAttr.array as Float32Array
    for (let v = 0; v < range.count; v++) {
      const i = (range.start + v) * 3
      arr[i]     = rgb.r
      arr[i + 1] = rgb.g
      arr[i + 2] = rgb.b
    }
    colorAttr.needsUpdate = true
  }

  function applyOverlay(colors: Map<number, RGB>): void {
    if (colors.size === 0) return
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const arr       = colorAttr.array as Float32Array
    for (const [tileId, rgb] of colors) {
      const range = tileRange.get(tileId)
      if (!range) continue
      for (let v = 0; v < range.count; v++) {
        const i = (range.start + v) * 3
        arr[i]     = rgb.r
        arr[i + 1] = rgb.g
        arr[i + 2] = rgb.b
      }
    }
    colorAttr.needsUpdate = true
  }

  function getTilePosition(tileId: number): THREE.Vector3 | null {
    const tile = tiles.find(t => t.id === tileId)
    if (!tile) return null
    return project(tile.centerPoint, outerRadius)
  }

  function getRaycastState(): RaycastState {
    // The sol mesh's core radius mask does not apply here: the atmo board
    // sits strictly outside the core sphere, so no hit can ever be hidden
    // behind the core mesh. Pass `0` to disable that guard in the
    // controller.
    return { mesh, faceToTileId, coreRadius: 0 }
  }

  // Reusable scratch objects for the raycast hot path — avoid per-query
  // allocations under hover-driven tick rates.
  const _hits:    THREE.Intersection[] = []
  const _faceN    = new THREE.Vector3()
  const _hitDir   = new THREE.Vector3()
  const _center   = new THREE.Vector3()

  // ── Hover state ──────────────────────────────────────────────
  // Save the original colour of the currently-hovered tile so we can
  // restore it on hover-out / hover-move. The buffer slice is captured
  // lazily (only the size of one tile's vertex span) to keep memory cheap.
  let hoverTileId: number | null = null
  let savedColors: Float32Array | null = null

  function setHover(tileId: number | null, tint: RGB = DEFAULT_HOVER_TINT): void {
    if (tileId === hoverTileId) return
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const arr       = colorAttr.array as Float32Array

    // Restore the previously hovered tile's original colour.
    if (hoverTileId !== null && savedColors) {
      const prevRange = tileRange.get(hoverTileId)
      if (prevRange) arr.set(savedColors, prevRange.start * 3)
    }

    hoverTileId = tileId
    savedColors = null

    if (tileId !== null) {
      const range = tileRange.get(tileId)
      if (range) {
        savedColors = arr.slice(range.start * 3, (range.start + range.count) * 3)
        for (let v = 0; v < range.count; v++) {
          const i = (range.start + v) * 3
          arr[i]     = tint.r
          arr[i + 1] = tint.g
          arr[i + 2] = tint.b
        }
      }
    }
    colorAttr.needsUpdate = true
  }

  function queryHover(raycaster: THREE.Raycaster, parentGroup: THREE.Object3D): number | null {
    if (!mesh.visible) return null
    parentGroup.updateWorldMatrix(true, false)
    mesh.matrixWorld.copy(parentGroup.matrixWorld)
    _center.setFromMatrixPosition(parentGroup.matrixWorld)

    ;(raycaster as { firstHitOnly?: boolean }).firstHitOnly = true

    _hits.length = 0
    mesh.raycast(raycaster, _hits)
    if (_hits.length === 0) return null

    const rd = raycaster.ray.direction
    const h  = _hits[0]
    if (!h.face || h.faceIndex == null) return null
    // Back-face guard.
    if (_faceN.copy(h.face.normal).transformDirection(mesh.matrixWorld).dot(rd) >= 0) return null
    // Far-hemisphere guard — closest hit must sit on the front hemisphere.
    _hitDir.copy(h.point).sub(_center)
    if (_hitDir.dot(rd) > 0) return null

    return faceToTileId[h.faceIndex] ?? null
  }

  function dispose(): void {
    releaseBVH()
    geometry.dispose()
    material.dispose()
  }

  return {
    group,
    tiles,
    setVisible,
    setFlatLighting: flatLighting.setFlatLighting,
    writeTileColor,
    applyOverlay,
    getTilePosition,
    getRaycastState,
    queryHover,
    setHover,
    dispose,
  }
}
