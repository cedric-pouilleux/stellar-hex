import type { DigOptions } from './useTileDig'

/**
 * Canonical dig-impact identifiers. Exposed as a union so callers can match
 * exhaustively (e.g. a tooltip keyed by id).
 */
export type DigImpactPresetId =
  | 'pelle'
  | 'mine'
  | 'meteorite'
  | 'catastrophe'

/**
 * Snapshot of the two knobs an impact preset writes in one shot: the central
 * drop (bands removed from the clicked tile) and the BFS reach in neighbour
 * rings. Every other dig-related state is left untouched.
 */
export interface DigImpactPreset {
  /** Stable identifier — also the `<option>` value in the picker. */
  id:    DigImpactPresetId
  /** Short human-readable label for the select. */
  label: string
  /** One-line hint shown under the select when this preset is active. */
  hint:  string
  /** Bands removed from the central tile — seeds the cone-shaped drop. */
  centerDrop: number
  /** Neighbour-ring reach; `0` = single tile, `1` = +direct neighbours, … */
  radius:     number
}

/**
 * Ordered list of impact presets, from surgical to cataclysmic. Values stay
 * within the sliders declared in `DigControls.vue` (centerDrop 1..12,
 * radius 0..6) so picking a preset and then tweaking a slider remains a
 * reversible round trip — the picker reads back as "Personnalisé" only
 * when a slider actually diverges from every canonical combo.
 */
export const DIG_IMPACT_PRESETS: readonly DigImpactPreset[] = [
  {
    id:    'pelle',
    label: 'Pelle',
    hint:  'Creuse une seule tuile d\'une bande — outil chirurgical.',
    centerDrop: 1,
    radius:     0,
  },
  {
    id:    'mine',
    label: 'Mine',
    hint:  'Petit cratère conique, deux bandes au centre.',
    centerDrop: 2,
    radius:     1,
  },
  {
    id:    'meteorite',
    label: 'Météorite',
    hint:  'Impact moyen, quatre bandes au centre et deux anneaux affectés.',
    centerDrop: 4,
    radius:     2,
  },
  {
    id:    'catastrophe',
    label: 'Catastrophe',
    hint:  'Événement cataclysmique — huit bandes, quatre anneaux.',
    centerDrop: 8,
    radius:     4,
  },
] as const

/**
 * Writes the two knobs of `preset` onto `options` in place. Mutation is
 * intentionally direct so a Vue reactive `DigOptions` picks up the change
 * through its own watchers without needing a fresh reference.
 */
export function applyDigPreset(options: DigOptions, preset: DigImpactPreset): void {
  options.centerDrop = preset.centerDrop
  options.radius     = preset.radius
}

/**
 * Returns the id of the preset whose two knobs match `options` exactly, or
 * `null` when the current settings do not correspond to any canonical impact
 * (i.e. the user is in a custom tweak).
 */
export function findMatchingDigPreset(options: DigOptions): DigImpactPresetId | null {
  for (const p of DIG_IMPACT_PRESETS) {
    if (options.centerDrop === p.centerDrop && options.radius === p.radius) return p.id
  }
  return null
}

/** Convenience lookup: id → preset, or `undefined` when the id is unknown. */
export function getDigPreset(id: DigImpactPresetId): DigImpactPreset | undefined {
  return DIG_IMPACT_PRESETS.find(p => p.id === id)
}
