/**
 * `Body` — the full handle returned by `useBody(config, tileSize, options)`.
 *
 * Grouped as namespaces (`interactive`, `hover`, `liquid`, `view`, `tiles`)
 * rather than a flat bag of setters so the API stays discoverable as it
 * grows. The star and planet factories both produce this shape — stars
 * provide no-op implementations for features they don't have (liquid,
 * atmosphere view, sol-height digging), which keeps callers on a single
 * code path regardless of body type.
 *
 * Lives in `types/` (pure type module, no runtime) so the scene / docs /
 * tests can import just the interface without pulling the render stack.
 */

import type * as THREE from 'three'
import type { BodyConfig } from './body.types'
import type { TerrainLevel } from './terrain.types'
import type { BodySimulation } from '../sim/BodySimulation'
import type { BodyVariation } from '../render/body/bodyVariation'
import type { BodyMaterial } from '../shaders/BodyMaterial'
import type { HoverChannel } from '../render/state/hoverState'
import type { GraphicsUniforms } from '../render/hex/hexGraphicsUniforms'
import type { AtmoShellHandle } from '../render/shells/buildAtmoShell'
import type { LiquidCoronaHandle } from '../render/shells/buildLiquidCorona'
import type {
  ShadowUniforms,
  OccluderUniforms,
  TileGeometryInfo,
  HoverListener,
} from '../render/hex/hexMeshShared'

/** Layer selector for the layered interactive mesh — sol (terrain) or atmo (shell). */
export type InteractiveLayer = 'sol' | 'atmo'

/**
 * View selector for {@link BodyView.set} — three mutually exclusive
 * rendering modes:
 *
 *   - `'surface'`    : interactive hex sol visible (relief + liquid),
 *                      atmo hidden, smooth sphere hidden.
 *   - `'atmosphere'` : interactive hex atmo visible **fully opaque**
 *                      (resource board), sol hidden, smooth sphere hidden.
 *   - `'shader'`     : non-interactive overview render. Smooth sphere
 *                      shown when the body type benefits from it (rocky,
 *                      metallic, star); atmo halo overlaid with the
 *                      configured `atmosphereOpacity`. Gaseous bodies skip
 *                      the smooth sphere because the opaque atmo shell
 *                      already covers it.
 */
export type InteractiveView = 'surface' | 'atmosphere' | 'shader'

/** Plain RGB triple used by vertex-colour overlay helpers. */
export interface RGB {
  r: number
  g: number
  b: number
}

/**
 * Pre-blend palette snapshot of a tile — the base colour, PBR values and
 * emissive hints consumers need to run their own resource blend off-lib.
 *
 * On emerged tiles the values come from the tile's palette band; on
 * submerged tiles they come from the body's sea anchor. The `submerged`
 * flag lets consumers gate their blend rules (e.g. skip the blend entirely
 * on ocean tiles so the caller-chosen liquid colour stays intact).
 */
export interface TileBaseVisual {
  r:                 number
  g:                 number
  b:                 number
  roughness:         number
  metalness:         number
  emissive:          THREE.Color | undefined
  emissiveIntensity: number
  /** True when the tile currently sits below the waterline. */
  submerged:         boolean
}

// ── Namespaces ────────────────────────────────────────────────────

/**
 * Mode switch + raycast queries. `activate` swaps the smooth display mesh
 * for the interactive hex mesh; `deactivate` reverts. `queryHover` returns
 * the tile id under the ray, or `null` when the body is not in interactive
 * mode or when the ray misses.
 */
export interface BodyInteractive {
  activate(): void
  deactivate(): void
  queryHover(raycaster: THREE.Raycaster): number | null
}

/** Optional knobs accepted by {@link BodyHover.setTile} / `setPinnedTile`. */
export interface HoverPlacementOptions {
  /**
   * Override the radial offset (above the surface radius) at which the
   * hover ring is drawn. Defaults to the tile's own sol cap height.
   *
   * Useful when a caller stacks something above the sol mesh — e.g. an
   * ice cap built via `buildSolidShell` — and wants the hover ring to
   * sit on the cap's top face instead of the buried mineral floor. Pass
   * `coreRadius + capWorldHeight - surfaceRadius` to anchor on a cap
   * whose top sits at world distance `coreRadius + capWorldHeight`.
   */
  capOffsetFromRadius?: number
}

/**
 * Controlled hover state — scene controllers drive these from their own
 * raycast events. The body itself never auto-mutates hover state.
 */
export interface BodyHover {
  /** Highlights the given tile (or clears highlight when `null`). */
  setTile(id: number | null, options?: HoverPlacementOptions): void
  /**
   * Pins the given tile as the popover anchor. Unlike `setTile`, the pin
   * persists when the cursor leaves the tile — its world-space position is
   * projected every frame so popovers and markers stay on the hex as the
   * planet rotates.
   */
  setPinnedTile(id: number | null, options?: HoverPlacementOptions): void
  /** Toggles the body-level hover ring (used when another body is hovered). */
  setBodyHover(visible: boolean): void
  /**
   * Subscribes to hovered-tile changes — returns an unsubscribe function.
   * Used by overlay renderers that repaint tiles entering or leaving hover
   * state.
   */
  onChange(listener: HoverListener): () => void
}

/**
 * Surface liquid controls — no-ops on bodies without liquid configured
 * (dry rocky, metallic, gaseous, stars).
 */
export interface BodyLiquid {
  /**
   * Sets the world-space radius of the liquid surface sphere. Combine
   * with `Body.getCoreRadius()` / `Body.getSurfaceRadius()` to derive
   * in-band values. A value `≤ coreRadius` hides the liquid mesh.
   */
  setSeaLevel(worldRadius: number): void
  /** Toggles the liquid surface visibility. */
  setVisible(visible: boolean): void
  /** Sets the liquid surface alpha in `[0, 1]`. */
  setOpacity(alpha: number): void
}

/**
 * Active view toggle — see {@link InteractiveView}. Star bodies accept
 * `'shader'` (their only meaningful view) and ignore `'surface'` /
 * `'atmosphere'`.
 */
export interface BodyView {
  set(view: InteractiveView): void
}

/**
 * Tile-level access + mutation primitives common to every body type
 * (planets and stars). Layered-mesh specific helpers live on the
 * planet-only {@link PlanetTiles} extension below.
 */
export interface BodyTiles {
  /** Baseline radial offset (body-relative) applied to the interactive surface. */
  surfaceOffset: number
  /** Resolves the geometry context for a tile (tile + terrain level). Null on unknown id. */
  tileGeometry(tileId: number): TileGeometryInfo | null
  /** Writes a raw RGB value to every vertex of a tile in the merged color buffer. */
  writeTileColor(tileId: number, rgb: RGB): void
  /**
   * Resolves the pre-blend visual snapshot for a tile: the palette colour
   * on emerged tiles, the sea-anchor colour on submerged ones, plus the
   * PBR + emissive hints consumers need to run their own resource blend
   * off-lib. Returns `null` on unknown ids.
   */
  tileBaseVisual(tileId: number): TileBaseVisual | null
}

/**
 * Planet-only tile primitives — the layered prism mesh exposes per-layer
 * overlays, sol-height mutation and atmo paint. Stars do not carry these.
 */
export interface PlanetTiles extends BodyTiles {
  /**
   * World-space position at the top of the requested layer (sol cap or
   * atmo shell). Returns `null` for unknown ids.
   */
  getTilePosition(tileId: number, layer?: InteractiveLayer): THREE.Vector3 | null
  /** Mutates the sol height of the given tiles in place. */
  updateTileSolHeight(updates: Map<number, number>): void
  /**
   * Stamps per-tile RGB into the vertex buffer of a single layer. Lets
   * overlay renderers tint the sol without touching the atmo band.
   */
  applyTileOverlay(layer: InteractiveLayer, colors: Map<number, RGB>): void
  /**
   * Forces the smooth-sphere preview to re-read `sim.tileStates` and
   * repaint its vertices. Call after mutating tile elevations.
   */
  repaintSmoothSphere(): void
  /**
   * Stamps per-tile RGB into the smooth-sphere vertex buffer. Intended for
   * a single post-build paint: the smooth sphere is treated as a frozen
   * geological snapshot, so runtime mutations are not reflected there.
   * Use {@link applyTileOverlay} on the layered mesh for interactive
   * repaints instead.
   */
  paintSmoothSphere(colors: Map<number, RGB>): void
  /**
   * Stamps per-tile RGB onto the procedural atmo shell that drives the
   * `'shader'` view on rocky and gaseous bodies. The shell uses a
   * nearest-tile lookup so vertices closest to a painted hex pick up its
   * colour. No-op on bodies without an atmo shell (metallic).
   */
  paintAtmoShell(colors: Map<number, RGB>): void
}

// ── Body ──────────────────────────────────────────────────────────

/**
 * Fields common to every body handle — identity, state, lifecycle, radii,
 * interactive + hover namespaces. Both {@link PlanetBody} and {@link StarBody}
 * extend this base; the union {@link Body} is what `useBody()` actually
 * returns.
 */
export interface BodyBase {
  // ── Identity / state ─────────────────────────────────────────────
  /** Root THREE group — meshes and shells attach under it. */
  group:            THREE.Group
  /** The config the body was built from. */
  config:           BodyConfig
  /** Deterministic simulation state (tiles, elevations, sea level…). */
  sim:              BodySimulation
  /** Effective terrain palette — caller-supplied override or auto-derived. */
  palette:          TerrainLevel[]
  /** Deterministic visual variation (rings, shader params). */
  variation:        BodyVariation
  /** Number of tiles generated by the hexasphere. */
  tileCount:        number
  /** Shadow uniforms a child body writes into when casting an eclipse on this body. */
  shadowUniforms:   ShadowUniforms
  /** Occluder uniforms this body's cloud shell reads to darken the underside. */
  occluderUniforms: OccluderUniforms
  /**
   * Raw procedural material handle. Exposed for live-update paths that
   * push shader uniforms without rebuilding the whole body (slider drags).
   */
  planetMaterial:   BodyMaterial
  /**
   * Per-body hover/pin publication channel. Each body owns its own channel
   * so multi-body scenes host independent hovered/pinned tiles.
   */
  hoverChannel:     HoverChannel
  /**
   * Per-body graphics-uniform bag — drives this body's cloud / liquid /
   * terrain shaders. Each body has its own bag so live tuning never
   * leaks across bodies.
   */
  graphicsUniforms: GraphicsUniforms

  // ── Lifecycle ───────────────────────────────────────────────────
  tick(dt: number): void
  dispose(): void

  // ── Radii ───────────────────────────────────────────────────────
  /** World radius of the opaque inner core sphere (`radius * coreRadiusRatio`). */
  getCoreRadius():    number
  /** World radius of the outer surface (= `config.radius`). */
  getSurfaceRadius(): number

  // ── Always-present namespaces ───────────────────────────────────
  interactive: BodyInteractive
  hover:       BodyHover
}

/**
 * Handle returned by `useBody()` for `'rocky' | 'gaseous' | 'metallic'`.
 * Carries the layered-prism specific surface (liquid, view toggle, atmo
 * shell, layered tile mutations).
 */
export interface PlanetBody extends BodyBase {
  /** Discriminant — narrows the union {@link Body} to the planet branch. */
  kind: 'planet'

  /**
   * Procedural atmosphere shell handle — `null` on bodies without an
   * atmospheric layer (metallic) or when `atmosphereOpacity` resolves to
   * `0`. Live-tune the procedural look via `atmoShell?.setParams({...})`;
   * resource overlays go through `tiles.paintAtmoShell(...)` instead.
   */
  atmoShell:    AtmoShellHandle | null
  /**
   * Outer translucent halo coloured with the body's `liquidColor`. `null`
   * on bodies without a surface liquid. Live-tunable opacity + colour.
   */
  liquidCorona: LiquidCoronaHandle | null

  liquid: BodyLiquid
  view:   BodyView
  tiles:  PlanetTiles
}

/**
 * Handle returned by `useBody()` for `'star'`. Stars carry no liquid,
 * no atmosphere shell, no view toggle and no layered tile mutations —
 * the corresponding namespaces are simply absent on the type, so callers
 * narrow the union via `body.kind === 'star'`.
 */
export interface StarBody extends BodyBase {
  /** Discriminant — narrows the union {@link Body} to the star branch. */
  kind: 'star'

  tiles: BodyTiles
}

/**
 * Discriminated union returned by `useBody(config, tileSize, options?)`.
 * Narrow on `body.kind` (or equivalently on `body.config.type === 'star'`)
 * to access type-specific namespaces such as `liquid`, `view`, `atmoShell`
 * or planet-only tile mutators.
 */
export type Body = PlanetBody | StarBody
