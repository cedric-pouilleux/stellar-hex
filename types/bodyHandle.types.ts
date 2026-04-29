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
import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig, PlanetConfig, StarConfig } from './body.types'
import type { TerrainLevel } from './terrain.types'
import type { BodySimulation } from '../sim/BodySimulation'
import type { BodyVariation } from '../render/body/bodyVariation'
import type { BodyMaterial } from '../shaders/BodyMaterial'
import type { HoverChannel } from '../render/state/hoverState'
import type { GraphicsUniforms } from '../render/hex/hexGraphicsUniforms'
import type { AtmoShellHandle } from '../render/shells/buildAtmoShell'
import type {
  ShadowUniforms,
  OccluderUniforms,
  TileGeometryInfo,
  HoverListener,
} from '../render/hex/hexMeshShared'

/**
 * Layer selector for the multi-board model — sol terrain, liquid surface,
 * or atmo shell. The lib's hover detection raycasts all three boards and
 * resolves the closest hit into one of these layers.
 */
export type InteractiveLayer = 'sol' | 'liquid' | 'atmo'

/**
 * View selector for {@link BodyView.set} — three mutually exclusive
 * rendering modes:
 *
 *   - `'surface'`    : interactive sol board visible (relief + liquid),
 *                      atmo board hidden, smooth sphere hidden.
 *   - `'atmosphere'` : interactive atmo board visible (resource grid),
 *                      sol board hidden, smooth sphere hidden.
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
 * Discriminated reference to a tile on one of the two boards. Returned by
 * {@link BodyInteractive.queryHover} so callers can route the hit into the
 * correct board's API — sol and atmo live on independent hexaspheres, so
 * a tile id is only meaningful in the context of its layer.
 */
export interface BoardTileRef {
  layer:  InteractiveLayer
  tileId: number
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
 * for the interactive boards; `deactivate` reverts. `queryHover` returns
 * the layer + tile id under the ray, or `null` when the body is not in
 * interactive mode or when the ray misses both boards.
 */
export interface BodyInteractive {
  activate(): void
  deactivate(): void
  /**
   * Resolves the tile under the ray on the **active** board (sol board in
   * surface view, atmo board in atmosphere view). Returns `null` in the
   * shader view (non-interactive) or when the ray misses.
   */
  queryHover(raycaster: THREE.Raycaster): BoardTileRef | null
}

/** Optional knobs accepted by {@link BodyHover.setTile}. */
export interface HoverPlacementOptions {
  /**
   * Override the radial offset (above the surface radius) at which the
   * hover ring is drawn. Defaults to the tile's own sol cap height.
   */
  capOffsetFromRadius?: number
}

/**
 * Controlled hover state — scene controllers drive these from their own
 * raycast events. The body itself never auto-mutates hover state.
 *
 * Sol hover is rendered as a ring overlay; atmo hover is rendered as a
 * vertex-colour tint on the targeted atmo tile (no extra mesh). The
 * dispatcher {@link setBoardTile} routes to the right board based on the
 * `BoardTileRef.layer`, so callers can forward the result of
 * {@link BodyInteractive.queryHover} verbatim.
 */
export interface BodyHover {
  /** Highlights the given sol tile (or clears highlight when `null`). */
  setTile(id: number | null, options?: HoverPlacementOptions): void
  /**
   * Routes a hover update to the correct board. Pass the result of
   * {@link BodyInteractive.queryHover} directly — `null` clears hover on
   * both boards, a sol ref highlights the sol ring, an atmo ref tints
   * the atmo tile.
   */
  setBoardTile(ref: BoardTileRef | null, options?: HoverPlacementOptions): void
  /** Toggles the body-level hover ring (used when another body is hovered). */
  setBodyHover(visible: boolean): void
  /**
   * Live mutation of the hover-cursor visuals (ring color / size,
   * emissive color / intensity / size, column color). Disabled
   * primitives (`false` at build time) cannot be enabled this way —
   * pass them through `useBody`'s `hoverCursor`/`hoverCursors` option
   * instead so the GPU resource is allocated up front.
   */
  updateCursor(config: import('./hoverCursor.types').HoverCursorConfig): void
  /**
   * Switches the active cursor preset by name — must be one of the keys
   * registered in `useBody`'s `hoverCursors` option (or `'default'` when
   * the body was built with the single-cursor `hoverCursor` shortcut).
   * Throws on unknown names. Each preset is a full
   * `HoverCursorConfig` — switching applies the entire preset (any
   * primitive not mentioned by the preset falls back to its lib default,
   * NOT the previous preset's value).
   */
  useCursor(name: string): void
  /**
   * Subscribes to hovered sol-tile changes — returns an unsubscribe
   * function.
   */
  onChange(listener: HoverListener): () => void
}

/**
 * Surface liquid controls — no-ops on bodies without liquid configured
 * (dry rocky, metallic, gaseous, stars).
 */
export interface BodyLiquid {
  /** Sets the world-space radius of the liquid surface sphere. */
  setSeaLevel(worldRadius: number): void
  /** Toggles the liquid surface visibility. */
  setVisible(visible: boolean): void
  /** Sets the liquid surface alpha in `[0, 1]`. */
  setOpacity(alpha: number): void
  /**
   * Resolves the liquid shell's raycast target — `mesh` is the merged
   * water cap, `faceToTileId[i]` returns the tile id of the i-th
   * triangle. Returns `null` on dry / frozen bodies (no shell built).
   * Lets callers raycast against the water surface and identify which
   * submerged tile sits under the pointer.
   */
  getRaycastState(): { mesh: import('three').Mesh; faceToTileId: readonly number[] } | null
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
 * Tile-level access + mutation primitives common to every board (sol or
 * atmo). Each board carries its own hexasphere, so ids are scoped to the
 * board: a sol id `42` and an atmo id `42` are unrelated.
 */
export interface BoardTiles {
  /** Tiles of this board (sol or atmo hexasphere). */
  tiles:           readonly Tile[]
  /** Writes a raw RGB value to every vertex of a tile. */
  writeTileColor(tileId: number, rgb: RGB): void
  /**
   * Stamps per-tile RGB into the vertex buffer. Same effect as calling
   * {@link writeTileColor} once per entry.
   */
  applyOverlay(colors: Map<number, RGB>): void
  /**
   * World-space top-cap centre of a tile. Returns `null` for unknown ids.
   * Used by overlay renderers that anchor markers on the board.
   */
  getTilePosition(tileId: number): THREE.Vector3 | null
}

/**
 * Sol-board specific tile primitives — height mutation, geometry context,
 * pre-blend visual snapshot. Lives on top of the shared {@link BoardTiles}
 * interface.
 */
export interface SolBoardTiles extends BoardTiles {
  /** Baseline radial offset (body-relative) applied to the interactive surface. */
  surfaceOffset: number
  /** Resolves the geometry context for a tile (tile + terrain level). */
  tileGeometry(tileId: number): TileGeometryInfo | null
  /** Mutates the sol height of the given tiles in place. */
  updateTileSolHeight(updates: Map<number, number>): void
  /** Resolves the pre-blend visual snapshot for a sol tile. */
  tileBaseVisual(tileId: number): TileBaseVisual | null
}

/**
 * Planet-only tile primitives — exposes the sol and atmo boards under
 * separate sub-namespaces, plus the smooth-sphere paint helpers shared
 * across the body.
 */
export interface PlanetTiles {
  /** Sol board — interactive hex grid carrying terrain relief. */
  sol:  SolBoardTiles
  /**
   * Atmo board — playable hex grid floating above the sol surface.
   * `null` on bodies without an atmosphere (`atmosphereThickness === 0`).
   */
  atmo: BoardTiles | null

  /**
   * Forces the smooth-sphere preview to re-read `sim.tileStates` and
   * repaint its vertices. Call after mutating tile elevations.
   */
  repaintSmoothSphere(): void
  /** Stamps per-tile RGB into the smooth-sphere vertex buffer. */
  paintSmoothSphere(colors: Map<number, RGB>): void
  /**
   * Stamps per-tile RGB onto the procedural atmo shell that drives the
   * `'shader'` view on rocky and gaseous bodies. The shell uses a
   * nearest-tile lookup so vertices closest to a painted hex pick up its
   * colour. No-op on bodies without an atmo shell.
   */
  paintAtmoShell(colors: Map<number, RGB>): void
}

/**
 * Star-only tile namespace — flat board (no atmo, no height mutation, no
 * sea level), kept separate from the planet variant.
 */
export interface StarTiles {
  /** Baseline radial offset (body-relative) applied to the interactive surface. */
  surfaceOffset: number
  /** Star tiles. */
  tiles:         readonly Tile[]
  /** Resolves the geometry context for a star tile. */
  tileGeometry(tileId: number): TileGeometryInfo | null
  /** Writes a raw RGB value to every vertex of a star tile. */
  writeTileColor(tileId: number, rgb: RGB): void
  /** Resolves the pre-blend visual snapshot for a star tile. */
  tileBaseVisual(tileId: number): TileBaseVisual | null
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
  group:            THREE.Group
  config:           BodyConfig
  sim:              BodySimulation
  palette:          TerrainLevel[]
  variation:        BodyVariation
  /** Number of sol tiles generated by the hexasphere. */
  tileCount:        number
  shadowUniforms:   ShadowUniforms
  occluderUniforms: OccluderUniforms
  planetMaterial:   BodyMaterial
  hoverChannel:     HoverChannel
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
 * Carries the dual-board surface (sol + atmo), liquid, view toggle and
 * atmo halo shell.
 */
export interface PlanetBody extends BodyBase {
  /** Discriminant — narrows the union {@link Body} to the planet branch. */
  kind: 'planet'

  /** Narrowed to the planet branch of {@link BodyConfig}. */
  config: PlanetConfig

  /**
   * Procedural atmosphere halo handle — `null` on bodies without an
   * atmospheric layer or when `atmosphereOpacity` resolves to `0`. Used
   * by the `'shader'` overview view; the playable atmo grid is the
   * separate `tiles.atmo` board.
   */
  atmoShell:    AtmoShellHandle | null

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

  /** Narrowed to the star branch of {@link BodyConfig}. */
  config: StarConfig

  tiles: StarTiles
}

/**
 * Discriminated union returned by `useBody(config, tileSize, options?)`.
 * Narrow on `body.kind` (or equivalently on `body.config.type === 'star'`)
 * to access type-specific namespaces such as `liquid`, `view`, `atmoShell`
 * or planet-only tile mutators.
 */
export type Body = PlanetBody | StarBody
