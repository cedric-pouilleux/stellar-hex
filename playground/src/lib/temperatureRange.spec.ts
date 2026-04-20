import { describe, it, expect } from 'vitest'
import {
  clamp,
  toRatio,
  commitMin,
  commitMax,
  temperatureGradientCss,
  TEMPERATURE_GRADIENT_STOPS,
} from './temperatureRange'

describe('clamp', () => {
  it('returns the value when inside the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('clamps below the lower bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('clamps above the upper bound', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('toRatio', () => {
  it('maps the absolute min to 0 and absolute max to 1', () => {
    expect(toRatio(-273, -273, 500)).toBe(0)
    expect(toRatio(500,  -273, 500)).toBe(1)
  })
  it('interpolates linearly in between', () => {
    expect(toRatio(0, -100, 100)).toBeCloseTo(0.5, 5)
  })
  it('returns 0 when the domain collapses', () => {
    expect(toRatio(42, 10, 10)).toBe(0)
  })
  it('clamps values outside the domain', () => {
    expect(toRatio(-500, -273, 500)).toBe(0)
    expect(toRatio( 900, -273, 500)).toBe(1)
  })
})

describe('commitMin', () => {
  const bounds = { absoluteMin: -273, absoluteMax: 500, minGap: 1 }

  it('accepts a valid new min and leaves max untouched', () => {
    const next = commitMin(-50, { min: -20, max: 30 }, bounds)
    expect(next).toEqual({ min: -50, max: 30 })
  })

  it('clamps the new min to the absolute lower bound', () => {
    const next = commitMin(-1000, { min: -20, max: 30 }, bounds)
    expect(next.min).toBe(-273)
    expect(next.max).toBe(30)
  })

  it('pushes max up when the new min would cross it', () => {
    const next = commitMin(40, { min: -20, max: 30 }, bounds)
    expect(next.min).toBe(40)
    expect(next.max).toBe(41)
  })

  it('respects the configured gap', () => {
    const next = commitMin(10, { min: 0, max: 12 }, { absoluteMin: 0, absoluteMax: 100, minGap: 5 })
    expect(next.min).toBe(10)
    expect(next.max).toBe(15)
  })

  it('prevents the min from landing above `absoluteMax - minGap`', () => {
    const next = commitMin(500, { min: 0, max: 100 }, bounds)
    expect(next.min).toBe(499)
    expect(next.max).toBe(500)
  })
})

describe('commitMax', () => {
  const bounds = { absoluteMin: -273, absoluteMax: 500, minGap: 1 }

  it('accepts a valid new max and leaves min untouched', () => {
    const next = commitMax(120, { min: -20, max: 30 }, bounds)
    expect(next).toEqual({ min: -20, max: 120 })
  })

  it('clamps the new max to the absolute upper bound', () => {
    const next = commitMax(9999, { min: -20, max: 30 }, bounds)
    expect(next.max).toBe(500)
    expect(next.min).toBe(-20)
  })

  it('pushes min down when the new max would cross it', () => {
    const next = commitMax(-50, { min: -20, max: 30 }, bounds)
    expect(next.max).toBe(-50)
    expect(next.min).toBe(-51)
  })

  it('prevents the max from landing below `absoluteMin + minGap`', () => {
    const next = commitMax(-500, { min: 0, max: 100 }, bounds)
    expect(next.max).toBe(-272)
    expect(next.min).toBe(-273)
  })
})

describe('temperature gradient', () => {
  it('exposes sorted, normalized stops between 0 and 1', () => {
    const stops = TEMPERATURE_GRADIENT_STOPS
    expect(stops[0].stop).toBe(0)
    expect(stops[stops.length - 1].stop).toBe(1)
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].stop).toBeGreaterThan(stops[i - 1].stop)
    }
  })

  it('builds a linear-gradient css string from the stops', () => {
    const css = temperatureGradientCss()
    expect(css.startsWith('linear-gradient(90deg,')).toBe(true)
    expect(css.includes('0%')).toBe(true)
    expect(css.includes('100%')).toBe(true)
  })
})
