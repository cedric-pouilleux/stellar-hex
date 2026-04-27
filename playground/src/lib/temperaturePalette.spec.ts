import { describe, it, expect } from 'vitest'
import type { BodyConfig } from '@lib'
import {
  deriveTemperatureAnchors,
  deriveLavaColor,
  TEMPERATURE_PALETTE_BANDS,
} from './temperaturePalette'

/** Minimal rocky-body builder — only the temperature fields matter for the palette. */
function rocky(tempMin: number, tempMax: number, overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    type:           'rocky',
    name:           'test',
    radius:         1,
    rotationSpeed:  0.01,
    axialTilt:      0,
    temperatureMin: tempMin,
    temperatureMax: tempMax,
    ...overrides,
  }
}

describe('deriveTemperatureAnchors', () => {
  it('returns the volcanic anchors for a Io-class body (T_avg > 400 °C)', () => {
    const a = deriveTemperatureAnchors(rocky(380, 460))
    expect(a.colorLow).toBe('#2a0a02')
    expect(a.colorHigh).toBe('#c44820')
  })

  it('returns the scorched anchors for a Venus-class body (200 < T_avg ≤ 400)', () => {
    const a = deriveTemperatureAnchors(rocky(380, 480))
    // T_avg = 430 → still volcanic — sanity check the boundary is on T_avg, not on tempMax.
    expect(a.colorHigh).toBe('#c44820')

    const venus = deriveTemperatureAnchors(rocky(420, 470))   // T_avg = 445 → volcanic
    expect(venus.colorHigh).toBe('#c44820')

    const hotEnough = deriveTemperatureAnchors(rocky(400, 420)) // T_avg = 410 → still volcanic
    expect(hotEnough.colorHigh).toBe('#c44820')

    const justBelow = deriveTemperatureAnchors(rocky(380, 410)) // T_avg = 395 → scorched
    expect(justBelow.colorLow).toBe('#3a1808')
    expect(justBelow.colorHigh).toBe('#c08040')
  })

  it('returns the arid anchors for a hot-desert body (50 ≤ T_avg < 200)', () => {
    const a = deriveTemperatureAnchors(rocky(0, 200))            // T_avg = 100
    expect(a.colorLow).toBe('#4a3520')
    expect(a.colorHigh).toBe('#d4b478')
  })

  it('returns the temperate anchors for an Earth-like body (-20 ≤ T_avg < 50)', () => {
    const earth = deriveTemperatureAnchors(rocky(0, 30))         // T_avg = 15
    expect(earth.colorLow).toBe('#2c2820')
    expect(earth.colorHigh).toBe('#8a8270')
  })

  it('returns the cold anchors for a tundra body (-80 ≤ T_avg < -20)', () => {
    const mars = deriveTemperatureAnchors(rocky(-100, 0))        // T_avg = -50
    expect(mars.colorLow).toBe('#3a3a40')
    expect(mars.colorHigh).toBe('#aab0bc')
  })

  it('returns the glacial anchors for an ice-moon body (T_avg < -80)', () => {
    const titan = deriveTemperatureAnchors(rocky(-200, -160))    // T_avg = -180
    expect(titan.colorLow).toBe('#404a58')
    expect(titan.colorHigh).toBe('#d8e4f0')
  })

  it('is deterministic — same inputs yield the same anchors', () => {
    const a = deriveTemperatureAnchors(rocky(10, 20))
    const b = deriveTemperatureAnchors(rocky(10, 20))
    expect(a).toEqual(b)
  })

  it('keys on the mean temperature, not on tempMin or tempMax alone', () => {
    // Wide swing (-200 → +200) → T_avg = 0 → temperate, not glacial nor volcanic.
    const wide = deriveTemperatureAnchors(rocky(-200, 200))
    expect(wide.colorLow).toBe('#2c2820')
  })

  it('matches at the band boundary inclusively (T_avg === minTempC)', () => {
    // T_avg = 50 lands in the arid band (50 is its inclusive lower bound).
    const exact = deriveTemperatureAnchors(rocky(50, 50))
    expect(exact.colorLow).toBe('#4a3520')
  })
})

describe('TEMPERATURE_PALETTE_BANDS', () => {
  it('exposes six bands ordered hottest → coldest', () => {
    expect(TEMPERATURE_PALETTE_BANDS).toHaveLength(6)
    for (let i = 1; i < TEMPERATURE_PALETTE_BANDS.length; i++) {
      expect(TEMPERATURE_PALETTE_BANDS[i].minTempC)
        .toBeLessThan(TEMPERATURE_PALETTE_BANDS[i - 1].minTempC)
    }
  })

  it('terminates with a -Infinity floor so any finite input matches a band', () => {
    const last = TEMPERATURE_PALETTE_BANDS[TEMPERATURE_PALETTE_BANDS.length - 1]
    expect(last.minTempC).toBe(-Infinity)
  })

  it('exposes a label for every band', () => {
    for (const band of TEMPERATURE_PALETTE_BANDS) {
      expect(band.label.length).toBeGreaterThan(0)
    }
  })
})

describe('deriveLavaColor', () => {
  it('returns the bright orange peak above 200°C', () => {
    expect(deriveLavaColor(rocky(300, 500))).toBe('#ff5500')   // T_avg = 400
    expect(deriveLavaColor(rocky(180, 240))).toBe('#ff5500')   // T_avg = 210
  })

  it('returns saturated red between 100°C and 200°C inclusive', () => {
    expect(deriveLavaColor(rocky(120, 180))).toBe('#ff3300')   // T_avg = 150
    expect(deriveLavaColor(rocky(200, 200))).toBe('#ff3300')   // T_avg = 200 (boundary, not strict >)
  })

  it('returns the dark red fallback at and below 100°C', () => {
    expect(deriveLavaColor(rocky(20, 80))).toBe('#cc2200')      // T_avg = 50
    expect(deriveLavaColor(rocky(100, 100))).toBe('#cc2200')   // T_avg = 100 boundary
    expect(deriveLavaColor(rocky(-200, 0))).toBe('#cc2200')    // T_avg = -100
  })

  it('is deterministic for any given temperature pair', () => {
    expect(deriveLavaColor(rocky(50, 150))).toBe(deriveLavaColor(rocky(50, 150)))
  })
})
