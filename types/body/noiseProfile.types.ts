/**
 * fBm noise profile — controls the simplex sampling + reshaping that drives
 * tile elevations in the simulation. Pure-logic; no other-file dependency.
 */

/**
 * Parameters of the fBm noise field used to derive tile elevations. All
 * fields are optional — omitting the whole profile reproduces the default
 * simplex sampling (`noiseScale = 1.4`, single octave, no reshaping).
 *
 * Shared by both planetary and stellar bodies — the simulation runs the
 * same band-quantisation pipeline for stars (whose visible relief stays
 * flat thanks to the strategy `flatSurface = true`).
 */
export interface BodyNoiseProfile {
  /** Base simplex frequency. Default `1.4`. */
  noiseScale?:          number
  /**
   * Number of fBm octaves summed to build the terrain noise field.
   * `1` reproduces a single simplex sample (legacy behaviour); higher values
   * stack detail at increasing frequencies. Defaults to `1`.
   */
  noiseOctaves?:        number
  /**
   * Amplitude decay applied at each subsequent fBm octave, in `(0, 1]`.
   * Standard fractal noise uses `0.5`: octave `k` contributes `persistence^k`
   * of octave 0's amplitude. Lower values mute high-frequency octaves,
   * higher values keep them louder. Defaults to `0.5`.
   */
  noisePersistence?:    number
  /**
   * Frequency multiplier between successive fBm octaves. `2` doubles the
   * frequency per octave (classic Mandelbrot-style fractal). Defaults to `2`.
   */
  noiseLacunarity?:     number
  /**
   * Exponent applied to the (signed) noise value for distribution reshaping:
   * `sign(n) * |n|^p`. Defaults to `1`.
   *
   * NOTE: hex tile elevations use equal-frequency quantisation so are
   * invariant to any monotone transform of the noise — this knob therefore
   * leaves per-tile bands unchanged. Its observable effect is on raw noise
   * readers such as the smooth-sphere ocean-mask shader, where the value
   * at each band's upper edge (see `bandToNoiseThreshold`) is reshaped.
   */
  noisePower?:          number
  /**
   * Mix towards a ridge-multifractal transform in `[0, 1]`. `0` keeps the
   * plain fBm; `1` replaces it with `1 - 2 * |n|`, which turns the crests
   * of the noise into sharp mountain ridges. Defaults to `0`.
   */
  noiseRidge?:          number
  /**
   * Macro continent amplitude in `[0, 1]`. Adds a low-frequency 3D voronoi
   * mask on top of the simplex elevation field — `0` disables the layer
   * entirely (rétrocompat); `0.5–1.0` produces discrete landmasses (style
   * Pangée / archipelago) instead of the moiré micro-island pattern a pure
   * FBM gives on humid worlds.
   *
   * The mask is deterministic from `BodyConfig.name` so two bodies with the
   * same name grow identical continents. Same field is consumed by the GLSL
   * `liquidMask` so the shader sphere matches the hex tile classification.
   */
  continentAmount?:     number
  /**
   * Voronoi frequency for the continent mask, in `[1, 3]`. Defaults to `1`.
   * Higher values subdivide the sphere into more cells — fewer, larger
   * landmasses at `1`, archipelago of smaller continents at `3`.
   */
  continentScale?:      number
  /**
   * Post-quantisation bias that contracts the rank-based band distribution
   * towards the top band `N - 1`, in `[0, 1]`. Defaults to `0`.
   *
   * The terrain simulator derives integer elevations via equal-frequency
   * banding (every band receives roughly the same tile count), which makes
   * the full staircase visible no matter how the noise is shaped. This knob
   * post-processes each assigned band as:
   *
   *   `b' = round((N - 1) - (1 - reliefFlatness) * (N - 1 - b))`
   *
   * At `0` the mapping is identity (current behaviour). At `1` every tile
   * collapses onto band `N - 1` and the planet is perfectly flat at `radius`.
   * Intermediate values flatten the relief while leaving the full extraction
   * depth (`N` bands) available — digging still descends all the way to the
   * core, revealing the shell that was hidden under the plateau.
   */
  reliefFlatness?:      number
}
