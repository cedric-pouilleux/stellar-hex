import type { BodyConfig } from '@lib'

/**
 * Canonical terrain-noise preset identifiers. Kept as a union so callers
 * can match on them exhaustively (e.g. a tooltip table keyed by id).
 */
export type TerrainPresetId =
  | 'flat'
  | 'rolling'
  | 'eroded'
  | 'mountainous'
  | 'tectonic'
  | 'archipelago'

/**
 * Snapshot of the six knobs a preset writes in one shot. `noisePower`
 * is deliberately left out: its effect on the hex view is suppressed by the
 * rank-based band quantisation (only the shader preview's shoreline re-samples
 * the raw simplex), so presets would rewrite it without visible change and
 * stomp on user tweaks elsewhere.
 */
export interface TerrainPreset {
  /** Stable identifier — also the `<option>` value in the picker. */
  id:    TerrainPresetId
  /** Short human-readable label for the select. */
  label: string
  /** One-line hint shown under the select when the preset is active. */
  hint:  string
  /** Base sampling frequency on the unit sphere (large value → small patches). */
  noiseScale:       number
  /** fBm octave count (≥ 2 to let persistence / lacunarity shape the relief). */
  noiseOctaves:     number
  /** Amplitude decay per octave — lower → smoother, higher → noisier. */
  noisePersistence: number
  /** Frequency growth per octave — typically ≈ 2 for a self-similar fBm. */
  noiseLacunarity:  number
  /** Ridge-multifractal mix in `[0, 1]` — 0 = none, 1 = full ridges. */
  noiseRidge:       number
  /**
   * Post-quantisation contraction towards the top band in `[0, 1]` — pushes
   * visible relief flat while keeping the full extraction depth. `0` on every
   * "live" preset; only the `flat` preset raises it so steppes read genuinely
   * level instead of merely smooth.
   */
  reliefFlatness:   number
}

/**
 * Ordered list of topology presets.
 *
 * Each preset trades spatial frequency, fractal richness and ridge mix to
 * approximate a recognisable landscape family. Because the simulation uses
 * rank-based band quantisation, none of these presets changes the **vertical**
 * distribution of elevations — every preset still fills all `N` bands; what
 * differs is how tiles cluster spatially (large soft patches vs. fragmented
 * archipelagos vs. sharp ridges).
 *
 * "Flat / steppes" pushes as low as the knob set allows: a low-frequency
 * two-octave fBm keeps adjacent tiles in similar bands so neighbouring
 * elevations stay close, even though the full band range is still present.
 */
export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  {
    id:    'flat',
    label: 'Plat / steppes',
    hint:  'Plateau quasi uniforme, shell d\'extraction intacte sous la surface.',
    noiseScale:       0.6,
    noiseOctaves:     2,
    noisePersistence: 0.35,
    noiseLacunarity:  2.0,
    noiseRidge:       0,
    reliefFlatness:   0.85,
  },
  {
    id:    'rolling',
    label: 'Vallonné',
    hint:  'Collines organiques, pas d\'arête.',
    noiseScale:       1.4,
    noiseOctaves:     3,
    noisePersistence: 0.5,
    noiseLacunarity:  2.0,
    noiseRidge:       0,
    reliefFlatness:   0,
  },
  {
    id:    'eroded',
    label: 'Collines érodées',
    hint:  'Détail moyen, quelques crêtes arrondies.',
    noiseScale:       2.2,
    noiseOctaves:     4,
    noisePersistence: 0.55,
    noiseLacunarity:  2.1,
    noiseRidge:       0.2,
    reliefFlatness:   0,
  },
  {
    id:    'mountainous',
    label: 'Montagneux',
    hint:  'Arêtes acérées, relief fractal.',
    noiseScale:       1.8,
    noiseOctaves:     5,
    noisePersistence: 0.55,
    noiseLacunarity:  2.2,
    noiseRidge:       0.7,
    reliefFlatness:   0,
  },
  {
    id:    'tectonic',
    label: 'Tectonique',
    hint:  'Chaînes ridgées dominantes.',
    noiseScale:       2.8,
    noiseOctaves:     5,
    noisePersistence: 0.6,
    noiseLacunarity:  2.3,
    noiseRidge:       1.0,
    reliefFlatness:   0,
  },
  {
    id:    'archipelago',
    label: 'Archipel fragmenté',
    hint:  'Petites taches dispersées.',
    noiseScale:       3.5,
    noiseOctaves:     4,
    noisePersistence: 0.65,
    noiseLacunarity:  2.0,
    noiseRidge:       0,
    reliefFlatness:   0,
  },
] as const

/** Default values the lib falls back to when a knob is omitted on `BodyConfig`. */
const NOISE_DEFAULTS = {
  scale:       1.4,
  octaves:     1,
  persistence: 0.5,
  lacunarity:  2.0,
  ridge:       0,
  flatness:    0,
} as const

/**
 * Writes the five fBm knobs of `preset` onto `config` in place. The mutation
 * is intentionally direct (no deep clone) so a Vue reactive `BodyConfig`
 * picks up each field change through its own watchers — the playground
 * bumps `rebuildKey` through those watchers, which keeps the preset
 * application consistent with any other slider tweak.
 */
export function applyTerrainPreset(config: BodyConfig, preset: TerrainPreset): void {
  config.noiseScale       = preset.noiseScale
  config.noiseOctaves     = preset.noiseOctaves
  config.noisePersistence = preset.noisePersistence
  config.noiseLacunarity  = preset.noiseLacunarity
  config.noiseRidge       = preset.noiseRidge
  config.reliefFlatness   = preset.reliefFlatness
}

/**
 * Returns the id of the preset whose six tracked knobs match `config`
 * exactly, or `null` when the current settings do not correspond to any
 * canonical preset (i.e. the user is in a custom tweak).
 *
 * Omitted fields on `config` are compared against the lib's own defaults
 * (`noiseScale = 1.4`, `noiseOctaves = 1`, `noisePersistence = 0.5`,
 * `noiseLacunarity = 2.0`, `noiseRidge = 0`, `reliefFlatness = 0`) so a
 * freshly-constructed `BodyConfig` still resolves to a preset when one matches.
 */
export function findMatchingPreset(config: BodyConfig): TerrainPresetId | null {
  const scale       = config.noiseScale       ?? NOISE_DEFAULTS.scale
  const octaves     = config.noiseOctaves     ?? NOISE_DEFAULTS.octaves
  const persistence = config.noisePersistence ?? NOISE_DEFAULTS.persistence
  const lacunarity  = config.noiseLacunarity  ?? NOISE_DEFAULTS.lacunarity
  const ridge       = config.noiseRidge       ?? NOISE_DEFAULTS.ridge
  const flatness    = config.reliefFlatness   ?? NOISE_DEFAULTS.flatness
  for (const p of TERRAIN_PRESETS) {
    if (
      scale       === p.noiseScale       &&
      octaves     === p.noiseOctaves     &&
      persistence === p.noisePersistence &&
      lacunarity  === p.noiseLacunarity  &&
      ridge       === p.noiseRidge       &&
      flatness    === p.reliefFlatness
    ) return p.id
  }
  return null
}

/** Convenience lookup: id → preset, or `undefined` when the id is unknown. */
export function getTerrainPreset(id: TerrainPresetId): TerrainPreset | undefined {
  return TERRAIN_PRESETS.find(p => p.id === id)
}
