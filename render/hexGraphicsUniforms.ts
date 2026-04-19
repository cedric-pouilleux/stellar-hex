/**
 * Three.js-compatible uniform objects for hex-tile visual effects.
 *
 * Kept as plain `{ value }` bags (no Vue reactivity) so they can be passed
 * directly into shader uniforms and imported from Vue-free code paths.
 *
 * Consumers wanting runtime tunables (debug panel, playground sliders)
 * mutate `.value` directly. The canonical default values live here.
 */

export const hexGraphicsUniforms = {
  // Toggles (0.0 / 1.0)
  uWaterEnabled:        { value: 1.0 },
  uTerrainBumpEnabled:  { value: 1.0 },
  uEdgeBlendEnabled:    { value: 1.0 },
  // When off, the ocean sphere's fragments are fully discarded — exposes the
  // hex sea-floor beneath for debugging / inspection.
  uOceanVisible:        { value: 1.0 },
  // Cloud shader params (continuous)
  uCloudOpacity:        { value: 0.90 },
  uCloudSpeed:          { value: 1.0 },
  // Atmosphere shader params (continuous)
  uAtmoOpacity:         { value: 1.0 },
  // Water shader params (continuous)
  uWaveStrength:        { value: 1.0 },
  uWaveSpeed:           { value: 2.8 },
  uSpecularIntensity:   { value: 0.9 },
  uDepthDarken:         { value: 0.50 },
  uOceanOpacity:        { value: 0.88 },
  // Terrain shader params (continuous)
  uBumpStrength:        { value: 2.0 },
  uEdgeBlendStrength:   { value: 0.25 },
}
