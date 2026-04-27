import { describe, it, expect } from 'vitest'
import type { BodyConfig } from '@lib'
import {
  TERRAIN_PRESETS,
  applyTerrainPreset,
  findMatchingPreset,
  getTerrainPreset,
  type TerrainPresetId,
} from './terrainPresets'

function blankConfig(): BodyConfig {
  return {
    name:           'preset-test',
    type:           'rocky',
    radius:         1,
    temperatureMin: -10,
    temperatureMax: 30,
    rotationSpeed:  0,
    axialTilt:      0,
  }
}

describe('TERRAIN_PRESETS', () => {
  it('exposes six presets with unique ids and non-empty labels / hints', () => {
    expect(TERRAIN_PRESETS).toHaveLength(6)
    const ids = new Set<string>()
    for (const p of TERRAIN_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.hint.length).toBeGreaterThan(0)
      ids.add(p.id)
    }
    expect(ids.size).toBe(6)
  })

  it('keeps every preset inside the sliders ranges declared in BodyControls.vue', () => {
    // Hard ranges wired on the Terrain noise sliders — a preset writing
    // outside them would push the UI to a value the user cannot reach with
    // the controls, which would make the preset un-editable after apply.
    for (const p of TERRAIN_PRESETS) {
      expect(p.noiseScale).toBeGreaterThanOrEqual(0.1)
      expect(p.noiseScale).toBeLessThanOrEqual(8)
      expect(p.noiseOctaves).toBeGreaterThanOrEqual(1)
      expect(p.noiseOctaves).toBeLessThanOrEqual(8)
      expect(Number.isInteger(p.noiseOctaves)).toBe(true)
      expect(p.noisePersistence).toBeGreaterThanOrEqual(0)
      expect(p.noisePersistence).toBeLessThanOrEqual(1)
      expect(p.noiseLacunarity).toBeGreaterThanOrEqual(1)
      expect(p.noiseLacunarity).toBeLessThanOrEqual(4)
      expect(p.noiseRidge).toBeGreaterThanOrEqual(0)
      expect(p.noiseRidge).toBeLessThanOrEqual(1)
      expect(p.reliefFlatness).toBeGreaterThanOrEqual(0)
      expect(p.reliefFlatness).toBeLessThanOrEqual(1)
    }
  })

  it('only the flat preset uses a non-zero reliefFlatness', () => {
    // Other presets express relief via fBm shaping; mixing flatness into
    // "mountainous" or "tectonic" would squash the very relief they aim
    // to expose. Only "flat / steppes" opts in so steppes read genuinely
    // level instead of merely smooth.
    for (const p of TERRAIN_PRESETS) {
      if (p.id === 'flat') expect(p.reliefFlatness).toBeGreaterThan(0)
      else                 expect(p.reliefFlatness).toBe(0)
    }
  })

  it('uses ≥ 2 octaves on every non-flat preset so persistence actually applies', () => {
    // persistence only affects the fBm sum between octaves — a preset with
    // octaves=1 would silently ignore persistence. "Flat" is the single
    // exception: its low-detail pitch tolerates octaves=2 but not less.
    for (const p of TERRAIN_PRESETS) {
      expect(p.noiseOctaves).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('applyTerrainPreset', () => {
  it('writes the six tracked knobs onto the config', () => {
    const cfg = blankConfig()
    const mountain = TERRAIN_PRESETS.find(p => p.id === 'mountainous')!
    applyTerrainPreset(cfg, mountain)
    expect(cfg.noiseScale).toBe(mountain.noiseScale)
    expect(cfg.noiseOctaves).toBe(mountain.noiseOctaves)
    expect(cfg.noisePersistence).toBe(mountain.noisePersistence)
    expect(cfg.noiseLacunarity).toBe(mountain.noiseLacunarity)
    expect(cfg.noiseRidge).toBe(mountain.noiseRidge)
    expect(cfg.reliefFlatness).toBe(mountain.reliefFlatness)
  })

  it('leaves unrelated fields untouched (name, radius, noisePower, …)', () => {
    const cfg = blankConfig()
    cfg.name       = 'keep-me'
    cfg.radius     = 3.2
    cfg.noisePower = 2.5
    applyTerrainPreset(cfg, TERRAIN_PRESETS[0])
    expect(cfg.name).toBe('keep-me')
    expect(cfg.radius).toBe(3.2)
    expect(cfg.noisePower).toBe(2.5)
  })

  it('overwrites previous preset values when a new preset is applied on top', () => {
    const cfg = blankConfig()
    const a = TERRAIN_PRESETS.find(p => p.id === 'tectonic')!
    const b = TERRAIN_PRESETS.find(p => p.id === 'flat')!
    applyTerrainPreset(cfg, a)
    applyTerrainPreset(cfg, b)
    expect(cfg.noiseScale).toBe(b.noiseScale)
    expect(cfg.noiseRidge).toBe(b.noiseRidge)
    expect(cfg.reliefFlatness).toBe(b.reliefFlatness)
  })

  it('resets reliefFlatness back to 0 when switching from flat to any other preset', () => {
    // Regression guard — a sticky flatness after switching presets would
    // silently kill the relief of "mountainous" / "tectonic" etc.
    const cfg = blankConfig()
    applyTerrainPreset(cfg, TERRAIN_PRESETS.find(p => p.id === 'flat')!)
    expect(cfg.reliefFlatness).toBeGreaterThan(0)
    applyTerrainPreset(cfg, TERRAIN_PRESETS.find(p => p.id === 'mountainous')!)
    expect(cfg.reliefFlatness).toBe(0)
  })
})

describe('findMatchingPreset', () => {
  it('returns the preset id right after applyTerrainPreset', () => {
    for (const preset of TERRAIN_PRESETS) {
      const cfg = blankConfig()
      applyTerrainPreset(cfg, preset)
      expect(findMatchingPreset(cfg)).toBe(preset.id)
    }
  })

  it('returns null when a single knob diverges from every preset', () => {
    const cfg = blankConfig()
    applyTerrainPreset(cfg, TERRAIN_PRESETS[0])
    cfg.noiseRidge = 0.42 // none of the presets uses 0.42
    expect(findMatchingPreset(cfg)).toBeNull()
  })

  it('returns null when only reliefFlatness diverges — it is a tracked knob', () => {
    // Guards against a user-tweaked flatness silently reading as a preset
    // match, which would mislabel the picker and make the custom value
    // look "canonical".
    const cfg = blankConfig()
    applyTerrainPreset(cfg, TERRAIN_PRESETS.find(p => p.id === 'rolling')!)
    cfg.reliefFlatness = 0.3 // rolling uses 0
    expect(findMatchingPreset(cfg)).toBeNull()
  })

  it('matches against lib defaults when noise fields are omitted on the config', () => {
    // Blank config → noiseScale=1.4, octaves=1, persistence=0.5, lacunarity=2,
    // ridge=0. All presets use octaves ≥ 2, so no preset can match a blank
    // config — the picker must fall back to "Personnalisé".
    const cfg = blankConfig()
    expect(findMatchingPreset(cfg)).toBeNull()
  })
})

describe('getTerrainPreset', () => {
  it('returns the preset object for every declared id', () => {
    for (const preset of TERRAIN_PRESETS) {
      expect(getTerrainPreset(preset.id)).toBe(preset)
    }
  })

  it('returns undefined for an unknown id (TypeScript cast escape hatch)', () => {
    expect(getTerrainPreset('nope' as TerrainPresetId)).toBeUndefined()
  })
})
