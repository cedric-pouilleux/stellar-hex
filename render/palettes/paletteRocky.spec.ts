import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  generateTerrainPalette,
  resolveSeaAnchor,
  DEFAULT_TERRAIN_LOW_COLOR,
  DEFAULT_TERRAIN_HIGH_COLOR,
} from './paletteRocky'
import { MIN_TERRAIN_LEVEL_COUNT, terrainBandLayout } from '../../physics/body'

// Neutral fallbacks the module hands out when the caller omits `liquidColor`.
const NEUTRAL_SEA    = '#2a3a4a'
const NEUTRAL_FROZEN = '#90b0c0'

describe('generateTerrainPalette — grayscale ramp', () => {
  it('emits exactly `levelCount` bands', () => {
    const palette = generateTerrainPalette(20, 1, 0.5)
    expect(palette).toHaveLength(20)
  })

  it('clamps below MIN to the minimum level count', () => {
    const palette = generateTerrainPalette(1, 1, 0.5)
    expect(palette).toHaveLength(MIN_TERRAIN_LEVEL_COUNT)
  })

  it('anchors band 0 to the default low colour and the top band to the default high colour', () => {
    const palette = generateTerrainPalette(16, 1, 0.5)
    expect(palette[0].color.equals(DEFAULT_TERRAIN_LOW_COLOR)).toBe(true)
    expect(palette[15].color.equals(DEFAULT_TERRAIN_HIGH_COLOR)).toBe(true)
  })

  it('honours caller-supplied low / high anchors', () => {
    const low  = new THREE.Color('#ff0000')
    const high = new THREE.Color('#00ff00')
    const palette = generateTerrainPalette(12, 1, 0.5, low, high)
    expect(palette[0].color.equals(low)).toBe(true)
    expect(palette[11].color.equals(high)).toBe(true)
  })

  it('accepts CSS / hex-number colour representations', () => {
    const palette = generateTerrainPalette(8, 1, 0.5, 0x111111, '#eeeeee')
    expect(palette[0].color.getHexString()).toBe('111111')
    expect(palette[7].color.getHexString()).toBe('eeeeee')
  })

  it('linearly interpolates luminance across the ramp (monotonic non-decreasing)', () => {
    const palette = generateTerrainPalette(20, 1, 0.5)
    // Default ramp is black → white → strictly monotonic luminance.
    for (let i = 1; i < palette.length; i++) {
      const prev = palette[i - 1].color
      const curr = palette[i].color
      const prevLum = prev.r + prev.g + prev.b
      const currLum = curr.r + curr.g + curr.b
      expect(currLum).toBeGreaterThan(prevLum)
    }
  })

  it('produces a uniform staircase: height[i] = i * unit from terrainBandLayout', () => {
    // Every adjacent pair of bands is separated by exactly `unit`, so the
    // gap between elev=0 and elev=1 equals the gap between elev=(N-2) and
    // elev=(N-1). No amplitude, no base offset — pure staircase.
    const palette = generateTerrainPalette(15, 2, 0.4)
    const layout  = terrainBandLayout(2, 0.4, 15)
    for (let i = 0; i < palette.length; i++) {
      expect(palette[i].height).toBeCloseTo(i * layout.unit, 12)
    }
  })

  it('anchors height[0] = 0 and height[N - 1] = shell (silhouette at radius)', () => {
    const palette = generateTerrainPalette(10, 3, 0.55)
    const layout  = terrainBandLayout(3, 0.55, 10)
    expect(palette[0].height).toBe(0)
    expect(palette[9].height).toBeCloseTo(layout.shell, 12)
  })

  it('routes integer elevation `i` straight to `palette[i]` via threshold encoding', () => {
    const palette = generateTerrainPalette(10, 1, 0.5)
    // Thresholds are [1, 2, ..., N-1, Infinity] so `elevation < threshold` resolves
    // uniquely to its own band.
    for (let i = 0; i < palette.length - 1; i++) {
      expect(palette[i].threshold).toBe(i + 1)
    }
    expect(palette[palette.length - 1].threshold).toBe(Infinity)
  })

  it('assigns sensible rocky material defaults to every band', () => {
    const palette = generateTerrainPalette(8, 1, 0.5)
    for (const band of palette) {
      expect(band.metalness).toBe(0)
      expect(band.roughness).toBeCloseTo(0.85, 6)
    }
  })
})

describe('resolveSeaAnchor', () => {
  it('passes the caller-supplied liquid colour through unchanged', () => {
    const anchor = resolveSeaAnchor('#336699', 'liquid')
    expect(anchor.color.getHexString()).toBe('336699')
  })

  it('accepts a hex number as well as a css string', () => {
    const anchor = resolveSeaAnchor(0x2878d0, 'liquid')
    expect(anchor.color.getHex()).toBe(0x2878d0)
  })

  it('state does not override the colour — frozen + explicit colour keeps the colour', () => {
    const anchor = resolveSeaAnchor(0xff00ff, 'frozen')
    expect(anchor.color.getHex()).toBe(0xff00ff)
  })

  it('falls back to a neutral sea colour when liquidColor is omitted (liquid state)', () => {
    const anchor = resolveSeaAnchor(undefined, 'liquid')
    expect(`#${anchor.color.getHexString()}`).toBe(NEUTRAL_SEA)
  })

  it('falls back to a neutral ice colour when liquidColor is omitted (frozen state)', () => {
    const anchor = resolveSeaAnchor(undefined, 'frozen')
    expect(`#${anchor.color.getHexString()}`).toBe(NEUTRAL_FROZEN)
  })

  it('uses wet material values for liquid surfaces', () => {
    const anchor = resolveSeaAnchor(0x2878d0, 'liquid')
    expect(anchor.roughness).toBeLessThan(0.5)
    expect(anchor.metalness).toBeGreaterThan(0.1)
  })

  it('uses slick-ice material values for frozen sheets', () => {
    const anchor = resolveSeaAnchor(0x2878d0, 'frozen')
    expect(anchor.roughness).toBeGreaterThanOrEqual(0.6)
    expect(anchor.metalness).toBeLessThan(0.1)
  })
})
