import * as THREE from 'three'
import type { TerrainLevel } from '../types/body.types'
import { METALLIC_PLAIN_THRESH, METALLIC_PEAK_THRESH } from '../config/defaults'
import { tempLerp, numLerp } from './colorUtils'
import { M_DEEP, M_PLAIN, M_HIGH, M_PEAK, M_PEAK_HEIGHT } from './colorAnchors'

/**
 * Terrain palette for metallic planets.
 *
 * No surface water — four fixed elevation bands (crater floors, plains,
 * highlands, peaks). Material properties emphasise high metalness / low
 * roughness for a reflective metallic appearance.
 *
 * Color and material shift with temperature:
 *   cold  → iron oxide (rust reds, rough)
 *   mid   → chrome / steel grey (smooth, high metalness)
 *   hot   → copper / gold patina
 *   very hot → molten glow (emissive peaks)
 *
 * @param temperatureMin  Minimum surface temperature (°C)
 * @param temperatureMax  Maximum surface temperature (°C)
 */
export function generateMetallicPalette(
  temperatureMin: number,
  temperatureMax: number,
): TerrainLevel[] {
  const avg = (temperatureMin + temperatureMax) / 2

  const deepColor  = tempLerp(M_DEEP,  avg)
  const plainColor = tempLerp(M_PLAIN, avg)
  const highColor  = tempLerp(M_HIGH,  avg)
  const peakColor  = tempLerp(M_PEAK,  avg)

  // 0 = polished (avg ≥ 15°C), 1 = fully oxidised (avg ≤ -40°C)
  const rustFactor = Math.max(0, Math.min(1, (-avg + 15) / 55))
  // 0 at 80°C, 1 at 230°C
  const hotFactor  = Math.max(0, Math.min(1, (avg - 80) / 150))

  const deepMetal  = 0.55 + (1 - rustFactor) * 0.15
  const plainMetal = 0.75 + (1 - rustFactor) * 0.12
  const highMetal  = 0.88 + (1 - rustFactor) * 0.09
  const peakMetal  = Math.min(1.00, 0.93 + (1 - rustFactor) * 0.07)

  const deepRough  = 0.60 - hotFactor * 0.15
  const plainRough = 0.38 + rustFactor * 0.20 - hotFactor * 0.10
  const highRough  = 0.22 + rustFactor * 0.18 - hotFactor * 0.08
  const peakRough  = Math.max(0.08, 0.14 + rustFactor * 0.12 - hotFactor * 0.06)

  const isVolcanic    = avg > 200
  const peakEmissiveI = isVolcanic ? Math.min(1.0, (avg - 200) / 250) : 0
  const peakH         = numLerp(M_PEAK_HEIGHT, avg)

  return [
    {
      threshold: METALLIC_PLAIN_THRESH,
      height:    0,
      color:     deepColor,
      metalness: deepMetal,
      roughness: deepRough,
    },
    {
      threshold: 0.55,
      height:    0.018,
      color:     plainColor,
      metalness: plainMetal,
      roughness: Math.max(0.18, plainRough),
    },
    {
      threshold: METALLIC_PEAK_THRESH,
      height:    0.060,
      color:     highColor,
      metalness: highMetal,
      roughness: highRough,
    },
    {
      threshold:         Infinity,
      height:            peakH,
      color:             peakColor,
      metalness:         peakMetal,
      roughness:         peakRough,
      ...(isVolcanic && {
        emissive:          new THREE.Color(0xff5500),
        emissiveIntensity: peakEmissiveI,
      }),
    },
  ]
}
