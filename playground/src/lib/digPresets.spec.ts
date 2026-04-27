import { describe, it, expect } from 'vitest'
import {
  DIG_IMPACT_PRESETS,
  applyDigPreset,
  findMatchingDigPreset,
  getDigPreset,
  type DigImpactPresetId,
} from './digPresets'
import type { DigOptions } from './useTileDig'

function blankOptions(): DigOptions {
  return { centerDrop: 0, radius: 0 }
}

describe('DIG_IMPACT_PRESETS', () => {
  it('exposes four presets with unique ids and non-empty labels / hints', () => {
    expect(DIG_IMPACT_PRESETS).toHaveLength(4)
    const ids = new Set<string>()
    for (const p of DIG_IMPACT_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.hint.length).toBeGreaterThan(0)
      ids.add(p.id)
    }
    expect(ids.size).toBe(4)
  })

  it('keeps every preset inside the sliders ranges declared in DigControls.vue', () => {
    // Hard ranges wired on the dig sliders — a preset writing outside them
    // would push the UI to a value the user cannot reach with the controls,
    // which would make the preset un-editable after apply.
    for (const p of DIG_IMPACT_PRESETS) {
      expect(p.centerDrop).toBeGreaterThanOrEqual(1)
      expect(p.centerDrop).toBeLessThanOrEqual(12)
      expect(Number.isInteger(p.centerDrop)).toBe(true)
      expect(p.radius).toBeGreaterThanOrEqual(0)
      expect(p.radius).toBeLessThanOrEqual(6)
      expect(Number.isInteger(p.radius)).toBe(true)
    }
  })

  it('grows monotonically in both knobs — each preset is at least as strong as the previous one', () => {
    // The picker presents presets from surgical to cataclysmic; mixing that
    // ordering would leave the user scanning a non-monotone list.
    for (let i = 1; i < DIG_IMPACT_PRESETS.length; i++) {
      expect(DIG_IMPACT_PRESETS[i].centerDrop).toBeGreaterThanOrEqual(DIG_IMPACT_PRESETS[i - 1].centerDrop)
      expect(DIG_IMPACT_PRESETS[i].radius).toBeGreaterThanOrEqual(DIG_IMPACT_PRESETS[i - 1].radius)
    }
  })

  it('pairs are pairwise distinct — each (centerDrop, radius) appears only once', () => {
    // Two presets with the same combo would both read as the "active" one
    // after apply, breaking the picker's round trip.
    const seen = new Set<string>()
    for (const p of DIG_IMPACT_PRESETS) seen.add(`${p.centerDrop}/${p.radius}`)
    expect(seen.size).toBe(DIG_IMPACT_PRESETS.length)
  })
})

describe('applyDigPreset', () => {
  it('writes both tracked knobs onto the options', () => {
    const opts = blankOptions()
    const meteorite = DIG_IMPACT_PRESETS.find(p => p.id === 'meteorite')!
    applyDigPreset(opts, meteorite)
    expect(opts.centerDrop).toBe(meteorite.centerDrop)
    expect(opts.radius).toBe(meteorite.radius)
  })

  it('overwrites previous preset values when a new preset is applied on top', () => {
    const opts = blankOptions()
    const a = DIG_IMPACT_PRESETS.find(p => p.id === 'pelle')!
    const b = DIG_IMPACT_PRESETS.find(p => p.id === 'catastrophe')!
    applyDigPreset(opts, a)
    applyDigPreset(opts, b)
    expect(opts.centerDrop).toBe(b.centerDrop)
    expect(opts.radius).toBe(b.radius)
  })
})

describe('findMatchingDigPreset', () => {
  it('returns the preset id right after applyDigPreset', () => {
    for (const preset of DIG_IMPACT_PRESETS) {
      const opts = blankOptions()
      applyDigPreset(opts, preset)
      expect(findMatchingDigPreset(opts)).toBe(preset.id)
    }
  })

  it('returns null when a single knob diverges from every preset', () => {
    const opts = blankOptions()
    applyDigPreset(opts, DIG_IMPACT_PRESETS[0])
    opts.centerDrop = 99 // no preset uses 99
    expect(findMatchingDigPreset(opts)).toBeNull()
  })

  it('returns null when only the radius diverges — both knobs are tracked', () => {
    // Guards against a user-tweaked radius silently reading as a preset
    // match, which would mislabel the picker.
    const opts = blankOptions()
    applyDigPreset(opts, DIG_IMPACT_PRESETS.find(p => p.id === 'mine')!)
    opts.radius = 5 // mine uses 1
    expect(findMatchingDigPreset(opts)).toBeNull()
  })
})

describe('getDigPreset', () => {
  it('returns the preset object for every declared id', () => {
    for (const preset of DIG_IMPACT_PRESETS) {
      expect(getDigPreset(preset.id)).toBe(preset)
    }
  })

  it('returns undefined for an unknown id (TypeScript cast escape hatch)', () => {
    expect(getDigPreset('nope' as DigImpactPresetId)).toBeUndefined()
  })
})
