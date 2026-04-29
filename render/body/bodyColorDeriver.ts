import type { PlanetConfig, ColorInput } from '../../types/body.types'
import { clamp } from '../../internal/math'

/** Neutral fallback used when the caller supplies no rocky anchor colours. */
const DEFAULT_ROCKY_COLOR_A = '#1a1a20'
const DEFAULT_ROCKY_COLOR_B = '#606070'

/**
 * Accepts the `ColorInput` format used across `BodyConfig` (`#rrggbb` string
 * or `0xRRGGBB` number) and returns a normalised `#rrggbb` string usable by
 * shader-param helpers.
 */
function normaliseColorInput(input: ColorInput | undefined): string | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input === 'number') {
    const r = (input >> 16) & 0xff
    const g = (input >>  8) & 0xff
    const b =  input        & 0xff
    return rgbToHex(r, g, b)
  }
  return input.startsWith('#') ? input : '#' + input
}

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
 * Resolves the rocky planet's shader colour anchors from the caller-supplied
 * `terrainColorLow` / `terrainColorHigh` config fields.
 *
 * The lib no longer carries any resource vocabulary, so anchor selection is
 * the caller's concern: callers compute defaults (e.g. from the body's mean
 * equilibrium temperature) and write them back onto the config before
 * calling `useBody`. The playground ships a reference implementation via
 * `deriveTemperatureAnchors`.
 *
 * When the caller omits the anchors, the palette falls back to neutral
 * charcoal / pewter defaults. Lava colour is not part of this resolver
 * anymore — it lives on `BodyVariation.lavaColor` (caller-pushable).
 */
export function rockyColors(
  config: PlanetConfig,
): { colorA: string; colorB: string } {
  const colorA = normaliseColorInput(config.terrainColorLow)  ?? DEFAULT_ROCKY_COLOR_A
  const colorB = normaliseColorInput(config.terrainColorHigh) ?? DEFAULT_ROCKY_COLOR_B
  return { colorA, colorB }
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

/**
 * Neutral default band palette used when the caller omits `bandColors`.
 * Warm tan → readable as "generic gas giant" without baking chemistry into
 * the lib. Matches the default applied inside {@link buildGasPalette}.
 */
const DEFAULT_GAS_BANDS = {
  colorA: '#e8b870',
  colorB: '#c08040',
  colorC: '#f0d0a0',
  colorD: '#d4956a',
} as const

function normaliseHex(input: ColorInput): string {
  const s = normaliseColorInput(input)
  return s ?? '#000000'
}

/**
 * Returns the four band-colour hex stops (A/B/C/D) consumed by the gas
 * shader's uniforms. The lib no longer blends molecule archetypes — callers
 * pass the already-blended stops through `config.bandColors`. A neutral
 * warm-tan default is substituted when the field is omitted.
 */
export function gasColorPalette(config: PlanetConfig): Record<string, string> {
  const b = config.bandColors
  if (!b) return { ...DEFAULT_GAS_BANDS }
  return {
    colorA: normaliseHex(b.colorA),
    colorB: normaliseHex(b.colorB),
    colorC: normaliseHex(b.colorC),
    colorD: normaliseHex(b.colorD),
  }
}

// ── Metallic planet colors ────────────────────────────────────────

/** Neutral metallic shader fallback — matches the neutral palette's deep+peak stops. */
const DEFAULT_METALLIC_SHADER_A = '#1e2228'
const DEFAULT_METALLIC_SHADER_B = '#c4ccd4'

/**
 * Returns the two shader anchor colours (`base`, `accent`) for a metallic
 * body's procedural fragment shader (smooth-sphere view). Reads them from
 * the caller-supplied `metallicBands` (first and last band — deep + peak);
 * falls back to a neutral grey pair when the caller omits the bands.
 *
 * The lib no longer ships a temperature → composition colour map — the
 * caller owns that catalogue and writes the result back onto
 * `BodyConfig.metallicBands` (see the playground's metallic composition
 * helper for a reference implementation).
 */
export function metallicShaderColors(config: PlanetConfig): { baseA: string; baseB: string } {
  const bands = config.metallicBands
  if (!bands) return { baseA: DEFAULT_METALLIC_SHADER_A, baseB: DEFAULT_METALLIC_SHADER_B }
  return {
    baseA: normaliseColorInput(bands[0].color) ?? DEFAULT_METALLIC_SHADER_A,
    baseB: normaliseColorInput(bands[3].color) ?? DEFAULT_METALLIC_SHADER_B,
  }
}
