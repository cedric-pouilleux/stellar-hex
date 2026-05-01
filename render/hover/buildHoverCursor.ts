/**
 * Unified hover cursor — one primitive that paints a hovered tile across
 * the three boards (sol, liquid, atmo).
 *
 * Two independently-togglable visual primitives share the same dispatch:
 *
 *   - **Ring**     : pre-allocated quad-strip border tracing the tile's
 *                    boundary; placed on the layer's cap top, plus an
 *                    optional seabed twin (`floorRing`) on liquid hovers.
 *   - **Emissive** : `THREE.PointLight` repositioned at mid-prism so the
 *                    glow reaches a few neighbour rings without baking
 *                    shadows. Single light, reused across hovers.
 *
 * The geometry per layer comes from caller-provided ports — the cursor
 * itself never reads sim state nor hexasphere caches, so the primitive
 * stays decoupled from the orchestrator's internals.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { HoverCursorConfig } from '../types/hoverCursor.types'
import type {
  BoardTileRef,
  HoverPlacementOptions,
  InteractiveLayer,
} from '../types/bodyHandle.types'
import type { HoverChannel } from '../state/hoverState'
import type { HoverListener } from '../hex/hexMeshShared'
import { buildTileRing, buildBorderPositions } from '../hex/hexTileGeometry'

/**
 * Border width as a fraction of a tile's average boundary radius. Tuned
 * to match the legacy mesh's visual stroke (~3-4 px at typical zoom).
 */
const BORDER_WIDTH = 0.15

/**
 * Pre-allocated buffer capacity — sized for the worst case (a hex tile,
 * 6 edges × 2 triangles × 3 vertices × 3 floats). Pentagon tiles use less
 * and have their tail masked off via `setDrawRange`.
 */
const MAX_BORDER_FLOATS = 6 * 2 * 3 * 3

/**
 * Floor-ring opacity forced on liquid hovers. The seabed outline reads as
 * a discreet hint sitting under the waterline cap ring, not a primary
 * focus — keeping it low-opacity prevents the underwater detail from
 * being drowned by the highlight.
 */
const LIQUID_FLOOR_RING_OPACITY = 0.20

/**
 * Floor-ring tint applied when the hovered ocean tile sits over a fully
 * mined-out core window (no seabed prism — the core sphere is the floor).
 * Visually warns the player that the ocean has no solid bottom here.
 */
const CORE_WINDOW_FLOOR_RING_COLOR = new THREE.Color(0xff2200)

/** Per-layer geometry resolver — caller-side, no sim coupling. */
export interface LayerCursorPort {
  /** Tile lookup on the layer's hexasphere. Returns `null` for unknown ids. */
  getTile(tileId: number): Tile | null
  /**
   * World radius of the tile's visible top (sol cap, waterline, atmo cap).
   * Drives ring placement.
   */
  getCapRadius(tileId: number): number
  /**
   * World radius of the prism floor (sol: core, liquid: seabed, atmo:
   * solOuter). Drives the light position (mid-prism) and the floor
   * ring's seabed placement on liquid hovers. Falls back to the cap
   * when omitted — the light then sits flush on the cap top.
   */
  getFloorRadius?(tileId: number): number
}

/**
 * Liquid layer carries a "core window" guard so the floor ring can be
 * tinted red when the underlying sol has been mined to the core (the
 * ocean tile has no solid floor at this spot).
 */
export interface LiquidCursorPort extends LayerCursorPort {
  /** True when the underlying sol is dug to the core (no seabed prism). */
  isCoreWindow(tileId: number): boolean
}

/** Construction-time ports shared by every primitive. */
export interface HoverCursorPorts {
  /** Body root group — the cursor primitives mount here. */
  group:        THREE.Group
  /** World-space body radius — used as default scale for `emissive.size`. */
  bodyRadius:   number
  /** Hover-channel slot publication consumed by `<TileCenterProjector>`. */
  hoverChannel: HoverChannel
  /** Sol layer port — always present. */
  sol:          LayerCursorPort
  /** Liquid layer port — `null` on dry / frozen bodies. */
  liquid:       LiquidCursorPort | null
  /** Atmo layer port — `null` on bodies without an atmo board. */
  atmo:         LayerCursorPort | null
}

/** Public surface of the unified hover cursor. */
export interface HoverCursorHandle {
  /**
   * Routes a hover update to the right layer. `null` clears every
   * primitive (rings hidden, light off) and resets the hover channel
   * slot.
   */
  setBoardTile(ref: BoardTileRef | null, options?: HoverPlacementOptions): void
  /**
   * Re-applies the current hover (re-reads cap / floor / sea level via
   * the ports). Call after a tile mutation that changed the hovered
   * tile's geometry — e.g. a sol-height dig.
   */
  refresh(): void
  /**
   * Live mutation of the cursor visuals. Only primitives that were
   * constructed (i.e. not `false` at build time) can be tuned this way;
   * passing values for disabled primitives is silently ignored.
   *
   * Color / intensity changes apply immediately. Size changes (ring,
   * emissive distance) take effect on the next `apply` — calling
   * {@link refresh} replays the current hover so a slider drag updates
   * the live ring shape.
   */
  updateConfig(partial: HoverCursorConfig): void
  /**
   * Subscribes to hovered sol-tile id changes. Atmo / liquid hovers fire
   * `null` (the listener watches the sol board only). Returns an
   * unsubscribe.
   */
  onHoverChange(listener: HoverListener): () => void
  /** Current hovered sol tile id — `null` outside of sol hovers. */
  getHoverId(): number | null
  /**
   * Live snapshot of every Three.js object the cursor owns (cap ring,
   * floor ring, emissive light). Excludes primitives that were disabled
   * at build time (no GPU resource allocated). Used by the body's
   * `warmup` to compile cursor shaders into a dedicated phase rather
   * than mixing them with the rest of the body group.
   */
  objects(): readonly THREE.Object3D[]
  /** Releases GPU resources. Idempotent. */
  dispose(): void
}

interface ResolvedRing     { size: number; color: THREE.Color; opacity: number; enabled: boolean }
interface ResolvedEmissive { distance: number; color: THREE.Color; intensity: number; enabled: boolean }

interface ResolvedConfig {
  ring:      ResolvedRing | null
  floorRing: ResolvedRing | null
  emissive:  ResolvedEmissive | null
}

function resolveRing(input: HoverCursorConfig['ring']): ResolvedRing | null {
  if (input === undefined) return {
    size: 1, color: new THREE.Color(0xffffff), opacity: 1, enabled: true,
  }
  if (input === false) return null
  return {
    size:    input.size    ?? 1,
    color:   new THREE.Color(input.color ?? 0xffffff),
    opacity: input.opacity ?? 1,
    enabled: true,
  }
}

function resolveConfig(c: HoverCursorConfig | undefined, bodyRadius: number): ResolvedConfig {
  const cfg = c ?? {}
  const emissive: ResolvedEmissive | null = cfg.emissive === false ? null : {
    distance:  cfg.emissive?.size      ?? bodyRadius * 0.6,
    color:     new THREE.Color(cfg.emissive?.color ?? 0xffffff),
    intensity: cfg.emissive?.intensity ?? 1.5,
    enabled:   true,
  }
  return {
    ring:      resolveRing(cfg.ring),
    floorRing: resolveRing(cfg.floorRing),
    emissive,
  }
}

function selectPort(layer: InteractiveLayer, ports: HoverCursorPorts): LayerCursorPort | null {
  switch (layer) {
    case 'sol':    return ports.sol
    case 'liquid': return ports.liquid
    case 'atmo':   return ports.atmo
  }
}

/**
 * Builds the unified hover cursor from a {@link HoverCursorConfig} and
 * the per-layer ports. The returned handle drives all three primitives
 * through a single `setBoardTile` entry point — the orchestrator routes
 * raycaster hits in, the cursor renders the right visuals out.
 */
export function buildHoverCursor(
  config: HoverCursorConfig | undefined,
  ports:  HoverCursorPorts,
): HoverCursorHandle {
  const cfg = resolveConfig(config, ports.bodyRadius)

  // ── Ring sub-renderer (pre-allocated, in-place rewrites) ──────
  // Two ring slots, independently configurable:
  //   - cap   : drawn on every layer at the visible top (waterline / sol cap / atmo cap)
  //   - floor : liquid-only twin, drawn on the seabed so the user can
  //             tell which sol tile sits under the hovered ocean hex
  type Ring = {
    mesh: THREE.Mesh
    geo:  THREE.BufferGeometry
    mat:  THREE.MeshBasicMaterial
  }
  function makeRing(spec: ResolvedRing): Ring {
    const geo  = new THREE.BufferGeometry()
    const attr = new THREE.Float32BufferAttribute(new Float32Array(MAX_BORDER_FLOATS), 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', attr)
    const mat = new THREE.MeshBasicMaterial({
      color:       spec.color,
      transparent: true,
      opacity:     spec.opacity,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      depthTest:   false,
      side:        THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder   = 1
    mesh.visible       = false
    mesh.frustumCulled = false
    ports.group.add(mesh)
    return { mesh, geo, mat }
  }
  function placeRing(ring: Ring, spec: ResolvedRing, tile: Tile, worldRadius: number): THREE.Vector3 {
    const heightDelta = worldRadius - ports.bodyRadius
    const { center, ring: rim, avgRadius } = buildTileRing(tile, heightDelta, 0, 0)
    const borderPos = buildBorderPositions(center, rim, avgRadius, BORDER_WIDTH * spec.size)
    const attr = ring.geo.getAttribute('position') as THREE.BufferAttribute
    const floats = Math.min(borderPos.length, MAX_BORDER_FLOATS)
    ;(attr.array as Float32Array).set(borderPos.subarray(0, floats), 0)
    attr.needsUpdate = true
    ring.geo.setDrawRange(0, floats / 3)
    ring.mesh.visible = true
    return center
  }
  const capRing:   Ring | null = cfg.ring      ? makeRing(cfg.ring)      : null
  const floorRing: Ring | null = cfg.floorRing ? makeRing(cfg.floorRing) : null

  // ── Emissive light (single instance, repositioned per hover) ──
  let light: THREE.PointLight | null = null
  if (cfg.emissive) {
    light = new THREE.PointLight(
      cfg.emissive.color, cfg.emissive.intensity, cfg.emissive.distance, 2,
    )
    light.visible = false
    ports.group.add(light)
  }

  // ── State ─────────────────────────────────────────────────────
  let currentRef:     BoardTileRef | null = null
  let currentOptions: HoverPlacementOptions | undefined = undefined
  let currentSolId:   number | null = null
  const hoverListeners = new Set<HoverListener>()

  function notifySolChange(nextSolId: number | null): void {
    if (nextSolId === currentSolId) return
    currentSolId = nextSolId
    for (const cb of hoverListeners) cb(nextSolId)
  }

  function clear(): void {
    if (capRing)   capRing.mesh.visible   = false
    if (floorRing) floorRing.mesh.visible = false
    if (light)     light.visible          = false
    ports.hoverChannel.hoverLocalPos.value    = null
    ports.hoverChannel.hoverParentGroup.value = null
    currentRef     = null
    currentOptions = undefined
    notifySolChange(null)
  }

  function apply(ref: BoardTileRef, options?: HoverPlacementOptions): void {
    const port = selectPort(ref.layer, ports)
    if (!port) { clear(); return }

    const tile = port.getTile(ref.tileId)
    if (!tile) { clear(); return }

    const capRadius = options?.capOffsetFromRadius != null
      ? ports.bodyRadius + options.capOffsetFromRadius
      : port.getCapRadius(ref.tileId)
    const floorRadius = port.getFloorRadius?.(ref.tileId) ?? capRadius

    // ── Cap ring (waterline / sol cap / atmo cap) ───────────
    // Always rendered with the user-configured colour / opacity — no
    // runtime override here. A layer switch may still need to clear
    // overrides set on the floor ring; that path lives below.
    if (capRing && cfg.ring && cfg.ring.enabled) {
      capRing.mat.color.copy(cfg.ring.color)
      capRing.mat.opacity = cfg.ring.opacity

      const center = placeRing(capRing, cfg.ring, tile, capRadius)
      ports.hoverChannel.hoverLocalPos.value    = center.clone()
      ports.hoverChannel.hoverParentGroup.value = ports.group
    } else if (capRing) {
      capRing.mesh.visible = false
    }

    // ── Floor ring (liquid only — outlines the seabed sol tile) ──
    // The seabed twin carries the runtime overrides: it sits on the
    // ocean floor so dimming it keeps the underwater detail readable,
    // and tinting it red on a fully-mined core window flags the
    // missing-floor case to the player. Always reset both attributes
    // so a layer switch reverts the prior override.
    if (floorRing && cfg.floorRing && cfg.floorRing.enabled
        && ref.layer === 'liquid' && floorRadius < capRadius) {
      const isCoreWindow = ports.liquid?.isCoreWindow(ref.tileId) === true
      const ringColor    = isCoreWindow ? CORE_WINDOW_FLOOR_RING_COLOR : cfg.floorRing.color
      floorRing.mat.color.copy(ringColor)
      floorRing.mat.opacity = LIQUID_FLOOR_RING_OPACITY

      placeRing(floorRing, cfg.floorRing, tile, floorRadius)
    } else if (floorRing) {
      floorRing.mesh.visible = false
    }

    // ── Light at mid-prism ──────────────────────────────────
    // Sol hovers skip the emissive halo: in playable surface view the
    // terrain is already flat-lit, so a point-light bleeding onto
    // neighbour tiles would muddy the read instead of helping it.
    // Liquid + atmo hovers keep the halo (it adds depth on the
    // waterline + reads through the atmospheric prism).
    if (cfg.emissive && light && cfg.emissive.enabled && ref.layer !== 'sol') {
      const c    = tile.centerPoint
      const len  = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z)
      const midR = (floorRadius + capRadius) / 2
      const s    = midR / len
      light.position.set(c.x * s, c.y * s, c.z * s)
      light.visible = true
    } else if (light) {
      light.visible = false
    }

    notifySolChange(ref.layer === 'sol' ? ref.tileId : null)
  }

  function setBoardTile(ref: BoardTileRef | null, options?: HoverPlacementOptions): void {
    if (ref === null) { clear(); return }
    currentRef     = ref
    currentOptions = options
    apply(ref, options)
  }

  function refresh(): void {
    if (currentRef === null) return
    apply(currentRef, currentOptions)
  }

  /**
   * Live mutation of the cursor params. Material colors / light props
   * update in place; size changes are stored and replayed by `refresh`.
   * Disabling toggles `enabled` flag — the GPU resource is preserved so
   * the primitive can be re-enabled at any time. Primitives that were
   * built with `false` are absent (no GPU resource); flipping their
   * enable flag is a no-op.
   */
  function updateRing(spec: ResolvedRing | null, ring: Ring | null,
                      input: HoverCursorConfig['ring']): void {
    if (!spec || !ring || input === undefined) return
    if (input === false) { spec.enabled = false; ring.mesh.visible = false; return }
    spec.enabled = true
    if (input.color !== undefined) {
      spec.color.set(input.color)
      ring.mat.color.set(input.color)
    }
    if (input.size !== undefined) {
      spec.size = input.size
    }
    if (input.opacity !== undefined) {
      spec.opacity     = input.opacity
      ring.mat.opacity = input.opacity
    }
  }

  function updateConfig(partial: HoverCursorConfig): void {
    updateRing(cfg.ring,      capRing,   partial.ring)
    updateRing(cfg.floorRing, floorRing, partial.floorRing)

    if (cfg.emissive && light && partial.emissive !== undefined) {
      if (partial.emissive === false) {
        cfg.emissive.enabled = false
        light.visible        = false
      } else {
        cfg.emissive.enabled = true
        if (partial.emissive.color !== undefined) {
          cfg.emissive.color.set(partial.emissive.color)
          light.color.set(partial.emissive.color)
        }
        if (partial.emissive.intensity !== undefined) {
          cfg.emissive.intensity = partial.emissive.intensity
          light.intensity        = partial.emissive.intensity
        }
        if (partial.emissive.size !== undefined) {
          cfg.emissive.distance = partial.emissive.size
          light.distance        = partial.emissive.size
        }
      }
    }
    refresh()
  }

  function onHoverChange(listener: HoverListener): () => void {
    hoverListeners.add(listener)
    return () => { hoverListeners.delete(listener) }
  }

  function dispose(): void {
    clear()
    hoverListeners.clear()
    for (const r of [capRing, floorRing]) {
      if (!r) continue
      r.geo.dispose()
      r.mat.dispose()
      ports.group.remove(r.mesh)
    }
    if (light) ports.group.remove(light)
  }

  function objects(): readonly THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    if (capRing)   out.push(capRing.mesh)
    if (floorRing) out.push(floorRing.mesh)
    if (light)     out.push(light)
    return out
  }

  return {
    setBoardTile,
    refresh,
    updateConfig,
    onHoverChange,
    getHoverId: () => currentSolId,
    objects,
    dispose,
  }
}
