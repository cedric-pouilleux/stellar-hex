/**
 * Kelvin → RGB conversion utilities.
 *
 * Uses Tanner Helland's approximation, valid from ~1000 K to ~40 000 K.
 */

export interface KelvinRGB {
  r:   number
  g:   number
  b:   number
  hex: string
}

/**
 * Linear RGB colour corresponding to a colour temperature in Kelvin.
 */
export function kelvinToRGB(kelvin: number): KelvinRGB {
  const t = kelvin / 100

  let r: number
  let g: number
  let b: number

  // Red
  if (t <= 66) {
    r = 255
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    r = Math.max(0, Math.min(255, r))
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    g = Math.max(0, Math.min(255, g))
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    g = Math.max(0, Math.min(255, g))
  }

  // Blue
  if (t >= 66) {
    b = 255
  } else if (t <= 19) {
    b = 0
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
    b = Math.max(0, Math.min(255, b))
  }

  return {
    r: r / 255,
    g: g / 255,
    b: b / 255,
    hex: `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`,
  }
}

/** Normalised `{ r, g, b }` in `[0, 1]` for Three.js. */
export function kelvinToThreeColor(kelvin: number): { r: number; g: number; b: number } {
  const { r, g, b } = kelvinToRGB(kelvin)
  return { r, g, b }
}

/** Qualitative description of a spectral type for a given temperature. */
export function kelvinLabel(k: number): string {
  if (k < 3700)  return `Naine rouge (~${k}K)`
  if (k < 5200)  return `Étoile orange K (~${k}K)`
  if (k < 6000)  return `Étoile G comme notre Soleil (~${k}K)`
  if (k < 7500)  return `Étoile F blanche-jaune (~${k}K)`
  if (k < 10000) return `Étoile A blanche (~${k}K)`
  if (k < 30000) return `Étoile B bleu-blanc (~${k}K)`
  return `Étoile O bleue (~${k}K)`
}
