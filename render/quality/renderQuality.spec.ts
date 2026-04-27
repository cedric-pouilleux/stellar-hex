import { describe, it, expect } from 'vitest'
import { MAX_SPHERE_DETAIL, resolveSphereDetail } from './renderQuality'

describe('resolveSphereDetail', () => {
  it('returns the base detail unchanged when no quality bag is given', () => {
    expect(resolveSphereDetail(4)).toBe(4)
    expect(resolveSphereDetail(5)).toBe(5)
  })

  it('returns the base detail unchanged on the standard preset', () => {
    expect(resolveSphereDetail(4, { sphereDetail: 'standard' })).toBe(4)
    expect(resolveSphereDetail(5, { sphereDetail: 'standard' })).toBe(5)
  })

  it('bumps the detail by one on the high preset', () => {
    expect(resolveSphereDetail(2, { sphereDetail: 'high' })).toBe(3)
    expect(resolveSphereDetail(4, { sphereDetail: 'high' })).toBe(5)
    expect(resolveSphereDetail(5, { sphereDetail: 'high' })).toBe(6)
  })

  it('bumps the detail by two on the ultra preset', () => {
    expect(resolveSphereDetail(2, { sphereDetail: 'ultra' })).toBe(4)
    expect(resolveSphereDetail(4, { sphereDetail: 'ultra' })).toBe(6)
    expect(resolveSphereDetail(5, { sphereDetail: 'ultra' })).toBe(MAX_SPHERE_DETAIL)
  })

  it('clamps every preset to MAX_SPHERE_DETAIL', () => {
    expect(resolveSphereDetail(MAX_SPHERE_DETAIL,     { sphereDetail: 'high'  })).toBe(MAX_SPHERE_DETAIL)
    expect(resolveSphereDetail(MAX_SPHERE_DETAIL + 1, { sphereDetail: 'high'  })).toBe(MAX_SPHERE_DETAIL)
    expect(resolveSphereDetail(MAX_SPHERE_DETAIL,     { sphereDetail: 'ultra' })).toBe(MAX_SPHERE_DETAIL)
    expect(resolveSphereDetail(MAX_SPHERE_DETAIL - 1, { sphereDetail: 'ultra' })).toBe(MAX_SPHERE_DETAIL)
  })

  it('keeps a custom-typed bag with no sphereDetail key behaving like standard', () => {
    expect(resolveSphereDetail(4, {})).toBe(4)
  })
})
