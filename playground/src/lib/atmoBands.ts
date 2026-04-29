/**
 * Derives the 4-stop band palette consumed by the lib's gas shader from a
 * volatile gas mix. The playground feeds this from the user's reactive
 * resource state (toggles + per-resource weights) so the atmo palette
 * stays decoupled from temperature.
 *
 * Blend rule: each gas-phase volatile contributes its `gasColor` weighted by
 * its share of the mix. The result is a single "mid" hue. Four band stops
 * are then produced via luminance shifts around that hue:
 *
 *   - `colorA` (brightest) — top-of-cloud haze
 *   - `colorB` (darkest)   — deepest band / storm interior
 *   - `colorC` (mid)       — base tone
 *   - `colorD` (secondary) — intermediate shading for belt edges
 *
 * A luminance-only schedule keeps the atmosphere chromatically coherent: no
 * matter which volatile dominates, the four stops stay on the same hue line,
 * which is what real atmospheres do (Jupiter's belts are tonal variations of
 * the same tan base, not arbitrary colours).
 */

import { VOLATILES, type VolatileId } from './volatileCatalog'

export interface BandColors {
  colorA: string  // `#rrggbb`
  colorB: string
  colorC: string
  colorD: string
}

/**
 * Neutral fallback used when the mix is empty (e.g. ultra-cold body with no
 * gas-phase volatile). Matches the lib's neutral warm-tan gas-palette
 * fallback so the shader stays readable when physics produces no
 * atmosphere.
 */
export const NEUTRAL_BAND_COLORS: BandColors = {
  colorA: '#e8b870',
  colorB: '#c08040',
  colorC: '#f0d0a0',
  colorD: '#d4956a',
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/**
 * Builds the `(total, entries)` pair restricted to catalogued volatiles —
 * entries referencing unknown ids are ignored BOTH in the weighted sum and
 * in the total, so an `{ h2he: 1, unobtainium: 0.5 }` mix blends identically
 * to `{ h2he: 1 }`. Keeps the blend stable against caller typos.
 */
function knownEntries(
  gasMix: Partial<Record<VolatileId, number>>,
): { total: number; entries: Array<[VolatileId, number]> } {
  let total = 0
  const entries: Array<[VolatileId, number]> = []
  for (const [id, w] of Object.entries(gasMix)) {
    const weight = w ?? 0
    if (weight <= 0) continue
    if (!VOLATILES[id as VolatileId]) continue
    entries.push([id as VolatileId, weight])
    total += weight
  }
  return { total, entries }
}

/**
 * Blends the `gasColor` of every volatile present in `gasMix`, weighted by
 * its share of the KNOWN total. Returns the mid-hue RGB triple as bytes.
 */
function blendGasHue(
  entries: Array<[VolatileId, number]>,
  total:   number,
): [number, number, number] {
  if (total <= 0) return [0, 0, 0]
  let r = 0, g = 0, b = 0
  for (const [id, weight] of entries) {
    const share = weight / total
    const c     = VOLATILES[id].gasColor
    r += ((c >> 16) & 0xff) * share
    g += ((c >>  8) & 0xff) * share
    b += ( c        & 0xff) * share
  }
  return [r, g, b]
}

/**
 * Produces a lib-compatible `BandColors` from a normalised volatile gas mix.
 * When the mix is empty (no gas-phase volatile at the body's temperature),
 * returns {@link NEUTRAL_BAND_COLORS} so the atmosphere stays visible.
 */
export function deriveBandColorsFromMix(
  gasMix: Partial<Record<VolatileId, number>>,
): BandColors {
  const { total, entries } = knownEntries(gasMix)
  if (total <= 0) return { ...NEUTRAL_BAND_COLORS }

  const [r, g, b] = blendGasHue(entries, total)

  // Luminance schedule matches the legacy archetype spacing closely enough
  // that the visual regression between the old composition-driven path and
  // the new volatile-driven path stays subtle. Tuned so the Jupiter (H₂He)
  // mix lands on warm tan, the Neptune (CH₄) mix on icy blue, etc.
  return {
    colorA: rgbHex(r * 1.20, g * 1.20, b * 1.20),  // brightest
    colorB: rgbHex(r * 0.55, g * 0.55, b * 0.55),  // darkest
    colorC: rgbHex(r * 1.00, g * 1.00, b * 1.00),  // mid
    colorD: rgbHex(r * 0.80, g * 0.80, b * 0.80),  // secondary
  }
}
