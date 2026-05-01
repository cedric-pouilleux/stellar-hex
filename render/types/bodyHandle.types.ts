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
 * Lives under `render/types/` because the handle exposes Three.js meshes,
 * materials and uniforms — it is the public type surface of the render
 * layer, not part of the headless `sim` contract.
 */

import type * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { BodyConfig, PlanetConfig, StarConfig } from '../../types/body.types'
import type { TerrainLevel } from './terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from '../body/bodyVariation'
import type { BodyMaterial } from '../../shaders/BodyMaterial'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { AtmoShellHandle } from '../shells/buildAtmoShell'
import type {
  ShadowUniforms,
  OccluderUniforms,
  TileGeometryInfo,
  HoverListener,
} from '../hex/hexMeshShared'

/**
 * Layer selector for the multi-board model — sol terrain, liquid surface,
 * or atmo shell. The lib's hover detection raycasts all three boards and
 * resolves the closest hit into one of these layers.
 */
export type InteractiveLayer = 'sol' | 'liquid' | 'atmo'

/**
 * Discrete phases reported by {@link BodyBase.warmup}. Stable across
 * versions — callers may switch on these codes to map them to their own
 * i18n strings or progress UX.
 *
 *   - `'collecting'`  : signal the warmup has started (synchronous,
 *                       almost instantaneous — meshes are gathered into
 *                       transient scenes).
 *   - `'surface'`     : sol shaders compile (smooth display mesh +
 *                       interactive sol mesh + opaque core mesh +
 *                       body-hover ring).
 *   - `'atmosphere'`  : atmospheric shaders compile (atmo halo shell +
 *                       playable atmo board). Skipped on bodies without
 *                       an atmosphere and on stars.
 *   - `'cursor'`      : hover-cursor shaders compile (cap ring, floor
 *                       ring, emissive light). Skipped when the body
 *                       was built with no cursor primitives.
 *   - `'done'`        : terminal — every program is ready, the body is
 *                       safe to render in the next frame without freeze.
 */
export type WarmupPhase =
  | 'collecting'
  | 'surface'
  | 'atmosphere'
  | 'cursor'
  | 'done'

/**
 * Snapshot pushed to {@link WarmupOptions.onProgress} at each phase
 * boundary. Carries both a machine-readable code (`phase`) and a default
 * English label, so callers can either route through their own i18n or
 * display the fallback string directly.
 */
export interface WarmupProgress {
  /** Machine-readable phase code — stable across versions, safe to switch on. */
  phase:    WarmupPhase
  /** Number of phases completed so far. */
  current:  number
  /** Total number of phases for this body — varies with body shape. */
  total:    number
  /** Convenience: `current / total`, in `[0, 1]`. */
  progress: number
  /** Default English label — caller may map `phase` to its own i18n strings. */
  label:    string
}

/** Options accepted by {@link BodyBase.warmup}. */
export interface WarmupOptions {
  /**
   * Called once when the warmup starts (`phase: 'collecting'`,
   * `current: 0`), once after each compile phase resolves, and once at
   * the end (`phase: 'done'`, `current: total`). Synchronous — runs on
   * the main thread between compile resolutions.
   */
  onProgress?: (info: WarmupProgress) => void
}

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
   * Live-patches the liquid surface tint without rebuilding the body.
   * Substance-agnostic — the caller resolves the chemistry (h2o, ch4,
   * nh3, …) and pushes the resolved colour through. No-op on dry / frozen
   * bodies.
   */
  setColor(color: import('three').ColorRepresentation): void
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
  /**
   * Pre-compiles every shader the body relies on, exploiting
   * `KHR_parallel_shader_compile` when available so the CPU stays
   * responsive while the GPU driver links programs in the background.
   *
   * Call once after `useBody()` and before the first render — the
   * caller is expected to keep a loader / skeleton visible until the
   * promise resolves. Subsequent calls are inexpensive (Three.js caches
   * compiled programs by material identity).
   *
   * `onProgress` fires at each phase boundary — at the start
   * (`collecting`), after every compile resolves, and at the end
   * (`done`). Use it to drive a loading bar or a status string. Phase
   * codes are stable across lib versions; see {@link WarmupPhase}.
   *
   * Multi-camera scenes only need a single warmup pass — Three.js
   * compiled programs are not bound to a specific camera matrix.
   *
   * @param renderer - Renderer that owns the WebGL context. Programs are
   *                   compiled into this renderer's program cache.
   * @param camera   - Camera used to derive view-dependent uniforms
   *                   during compilation. Any scene camera works.
   * @param options  - Optional progress hook.
   */
  warmup(
    renderer: THREE.WebGLRenderer,
    camera:   THREE.Camera,
    options?: WarmupOptions,
  ): Promise<void>

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
