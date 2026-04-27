import * as THREE from 'three'
import type { InteractiveMesh as LegacyInteractiveMesh } from './buildInteractiveMesh'

/**
 * Current raycast target resolved at query time. Lets callers swap the
 * geometry the hover query runs against (e.g. the layered mesh exposes
 * a sol-only proxy in surface view and an atmo-only proxy in atmosphere
 * view so `firstHitOnly` returns the right tile regardless of depth
 * order).
 */
export interface RaycastState {
  /**
   * Mesh the raycaster targets. Expected to carry an accelerated raycast
   * (see `accelerateRaycast`); the matrix is synced from the body group
   * on every query when the mesh is not mounted in the scene graph.
   */
  mesh:         THREE.Mesh
  /** Maps the hit `faceIndex` back to the original tile id. */
  faceToTileId: number[]
  /**
   * Local-space radius of the opaque inner core, used to reject hits the
   * user can't possibly see. A dug-out tile (no prism) is a window the
   * ray slips through, and without this guard the next triangle the BVH
   * returns can be an internal wall of a tile on the far side — a point
   * that is actually hidden behind the core mesh. Leave it at `0` for
   * bodies with no solid core (there is no occluder, so nothing to cull).
   */
  coreRadius:   number
}

/**
 * Activate / deactivate / hover-query helpers for a body's interactive hex
 * mesh. Built on top of any `InteractiveMesh`-shaped handle (legacy hex or
 * layered prism), so star + planet paths share the same controller surface.
 */
export interface InteractiveController {
  activateInteractive():   void
  deactivateInteractive(): void
  queryHover(raycaster: THREE.Raycaster): number | null
}

/** Optional knobs for {@link makeInteractiveController}. */
export interface InteractiveControllerOptions {
  /**
   * When `true` (default), the controller hot-swaps the smooth display
   * mesh for the interactive hex mesh on activate / deactivate (legacy
   * behaviour matching the star pipeline).
   *
   * When `false`, the smooth display mesh stays mounted in the group at
   * all times — the caller is responsible for piloting its
   * `mesh.visible` flag through the body's view machinery. Required when
   * the view layer needs the smooth sphere to remain in the scene graph
   * even while the interactive grid is active (e.g. gaseous bodies that
   * use the smooth sphere as a procedural-atmosphere backdrop behind
   * the playable sol hex grid).
   */
  manageDisplay?: boolean
}

/**
 * Builds the activate / deactivate / hover-query helpers shared by every
 * body type. Wires the smooth display mesh into a Three.js group, hot-swaps
 * it for the interactive hex mesh on activation (when `manageDisplay`),
 * and resolves raycaster hits back to tile ids.
 *
 * The raycast target is resolved through `getRaycastState` at every query,
 * so layered bodies can return a different mesh per view (sol / atmo) —
 * crucial for `firstHitOnly` BVH acceleration where the BVH only holds
 * the triangles of the currently-visible layer.
 *
 * @param group           - Parent group both meshes are mounted into.
 * @param displayMesh     - Smooth display mesh shown in nominal view.
 * @param getRaycastState - Resolves the current raycast mesh + face map.
 * @param interactive     - Interactive hex / layered mesh handle.
 * @param options         - Optional controller knobs (see {@link InteractiveControllerOptions}).
 */
export function makeInteractiveController(
  group:           THREE.Group,
  displayMesh:     THREE.Mesh,
  getRaycastState: () => RaycastState,
  interactive:     LegacyInteractiveMesh,
  options?:        InteractiveControllerOptions,
): InteractiveController {
  const manageDisplay = options?.manageDisplay ?? true
  let isInteractive   = false
  group.add(displayMesh)

  const _hits:   THREE.Intersection[] = []
  const _n       = new THREE.Vector3()
  const _center  = new THREE.Vector3()

  function activateInteractive(): void {
    if (manageDisplay) group.remove(displayMesh)
    group.add(interactive.group)
    interactive.setFill(true)
    isInteractive = true
  }

  function deactivateInteractive(): void {
    interactive.setHover(null)
    interactive.setFill(false)
    group.remove(interactive.group)
    if (manageDisplay) group.add(displayMesh)
    isInteractive = false
  }

  function queryHover(raycaster: THREE.Raycaster): number | null {
    if (!isInteractive) return null
    const { mesh: raycasterMesh, faceToTileId, coreRadius } = getRaycastState()
    // The proxy lives outside the scene graph (it is never rendered), so
    // its world matrix is copied from the body group each query. Skipping
    // this step means raycasting against the mesh's local frame — which is
    // the identity — and hits would always sit at the world origin.
    const raycastMeshIsChild = raycasterMesh.parent !== null
    if (raycastMeshIsChild) {
      group.updateWorldMatrix(true, true)
    } else {
      group.updateWorldMatrix(true, false)
      raycasterMesh.matrixWorld.copy(group.matrixWorld)
    }
    _center.setFromMatrixPosition(group.matrixWorld)

    // First-hit mode stops BVH traversal at the closest intersection, so
    // a ray that would otherwise collect dozens of hits on a dense hex
    // mesh returns a single triangle in sub-millisecond time. Combined
    // with the per-view raycast proxy it is both fast and correct: each
    // proxy holds only the triangles of the active layer, so "closest
    // hit" can never mean an atmo face occluding the sol the user sees.
    ;(raycaster as { firstHitOnly?: boolean }).firstHitOnly = true

    _hits.length = 0
    raycasterMesh.raycast(raycaster, _hits)
    if (_hits.length === 0) return null

    const rd = raycaster.ray.direction
    const h  = _hits[0]
    if (!h.face || h.faceIndex == null) return null
    // Back-face guard (camera clipping through the mesh): reject hits
    // whose face normal points along the ray rather than against it.
    // Cheap, runs on a single triangle.
    if (_n.copy(h.face.normal).transformDirection(raycasterMesh.matrixWorld).dot(rd) >= 0) return null
    // Far-hemisphere guard: the closest hit is always on the front hemisphere
    // in the normal case, but camera-inside-body corner cases would otherwise
    // leak through. Keeps no-core bodies safe from picking back tiles.
    const dx = h.point.x - _center.x
    const dy = h.point.y - _center.y
    const dz = h.point.z - _center.z
    if (dx * rd.x + dy * rd.y + dz * rd.z > 0) return null
    // Core-occlusion guard: a dug tile (no prism) is a hole the ray walks
    // through; it can then hit the inner wall of a neighbour tile on the
    // far side — geometrically a front-hemisphere hit, but visually hidden
    // behind the opaque core mesh. Ray-vs-sphere intersection on the core:
    // if the ray enters the core *before* reaching the hit, the hit is
    // occluded and we reject it. Skipped when `coreRadius === 0` (no core
    // rendered, nothing to occlude).
    if (coreRadius > 0) {
      const o   = raycaster.ray.origin
      const ocx = _center.x - o.x
      const ocy = _center.y - o.y
      const ocz = _center.z - o.z
      const tC  = ocx * rd.x + ocy * rd.y + ocz * rd.z
      const dSq = ocx * ocx + ocy * ocy + ocz * ocz - tC * tC
      const rSq = coreRadius * coreRadius
      if (dSq < rSq) {
        const tFront = tC - Math.sqrt(rSq - dSq)
        if (tFront > 0 && h.distance > tFront) return null
      }
    }

    return faceToTileId[h.faceIndex] ?? null
  }

  return { activateInteractive, deactivateInteractive, queryHover }
}
