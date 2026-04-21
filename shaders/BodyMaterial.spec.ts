import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BodyMaterial, BODY_SHADER_PALETTE_MAX } from './BodyMaterial'
import type { TerrainLevel } from '../types/body.types'

function makePalette(n: number): TerrainLevel[] {
  const palette: TerrainLevel[] = []
  for (let i = 0; i < n; i++) {
    palette.push({
      threshold: i === n - 1 ? Infinity : -1 + ((i + 1) / n) * 2,
      height:    i * 0.01,
      color:     new THREE.Color(i / Math.max(1, n - 1), 0.5, 1 - i / Math.max(1, n - 1)),
    })
  }
  return palette
}

describe('BodyMaterial palette uniforms', () => {
  it('allocates fixed-size palette arrays with uPaletteCount = 0 by default', () => {
    const mat = new BodyMaterial('rocky')
    const u   = mat.material.uniforms
    expect(u.uPaletteCount.value).toBe(0)
    expect((u.uPaletteColors.value as THREE.Vector3[]).length).toBe(BODY_SHADER_PALETTE_MAX)
    expect((u.uPaletteThresholds.value as Float32Array).length).toBe(BODY_SHADER_PALETTE_MAX)
    mat.dispose()
  })

  it('populates colors and thresholds when a palette is passed at construction', () => {
    const palette = makePalette(4)
    const mat     = new BodyMaterial('rocky', {}, { palette })
    const u       = mat.material.uniforms
    expect(u.uPaletteCount.value).toBe(4)
    const colors = u.uPaletteColors.value as THREE.Vector3[]
    expect(colors[0].x).toBeCloseTo(palette[0].color.r)
    expect(colors[3].z).toBeCloseTo(palette[3].color.b)
    mat.dispose()
  })

  it('replaces Infinity thresholds with a finite sentinel greater than +1', () => {
    const palette = makePalette(3)
    const mat     = new BodyMaterial('rocky', {}, { palette })
    const u       = mat.material.uniforms
    const ts      = u.uPaletteThresholds.value as Float32Array
    // Entry 2 (last) has threshold = Infinity and must be finite + > 1
    expect(Number.isFinite(ts[2])).toBe(true)
    expect(ts[2]).toBeGreaterThan(1)
    mat.dispose()
  })

  it('setPalette swaps palettes at runtime without reallocating the array', () => {
    const mat        = new BodyMaterial('rocky', {}, { palette: makePalette(3) })
    const firstArray = mat.material.uniforms.uPaletteColors.value
    mat.setPalette(makePalette(5))
    const u = mat.material.uniforms
    expect(u.uPaletteCount.value).toBe(5)
    // Same array instance — the GPU-side uniform block does not need a rebuild.
    expect(u.uPaletteColors.value).toBe(firstArray)
    mat.dispose()
  })

  it('setPalette(null) clears the palette (uPaletteCount back to 0)', () => {
    const mat = new BodyMaterial('rocky', {}, { palette: makePalette(3) })
    mat.setPalette(null)
    expect(mat.material.uniforms.uPaletteCount.value).toBe(0)
    mat.dispose()
  })

  it('truncates palettes larger than BODY_SHADER_PALETTE_MAX', () => {
    const oversized = makePalette(BODY_SHADER_PALETTE_MAX + 8)
    const mat       = new BodyMaterial('rocky', {}, { palette: oversized })
    expect(mat.material.uniforms.uPaletteCount.value).toBe(BODY_SHADER_PALETTE_MAX)
    mat.dispose()
  })
})
