/**
 * Public API of the body feature — Three.js-ready entry point.
 *
 * Builds on `./sim` (pure-logic) and adds the render layer: shaders,
 * materials, GLSL, render builders, palettes, scene-display helpers and
 * Three.js-backed interaction helpers (raycasting). Free of any Vue or
 * TresJS dependency — suitable for consumers wiring their own scene
 * manually or using a non-Vue framework.
 *
 * Vue-specific additions (components, reactive composables) live in
 * `./index.ts` and augment this surface. For a fully WebGL-free
 * consumption (backend, worker, CLI), import from `./sim` directly.
 */

// ── Pure-logic surface (types, geometry, physics, sim…) ──────────
export * from './sim'

// ── Render-scoped types (THREE.js-coupled) ───────────────────────
export type { TerrainLevel } from './types/terrain.types'
export type { BodyRenderOptions } from './types/bodyRender.types'
export type {
  Body,
  BodyBase,
  PlanetBody,
  StarBody,
  BodyInteractive,
  BodyHover,
  BodyLiquid,
  BodyView,
  BodyTiles,
  PlanetTiles,
  RGB,
  TileBaseVisual,
} from './types/bodyHandle.types'

// ── Render config (body-scoped) ──────────────────────────────────
export {
  PREVIEW_ORBIT_SPEED,
  FOCUS_LERP,
  SHADOW_SUN_RADIUS,
  ORBIT_TRAIL_SEGMENTS,
  DEFAULT_LENS_FLARE,
  DEFAULT_SUN_FX,
  DEFAULT_HOVER,
  DEFAULT_BODY_HOVER,
} from './config/render'
export type {
  GodRaysParams,
  LensFlareConfig,
  SunFXConfig,
  HoverConfig,
  BodyHoverConfig,
} from './config/render'

// ── Render-scoped types ──────────────────────────────────────────
export type { RenderableBody } from './types/renderableBody'

// ── Terrain palettes (produce THREE.Color) ───────────────────────
// Consumers wanting to tweak relief defaults can call the generator,
// map over the returned levels, and pass the result as
// `BodyRenderOptions.palette` at the render factory (`useBody`, `<Body>`).
// The rocky default is a plain low → high grey ramp whose anchors are
// exposed as `terrainColorLow` / `terrainColorHigh` on `BodyConfig`; the
// `DEFAULT_TERRAIN_LOW_COLOR` / `DEFAULT_TERRAIN_HIGH_COLOR` constants are
// the fallback values used when those knobs are omitted.
export {
  generateTerrainPalette,
  buildMetallicPalette,
  buildGasPalette,
} from './terrain/terrainPalette'
export {
  DEFAULT_TERRAIN_LOW_COLOR,
  DEFAULT_TERRAIN_HIGH_COLOR,
} from './terrain/paletteRocky'
export { buildStarPalette } from './terrain/starPalette'

// ── Shaders (procedural planet + post-processing) ────────────────
export {
  BodyMaterial,
  BODY_TYPES,
  BODY_PARAMS,
  BODY_GROUPS,
  getDefaultParams,
  SHADER_RANGES,
  kelvinToRGB,
  kelvinToThreeColor,
  kelvinLabel,
  GodRaysShader,
} from './shaders'
export type {
  BodyMaterialOptions,
  BodyLightUpdate,
  LibBodyType,
  ParamDef,
  BodyParamsMap,
  ParamRange,
} from './shaders'

// ── Rendering ────────────────────────────────────────────────────
export {
  DEFAULT_TILE_SIZE,
  DEFAULT_CORE_RADIUS_RATIO,
  resolveTerrainLevelCount,
  resolveAtmosphereThickness,
  terrainBandLayout,
  type TerrainBandLayout,
} from './physics/body'
export {
  useBody,
  tileSizeToSubdivisions,
  resolveTileHeight,
  resolveTileLevel,
  choosePalette,
} from './render/body/useBody'
// Pure derivation: BodyConfig + variation → shader params. Exposed so
// callers can preview the resolved uniforms (UI panes, debugging,
// thumbnails) without having to build a full body. No GPU resource is
// created — same function `useBody` runs internally.
export { configToLibParams } from './render/body/configToLibParams'
export type { ShadowUniforms, OccluderUniforms } from './render/hex/hexMeshShared'
export type { InteractiveMesh, InteractiveMeshOptions } from './render/body/buildInteractiveMesh'
export { buildAtmoShell } from './render/shells/buildAtmoShell'
export type { AtmoShellConfig, AtmoShellHandle } from './render/shells/buildAtmoShell'
export { buildBodyRings } from './render/shells/buildBodyRings'
export type { BodyRingsConfig, BodyRingsHandle } from './render/shells/buildBodyRings'
export { buildCoreMesh } from './render/shells/buildCoreMesh'
export type { CoreMesh, CoreMeshConfig } from './render/shells/buildCoreMesh'
export { buildLayeredPrismGeometry } from './render/layered/buildLayeredPrism'
export { buildLayeredMergedGeometry } from './render/layered/buildLayeredMesh'
export { createAtmoMaterial } from './render/layered/atmoMaterial'
export type { AtmoMaterialOptions, AtmoMaterialHandle } from './render/layered/atmoMaterial'
export { buildLiquidSphere } from './render/shells/buildLiquidSphere'
export type { LiquidSphereConfig, LiquidSphereHandle } from './render/shells/buildLiquidSphere'
export { buildSolidShell } from './render/shells/buildSolidShell'
export type { SolidShellConfig, SolidShellHandle } from './render/shells/buildSolidShell'
export { buildLayeredInteractiveMesh, resolveSolHeight } from './render/layered/buildLayeredInteractiveMesh'
export type { LayeredInteractiveMesh, LayeredInteractiveMeshOptions, InteractiveLayer, InteractiveView } from './render/layered/buildLayeredInteractiveMesh'
export type { RingVariation, RingArchetype, Profile8 } from './render/shells/ringVariation'
export { RING_RANGES, RING_ARCHETYPES, ARCHETYPE_PROFILES } from './render/shells/ringVariation'
export { generateBodyVariation } from './render/body/bodyVariation'
export type { BodyVariation } from './render/body/bodyVariation'
export { createTileOverlayMesh } from './render/shells/TileOverlayMesh'
export type { TileOverlayMesh, TileOverlayOptions } from './render/shells/TileOverlayMesh'
export {
  computeBodyQuaternion,
  createBodyMotion,
} from './render/body/bodyMotion'
export type {
  BodyMotionInput,
  BodyMotionHandle,
} from './render/body/bodyMotion'
export { godRaysFromStar } from './render/lighting/godRaysFromStar'
export { createGraphicsUniforms } from './render/hex/hexGraphicsUniforms'
export type { GraphicsUniforms } from './render/hex/hexGraphicsUniforms'
export { resolveSphereDetail } from './render/quality/renderQuality'
export type { RenderQuality, SphereDetailQuality } from './render/quality/renderQuality'
export { createHoverChannel } from './render/state/hoverState'
export type { HoverChannel } from './render/state/hoverState'
export { findSceneRoot, findDominantLightWorldPos } from './render/lighting/findDominantLight'

// ── Body-type strategy ──────────────────────────────────────────
// Centralised per-type policies (`flatSurface`, `displayMeshIsAtmosphere`,
// `canHaveRings`, `metallicSheen`, `defaultAtmosphereOpacity`, palette
// + shader builders). Adding a new body type collapses to one entry in
// `BODY_TYPE_STRATEGIES` instead of hunting type discriminants across
// the render pipeline.
export {
  BODY_TYPE_STRATEGIES,
  strategyFor,
} from './render/body/bodyTypeStrategy'
export type {
  BodyTypeStrategy,
} from './render/body/bodyTypeStrategy'

// ── Scene display helpers ───────────────────────────────────────
export {
  BODY_TYPE_LABEL,
  BODY_TYPE_COLOR,
  bodyOuterRadius,
} from './render/body/sceneBodyUtils'

// ── Interaction ──────────────────────────────────────────────────
export { findBodyIndex, raycastBodies } from './render/body/bodyRaycast'
export type { RaycastBody, RaycastBodiesOptions, RaycastHit } from './render/body/bodyRaycast'
