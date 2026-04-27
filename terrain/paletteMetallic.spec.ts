import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildMetallicPalette } from './paletteMetallic'
import type { MetallicBand } from '../types/body.types'
import { METALLIC_PLAIN_THRESH, METALLIC_PEAK_THRESH } from '../physics/body'

const customBands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
  { color: '#101010', metalness: 0.40, roughness: 0.80, height: 0.00 },
  { color: '#505050', metalness: 0.70, roughness: 0.50, height: 0.02 },
  { color: '#a0a0a0', metalness: 0.85, roughness: 0.30, height: 0.07 },
  { color: '#f0f0f0', metalness: 0.95, roughness: 0.10, height: 0.15 },
]

describe('buildMetallicPalette', () => {
  describe('structure', () => {
    it('always returns exactly 4 levels', () => {
      expect(buildMetallicPalette()).toHaveLength(4)
      expect(buildMetallicPalette(customBands)).toHaveLength(4)
    })

    it('last level has threshold Infinity', () => {
      const levels = buildMetallicPalette()
      expect(levels[levels.length - 1].threshold).toBe(Infinity)
    })

    it('uses the shared terrain constants for band thresholds', () => {
      const levels = buildMetallicPalette()
      expect(levels[0].threshold).toBe(METALLIC_PLAIN_THRESH)
      expect(levels[2].threshold).toBe(METALLIC_PEAK_THRESH)
    })

    it('thresholds are strictly ascending', () => {
      const levels = buildMetallicPalette()
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i].threshold).toBeLessThan(levels[i + 1].threshold)
      }
    })
  })

  describe('neutral fallback (no caller bands)', () => {
    it('produces a valid PBR ladder in [0, 1]', () => {
      const levels = buildMetallicPalette()
      for (const l of levels) {
        expect(l.metalness).toBeGreaterThanOrEqual(0)
        expect(l.metalness).toBeLessThanOrEqual(1)
        expect(l.roughness).toBeGreaterThanOrEqual(0)
        expect(l.roughness).toBeLessThanOrEqual(1)
      }
    })

    it('peaks have higher metalness than crater floors', () => {
      const levels = buildMetallicPalette()
      expect(levels[3]!.metalness).toBeGreaterThan(levels[0]!.metalness!)
    })

    it('craters are rougher than peaks', () => {
      const levels = buildMetallicPalette()
      expect(levels[0]!.roughness).toBeGreaterThan(levels[3]!.roughness!)
    })

    it('crater floors have height 0', () => {
      const levels = buildMetallicPalette()
      expect(levels[0].height).toBe(0)
    })

    it('height increases from craters to peaks', () => {
      const levels = buildMetallicPalette()
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i + 1].height).toBeGreaterThanOrEqual(levels[i].height)
      }
    })

    it('no band has an emissive override by default', () => {
      const levels = buildMetallicPalette()
      for (const l of levels) expect(l.emissive).toBeUndefined()
    })
  })

  describe('caller-supplied bands', () => {
    it('propagates the input colour as a THREE.Color on every slot', () => {
      const levels = buildMetallicPalette(customBands)
      const hexes  = levels.map(l => '#' + l.color.getHexString())
      const inputs = customBands.map(b => b.color)
      expect(hexes).toEqual(inputs)
    })

    it('propagates metalness / roughness / height verbatim', () => {
      const levels = buildMetallicPalette(customBands)
      levels.forEach((l, i) => {
        expect(l.metalness).toBe(customBands[i]!.metalness)
        expect(l.roughness).toBe(customBands[i]!.roughness)
        expect(l.height).toBe(customBands[i]!.height)
      })
    })

    it('accepts numeric ColorInput (0xRRGGBB)', () => {
      const bands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
        { color: 0x112233 }, { color: 0x445566 }, { color: 0x778899 }, { color: 0xaabbcc },
      ]
      const levels = buildMetallicPalette(bands)
      expect(levels[0].color.getHexString()).toBe('112233')
      expect(levels[3].color.getHexString()).toBe('aabbcc')
    })

    it('fills missing material / height fields from the neutral ladder', () => {
      const bands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
        { color: '#000000' }, { color: '#111111' }, { color: '#222222' }, { color: '#333333' },
      ]
      const levels = buildMetallicPalette(bands)
      for (const l of levels) {
        expect(typeof l.metalness).toBe('number')
        expect(typeof l.roughness).toBe('number')
        expect(typeof l.height).toBe('number')
        expect(l.metalness).toBeGreaterThanOrEqual(0)
        expect(l.metalness).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('emissive override', () => {
    it('propagates caller-supplied emissive as THREE.Color + intensity', () => {
      const bands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
        { color: '#000000' },
        { color: '#111111' },
        { color: '#222222' },
        { color: '#333333', emissive: '#ff5500', emissiveIntensity: 0.75 },
      ]
      const levels = buildMetallicPalette(bands)
      expect(levels[3]!.emissive).toBeInstanceOf(THREE.Color)
      expect('#' + levels[3]!.emissive!.getHexString()).toBe('#ff5500')
      expect(levels[3]!.emissiveIntensity).toBe(0.75)
    })

    it('defaults emissiveIntensity to 1 when omitted', () => {
      const bands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
        { color: '#000000' },
        { color: '#111111' },
        { color: '#222222' },
        { color: '#333333', emissive: '#ff0000' },
      ]
      const levels = buildMetallicPalette(bands)
      expect(levels[3]!.emissiveIntensity).toBe(1.0)
    })

    it('leaves emissive undefined on bands without an override', () => {
      const bands: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] = [
        { color: '#000000' }, { color: '#111111' }, { color: '#222222' }, { color: '#333333' },
      ]
      const levels = buildMetallicPalette(bands)
      for (const l of levels) expect(l.emissive).toBeUndefined()
    })
  })
})
