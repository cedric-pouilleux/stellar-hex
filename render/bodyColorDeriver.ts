import type { BodyConfig } from '../types/body.types'
import { getBodyResourceBridge } from '../sim/resourceDistributionRegistry'
import { clamp } from '../core/math'

// ── Hex / RGB helpers ─────────────────────────────────────────────

/**
 * Parse a `#rrggbb` (or `rrggbb`) color string into its `[r, g, b]` byte
 * components in the [0, 255] range.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/**
 * Format RGB byte components as a `#rrggbb` hex string. Each component is
 * clamped to [0, 255] and rounded to the nearest integer before encoding.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

// ── HSL helpers ───────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if      (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else                h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return [Math.round(hue(h + 1/3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1/3) * 255)]
}

// ── Color shift ───────────────────────────────────────────────────

/**
 * Apply warm/cool color shift + luminance to a palette hex color.
 * colorMix: 0=cooler, 0.5=neutral, 1=warmer.
 */
export function shiftColor(hex: string, colorMix: number, luminance: number): string {
  const [r, g, b] = hexToRgb(hex)
  const warmShift  = (colorMix - 0.5) * 0.30
  return rgbToHex(
    r * luminance * (1 + warmShift * 0.8),
    g * luminance * (1 + warmShift * 0.1),
    b * luminance * (1 - warmShift * 0.7),
  )
}

// ── Rocky planet colors ───────────────────────────────────────────

/**
 * Derive rocky planet base colors from compatible surface resources.
 * Resources are sorted by luminance and split into dark/light halves,
 * then averaged to produce colorA (shadow) and colorB (highlight).
 */
export function rockyColors(config: BodyConfig): { colorA: string; colorB: string; lavaColor: string } {
  const T_avg = (config.temperatureMin + config.temperatureMax) / 2
  const atmo  = config.atmosphereThickness ?? 0

  const lavaColor = T_avg > 200 ? '#ff5500' : T_avg > 100 ? '#ff3300' : '#cc2200'

  // Resource-aware palette derivation is delegated to the registered bridge.
  // Without a bridge, rocky planets render with the neutral fallback palette below.
  // `solidSurfaceOnly` lets the bridge exclude liquids/organics so only mineral-like
  // resources influence the surface palette — the filter logic stays consumer-side.
  const bridge = getBodyResourceBridge()
  const compatible = bridge?.getCompatibleResourceColors({
    bodyType:         'rocky',
    tempMin:          config.temperatureMin,
    tempMax:          config.temperatureMax,
    atmo,
    solidSurfaceOnly: true,
  }) ?? []

  const allowed = config.allowedResources
  const surface = allowed?.length
    ? compatible.filter(r => allowed.includes(r.id))
    : compatible

  if (surface.length === 0) {
    return { colorA: '#1a1a20', colorB: '#606070', lavaColor }
  }

  // color is stored as a 0xRRGGBB hex integer — unpack to [0..1] components.
  const sorted = surface
    .map(r => {
      const rr = ((r.color >> 16) & 0xff) / 255
      const gg = ((r.color >>  8) & 0xff) / 255
      const bb = ( r.color        & 0xff) / 255
      return { def: r, lum: 0.299 * rr + 0.587 * gg + 0.114 * bb }
    })
    .sort((a, b) => a.lum - b.lum)

  const half       = Math.max(1, Math.floor(sorted.length / 2))
  const darkGroup  = sorted.slice(0, half)
  const lightGroup = sorted.length > 1 ? sorted.slice(half) : sorted

  function avgHex(group: typeof sorted): string {
    const r = group.reduce((s, d) => s + ((d.def.color >> 16) & 0xff), 0) / group.length
    const g = group.reduce((s, d) => s + ((d.def.color >>  8) & 0xff), 0) / group.length
    const b = group.reduce((s, d) => s + ( d.def.color        & 0xff), 0) / group.length
    return rgbToHex(r, g, b)
  }

  return { colorA: avgHex(darkGroup), colorB: avgHex(lightGroup), lavaColor }
}

/**
 * Crack color = same hue/saturation as the planet surface, but with a
 * target lightness far from the surface average so cracks are always visible.
 */
export function rockyCrackColor(colorA: string, colorB: string): string {
  const [rA, gA, bA] = hexToRgb(colorA)
  const [rB, gB, bB] = hexToRgb(colorB)
  const [h, s, l] = rgbToHsl((rA + rB) / 2, (gA + gB) / 2, (bA + bB) / 2)
  const targetL = l > 0.30 ? 0.08 : 0.72
  const [r, g, b] = hslToRgb(h, s, targetL)
  return rgbToHex(r, g, b)
}

// ── Gas planet colors ─────────────────────────────────────────────

type ABCD = [[number,number,number],[number,number,number],[number,number,number],[number,number,number]]

// Archetype RGB per molecule — [light band, dark band, accent, secondary]
const GAS_SHADER_ARCH: Record<string, ABCD> = {
  //          A (light)           B (dark)            C (accent)          D (secondary)
  H2He:  [[232,192,144],     [160, 80, 48],     [212,132, 74],     [200,120, 74]],  // warm tan/orange (Jupiter)
  CH4:   [[ 96,200,224],     [ 32,112,176],     [ 20, 72,112],     [ 10, 24, 40]],  // icy blue-cyan (Neptune)
  NH3:   [[240,232,192],     [216,200,128],     [192,152, 64],     [128,104, 56]],  // pale sulphur-cream (Saturn)
  H2O:   [[144,192,224],     [ 80,128,176],     [ 40, 88,144],     [ 16, 48, 96]],  // slate-blue (water worlds)
  sulfur:[[ 48, 40, 56],     [ 24, 20, 32],     [ 16, 12, 24],     [  8,  6, 12]],  // dark carbon/exotic
  hot:   [[255,128, 48],     [224, 64, 16],     [160, 24,  0],     [ 48,  4,  0]],  // scorching red-orange
}

/**
 * Derive gas giant colors continuously from atmospheric composition fractions.
 * Returns 4 band color stops: A (bright/light), B (dark/deep), C (mid-accent), D (secondary).
 */
export function gasColorPalette(config: BodyConfig): Record<string, string> {
  const T_eq = (config.temperatureMin + config.temperatureMax) / 2 + 273

  if (T_eq > 700) {
    const a = GAS_SHADER_ARCH.hot
    return {
      colorA: rgbToHex(a[0][0], a[0][1], a[0][2]),
      colorB: rgbToHex(a[1][0], a[1][1], a[1][2]),
      colorC: rgbToHex(a[2][0], a[2][1], a[2][2]),
      colorD: rgbToHex(a[3][0], a[3][1], a[3][2]),
    }
  }

  const comp = config.gasComposition ?? { H2He: 1, CH4: 0, NH3: 0, H2O: 0, sulfur: 0 }

  if (comp.H2He < 0.25) {
    const a = GAS_SHADER_ARCH.sulfur
    return {
      colorA: rgbToHex(a[0][0], a[0][1], a[0][2]),
      colorB: rgbToHex(a[1][0], a[1][1], a[1][2]),
      colorC: rgbToHex(a[2][0], a[2][1], a[2][2]),
      colorD: rgbToHex(a[3][0], a[3][1], a[3][2]),
    }
  }

  const weights: [string, number][] = [
    ['H2He',  comp.H2He  ?? 0],
    ['CH4',   comp.CH4   ?? 0],
    ['NH3',   comp.NH3   ?? 0],
    ['H2O',   comp.H2O   ?? 0],
    ['sulfur',comp.sulfur ?? 0],
  ]
  const totalW = weights.reduce((s, [, w]) => s + w, 0) || 1

  const blended: ABCD = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]]
  for (const [mol, w] of weights) {
    const arch = GAS_SHADER_ARCH[mol]
    const t    = w / totalW
    for (let slot = 0; slot < 4; slot++) {
      blended[slot][0] += arch[slot][0] * t
      blended[slot][1] += arch[slot][1] * t
      blended[slot][2] += arch[slot][2] * t
    }
  }

  return {
    colorA: rgbToHex(blended[0][0], blended[0][1], blended[0][2]),
    colorB: rgbToHex(blended[1][0], blended[1][1], blended[1][2]),
    colorC: rgbToHex(blended[2][0], blended[2][1], blended[2][2]),
    colorD: rgbToHex(blended[3][0], blended[3][1], blended[3][2]),
  }
}

// ── Metallic planet colors ────────────────────────────────────────

/**
 * Metallic planet colors derived from surface temperature (proxy for composition).
 * Hot = iron-nickel / volcanic. Cold = titanium-chromium / platinum-group.
 */
export function metallicColors(T_avg: number): { baseA: string; baseB: string } {
  if (T_avg > 400) return { baseA: '#2e0800', baseB: '#a03010' }
  if (T_avg > 200) return { baseA: '#220c02', baseB: '#783018' }
  if (T_avg > 50)  return { baseA: '#1e1208', baseB: '#5a3820' }
  if (T_avg > -20) return { baseA: '#1a1a20', baseB: '#606880' }
  if (T_avg > -80) return { baseA: '#141828', baseB: '#485870' }
  return               { baseA: '#0c1020', baseB: '#304060' }
}
