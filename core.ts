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
// map over the returned levels, and pass the result as `config.palette`.
// Height anchors (SEA_DEPTH, LOW_HEIGHT, MID_HEIGHT, PEAK_HEIGHT) are the
// canonical default values referenced by `generateTerrainPalette`.
export {
  generateTerrainPalette,
  generateMetallicPalette,
  buildGasPalette,
} from './terrain/terrainPalette'
export { subdividePalette } from './terrain/paletteSubdivide'
export { buildStarPalette } from './terrain/starPalette'
export {
  SEA_DEPTH,
  LOW_HEIGHT,
  MID_HEIGHT,
  PEAK_HEIGHT,
} from './terrain/colorAnchors'

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
  VERTEX_SHADER,
  FRAG_SHADERS,
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
  useBody,
  tileSizeToSubdivisions,
  buildGasCoreConfig,
  resolveTileHeight,
  choosePalette,
  PALETTE_MOON,
  PALETTE_GAS_GIANT,
} from './render/useBody'
export type { ShadowUniforms, OccluderUniforms, InteractiveMesh } from './render/useHexasphereMesh'
export { buildAtmosphereShell } from './render/buildAtmosphereShell'
export type { AtmosphereShellConfig, AtmosphereShellHandle } from './render/buildAtmosphereShell'
export { buildCloudShell } from './render/buildCloudShell'
export type { CloudShellConfig, CloudShellHandle } from './render/buildCloudShell'
export { buildBodyRings } from './render/buildBodyRings'
export type { BodyRingsConfig, BodyRingsHandle } from './render/buildBodyRings'
export type { RingVariation, RingArchetype } from './render/ringVariation'
export { generateBodyVariation } from './render/bodyVariation'
export type { BodyVariation } from './render/bodyVariation'
export { createTileOverlayMesh } from './render/TileOverlayMesh'
export type { TileOverlayMesh, TileOverlayOptions } from './render/TileOverlayMesh'
export { buildBodyEffectLayer } from './render/buildBodyEffectLayer'
export type { BodyEffectLayerConfig, BodyEffectLayerHandle, BodyEffectMode } from './render/buildBodyEffectLayer'
export { atmosphereColorFromTemp } from './render/atmosphereColor'
export { godRaysFromStar } from './render/godRaysFromStar'
export { hexGraphicsUniforms } from './render/hexGraphicsUniforms'
export {
  registerResourceVisual,
  getResourceVisual,
} from './render/resourceVisualRegistry'
export type { ResourceVisual } from './render/resourceVisualRegistry'

// ── Scene display helpers ───────────────────────────────────────
export {
  BODY_TYPE_LABEL,
  BODY_TYPE_COLOR,
  hasAtmosphere,
  atmosphereRadius,
  auraParamsFor,
  cloudCoverageFor,
} from './render/sceneBodyUtils'

// ── Interaction ──────────────────────────────────────────────────
export { findBodyIndex, raycastBodies } from './render/bodyRaycast'
export type { RaycastBody, RaycastBodiesOptions, RaycastHit } from './render/bodyRaycast'
