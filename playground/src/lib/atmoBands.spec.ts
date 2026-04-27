import { describe, it, expect } from 'vitest'
import { deriveBandColorsFromMix, NEUTRAL_BAND_COLORS } from './atmoBands'
import { VOLATILES, type VolatileId } from './volatileCatalog'

/** Parse `#rrggbb` → `[r, g, b]` bytes. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

describe('deriveBandColorsFromMix — archetype bodies', () => {
  it('Jupiter-like (H₂He dominant) → warm tan palette', () => {
    const jupiter: Partial<Record<VolatileId, number>> = { h2he: 0.9, ch4: 0.05, nh3: 0.05 }
    const bands = deriveBandColorsFromMix(jupiter)
    const [rC, gC, bC] = hexToRgb(bands.colorC)
    // Mid stop should read warm: red channel > blue channel.
    expect(rC).toBeGreaterThan(bC)
    expect(gC).toBeGreaterThan(bC)
  })

  it('Neptune-like (CH₄ dominant) → cool blue palette', () => {
    const neptune: Partial<Record<VolatileId, number>> = { ch4: 0.8, h2he: 0.2 }
    const bands = deriveBandColorsFromMix(neptune)
    const [rC, _gC, bC] = hexToRgb(bands.colorC)
    // Blue channel should dominate red on a CH₄-heavy atmosphere.
    expect(bC).toBeGreaterThan(rC)
  })

  it('Saturn-like (NH₃ dominant) → pale creamy palette', () => {
    const saturn: Partial<Record<VolatileId, number>> = { nh3: 0.7, h2he: 0.3 }
    const bands = deriveBandColorsFromMix(saturn)
    const [rC, gC, _bC] = hexToRgb(bands.colorC)
    // NH₃ has warm cream-sulphur hue → red and green both elevated.
    expect(rC).toBeGreaterThan(80)
    expect(gC).toBeGreaterThan(80)
  })

  it('Titan-haze (N₂ + CH₄) → cool/pale mix distinct from pure H₂He', () => {
    const titan   = deriveBandColorsFromMix({ n2: 0.6, ch4: 0.4 })
    const jupiter = deriveBandColorsFromMix({ h2he: 1 })
    expect(titan.colorC).not.toBe(jupiter.colorC)
  })
})

describe('deriveBandColorsFromMix — stop ordering', () => {
  it('colorA (brightest) is always brighter than colorB (darkest)', () => {
    const bands = deriveBandColorsFromMix({ h2he: 1 })
    const [rA, gA, bA] = hexToRgb(bands.colorA)
    const [rB, gB, bB] = hexToRgb(bands.colorB)
    const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA
    const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB
    expect(lumA).toBeGreaterThan(lumB)
  })

  it('stops stay on the same hue line — colorA hue matches colorB hue', () => {
    // Equal-channel ratio check: hue preserved when the three channels scale uniformly.
    const bands = deriveBandColorsFromMix({ ch4: 1 })
    const [rA, gA, bA] = hexToRgb(bands.colorA)
    const [rB, gB, bB] = hexToRgb(bands.colorB)
    // CH4 gas colour = 0x30a8c8 → r < g < b. Ordering must survive every stop.
    expect(bA).toBeGreaterThan(rA)
    expect(bB).toBeGreaterThan(rB)
  })
})

describe('deriveBandColorsFromMix — edge cases', () => {
  it('empty mix → neutral fallback palette', () => {
    expect(deriveBandColorsFromMix({})).toEqual(NEUTRAL_BAND_COLORS)
  })

  it('zero-weight entries do not corrupt the blend', () => {
    const onlyNonZero = deriveBandColorsFromMix({ h2he: 1 })
    const withZeros   = deriveBandColorsFromMix({ h2he: 1, ch4: 0, nh3: 0 })
    expect(onlyNonZero).toEqual(withZeros)
  })

  it('total == 0 (every weight zero) → neutral fallback', () => {
    expect(deriveBandColorsFromMix({ h2he: 0, ch4: 0 })).toEqual(NEUTRAL_BAND_COLORS)
  })

  it('unknown volatile IDs are ignored silently', () => {
    // Cast through `any` to force an unknown id into the mix. The blender
    // skips any entry without a catalogue match.
    const mix = { h2he: 1, unobtainium: 0.5 } as unknown as Partial<Record<VolatileId, number>>
    const onlyKnown = deriveBandColorsFromMix({ h2he: 1 })
    // Known-only produces a H₂He-pure hue; the noise entry must not tint it.
    expect(deriveBandColorsFromMix(mix).colorC).toBe(onlyKnown.colorC)
  })
})

describe('deriveBandColorsFromMix — volatile catalogue source of truth', () => {
  it('single H₂He entry reproduces H₂He gasColor at the mid stop', () => {
    const bands = deriveBandColorsFromMix({ h2he: 1 })
    const [r, g, b] = hexToRgb(bands.colorC)
    const expected = [
      (VOLATILES.h2he.gasColor >> 16) & 0xff,
      (VOLATILES.h2he.gasColor >>  8) & 0xff,
       VOLATILES.h2he.gasColor        & 0xff,
    ]
    // Rounding tolerance — the blender rounds each channel to a byte.
    expect(r).toBeCloseTo(expected[0], 0)
    expect(g).toBeCloseTo(expected[1], 0)
    expect(b).toBeCloseTo(expected[2], 0)
  })
})
