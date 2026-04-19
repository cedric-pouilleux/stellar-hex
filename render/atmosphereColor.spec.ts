import { describe, it, expect } from 'vitest'
import { atmosphereColorFromTemp } from './atmosphereColor'

describe('atmosphereColorFromTemp', () => {
  it('volcanic / runaway greenhouse (> 773 K) → red-orange', () => {
    expect(atmosphereColorFromTemp(900)).toBe('#ff4400')
    expect(atmosphereColorFromTemp(774)).toBe('#ff4400')
  })

  it('temperate Earth-like (273–773 K) → blue', () => {
    expect(atmosphereColorFromTemp(300)).toBe('#4488ff')
    expect(atmosphereColorFromTemp(263.1)).toBe('#4488ff')
  })

  it('cold icy world (173–263 K) → pale blue', () => {
    expect(atmosphereColorFromTemp(200)).toBe('#aaddff')
    expect(atmosphereColorFromTemp(173.1)).toBe('#aaddff')
  })

  it('frigid / negligible atmosphere (≤ 173 K) → grey', () => {
    expect(atmosphereColorFromTemp(100)).toBe('#888888')
    expect(atmosphereColorFromTemp(173)).toBe('#888888')
  })
})
