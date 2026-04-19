import * as THREE from 'three'
import type { TerrainLevel } from '../types/body.types'
import type { SurfaceLiquidType } from '../types/surface.types'
import { averageBodyTemperature, canHaveLiquidSurfaceWater, getSurfaceLiquidType, hasLiquidSurface } from '../physics/bodyWater'
import { DEFAULT_TERRAIN_LEVEL_COUNT, TERRAIN_LEVEL_STEP_PER_RADIUS } from '../config/defaults'
import { lerp, tempLerp } from './colorUtils'
import {
  L0_WET, L0_DRY, L0_ICE, L0_AMMONIA, L0_METHANE, L0_NITROGEN,
  L_SHORE_WET, L_SHORE_DRY, L_SHORE_AMMONIA, L_SHORE_METHANE, L_SHORE_NITROGEN,
  L1_WET, L1_DRY, L2_WET, L2_DRY, L3,
} from './colorAnchors'

/** How dark the deepest ocean band becomes relative to the surface sea colour. */
const OCEAN_DEEPEST_DARKEN = 0.90

type ClimateKey = 'volcanic' | 'deepFreeze' | 'frozen' | 'cold' | 'temperate'

type PaletteAnchors = {
  climate:    ClimateKey
  avg:        number
  seaColor:   THREE.Color
  shoreColor: THREE.Color
  lowColor:   THREE.Color
  midColor:   THREE.Color
  peakColor:  THREE.Color
  seaMetal:   number
  seaRough:   number
  shoreMetal: number
  shoreRough: number
  lowMetal:   number
  lowRough:   number
  midMetal:   number
  midRough:   number
  peakMetal:  number
  peakRough:  number
  peakEmissive?: { color: THREE.Color; intensity: number }
}

/**
 * Resolve the palette anchor colours and material values for a rocky planet
 * from its physical inputs. These anchors are the source of truth from which
 * the final N-level palette interpolates.
 */
function resolveAnchors(
  temperatureMin:      number,
  temperatureMax:      number,
  atmosphereThickness: number,
): PaletteAnchors {
  const avg       = averageBodyTemperature({ type: 'rocky', temperatureMin, temperatureMax })
  const atmo      = Math.max(0, Math.min(1, atmosphereThickness))
  const isFrozen  = temperatureMax <= 0
  const hasSurfaceWater = canHaveLiquidSurfaceWater({ type: 'rocky', temperatureMin, temperatureMax })

  const tempFactor = Math.max(0, 1 - Math.abs(avg - 15) / 55)
  const vegetation = atmo * tempFactor
  const wetFactor  = hasSurfaceWater ? Math.min(1, atmo * 1.6) : 0

  const blend = (wet: [number, THREE.Color][], dry: [number, THREE.Color][]): THREE.Color =>
    lerp(tempLerp(dry, avg), tempLerp(wet, avg), wetFactor)

  const liquidType: SurfaceLiquidType | undefined = getSurfaceLiquidType(
    { type: 'rocky', temperatureMin, temperatureMax },
  )

  let seaColor: THREE.Color
  let shoreColor: THREE.Color
  if (liquidType === 'ammonia') {
    seaColor   = tempLerp(L0_AMMONIA, avg)
    shoreColor = tempLerp(L_SHORE_AMMONIA, avg)
  } else if (liquidType === 'methane') {
    seaColor   = tempLerp(L0_METHANE, avg)
    shoreColor = tempLerp(L_SHORE_METHANE, avg)
  } else if (liquidType === 'nitrogen') {
    seaColor   = tempLerp(L0_NITROGEN, avg)
    shoreColor = tempLerp(L_SHORE_NITROGEN, avg)
  } else if (isFrozen) {
    seaColor   = tempLerp(L0_ICE, avg)
    shoreColor = tempLerp(L_SHORE_DRY, avg)
  } else {
    seaColor   = blend(L0_WET, L0_DRY)
    shoreColor = blend(L_SHORE_WET, L_SHORE_DRY)
  }

  const lowColor  = blend(L1_WET, L1_DRY)
  const midBase   = blend(L2_WET, L2_DRY)
  const midColor  = lerp(midBase, tempLerp(L2_WET, avg), vegetation * 0.5)
  const peakColor = tempLerp(L3, avg)

  const isVolcanic   = avg > 200
  const isCold       = avg < -20
  const isDeepFreeze = avg < -80

  const climate: ClimateKey =
    isVolcanic   ? 'volcanic'   :
    isDeepFreeze ? 'deepFreeze' :
    isFrozen     ? 'frozen'     :
    isCold       ? 'cold'       : 'temperate'

  const SEA_METAL:   Record<ClimateKey, number> = { volcanic: 0.70, deepFreeze: 0.05, frozen: 0.02, cold: 0.40, temperate: 0.62 }
  const SEA_ROUGH:   Record<ClimateKey, number> = { volcanic: 0.20, deepFreeze: 0.55, frozen: 0.65, cold: 0.30, temperate: 0.04 }
  const SHORE_METAL: Record<ClimateKey, number> = { volcanic: 0.00, deepFreeze: 0.02, frozen: 0.02, cold: 0.00, temperate: 0.00 }
  const SHORE_ROUGH: Record<ClimateKey, number> = { volcanic: 0.70, deepFreeze: 0.60, frozen: 0.65, cold: 0.55, temperate: 0.55 }
  const ROUGH_LOW:   Record<ClimateKey, number> = { volcanic: 0.60, deepFreeze: 0.70, frozen: 0.72, cold: 0.40, temperate: 0.85 }
  const ROUGH_MID:   Record<ClimateKey, number> = { volcanic: 0.65, deepFreeze: 0.65, frozen: 0.68, cold: 0.38, temperate: 0.90 }
  const ROUGH_PEAK:  Record<ClimateKey, number> = { volcanic: 0.50, deepFreeze: 0.60, frozen: 0.62, cold: 0.25, temperate: 0.90 }
  const METAL_PEAK:  Record<ClimateKey, number> = { volcanic: 0.10, deepFreeze: 0.03, frozen: 0.04, cold: 0.15, temperate: 0.15 }
  const METAL_LOW:   Record<ClimateKey, number> = { volcanic: 0.00, deepFreeze: 0.00, frozen: 0.00, cold: 0.00, temperate: 0.00 }
  const METAL_MID:   Record<ClimateKey, number> = { volcanic: 0.05, deepFreeze: 0.02, frozen: 0.02, cold: 0.05, temperate: 0.05 }

  const peakEmissiveI = isVolcanic ? Math.min(0.8, (avg - 200) / 400) : 0

  return {
    climate, avg,
    seaColor, shoreColor, lowColor, midColor, peakColor,
    seaMetal:   SEA_METAL[climate],
    seaRough:   SEA_ROUGH[climate],
    shoreMetal: SHORE_METAL[climate],
    shoreRough: SHORE_ROUGH[climate],
    lowMetal:   METAL_LOW[climate],
    lowRough:   ROUGH_LOW[climate],
    midMetal:   METAL_MID[climate],
    midRough:   ROUGH_MID[climate],
    peakMetal:  METAL_PEAK[climate],
    peakRough:  ROUGH_PEAK[climate],
    ...(isVolcanic && peakEmissiveI > 0
      ? { peakEmissive: { color: new THREE.Color(0xff3300), intensity: peakEmissiveI } }
      : {}),
  }
}

/** Linearly interpolate between three consecutive land anchors at fraction `t` ∈ [0, 1]. */
function interpLand(a: PaletteAnchors, t: number): { color: THREE.Color; metal: number; rough: number; emissive?: THREE.Color; emissiveI?: number } {
  const clamped = Math.max(0, Math.min(1, t))
  const stops = [
    { t: 0.00, color: a.shoreColor, metal: a.shoreMetal, rough: a.shoreRough },
    { t: 0.30, color: a.lowColor,   metal: a.lowMetal,   rough: a.lowRough   },
    { t: 0.65, color: a.midColor,   metal: a.midMetal,   rough: a.midRough   },
    { t: 1.00, color: a.peakColor,  metal: a.peakMetal,  rough: a.peakRough  },
  ]
  let i = 0
  while (i < stops.length - 1 && stops[i + 1].t < clamped) i++
  const A = stops[i]
  const B = stops[Math.min(stops.length - 1, i + 1)]
  const span = Math.max(1e-6, B.t - A.t)
  const f    = Math.max(0, Math.min(1, (clamped - A.t) / span))
  const color = A.color.clone().lerp(B.color, f)
  const metal = A.metal * (1 - f) + B.metal * f
  const rough = A.rough * (1 - f) + B.rough * f
  const out: ReturnType<typeof interpLand> = { color, metal, rough }
  // Emissive only kicks in at the very top — mirror previous logic where only
  // the peak anchor carries emissive on volcanic worlds.
  if (a.peakEmissive && clamped > 0.85) {
    const k = (clamped - 0.85) / 0.15
    out.emissive  = a.peakEmissive.color.clone().multiplyScalar(k)
    out.emissiveI = a.peakEmissive.intensity * k
  }
  return out
}

/**
 * Generate a terrain palette for a rocky planet.
 *
 * Emits exactly `levelCount` levels with deterministic heights derived from
 * the body radius: every level spans `radius * TERRAIN_LEVEL_STEP_PER_RADIUS`
 * in world units. Wet worlds split the levels evenly between ocean (bottom
 * half) and land (top half); dry worlds place every level on land.
 *
 * @param temperatureMin  Minimum surface temperature (°C)
 * @param temperatureMax  Maximum surface temperature (°C)
 * @param atmosphereThickness  Normalised atmosphere thickness [0, 1]
 * @param seaLevel  Noise-elevation value at the waterline (Nth percentile)
 * @param levelCount  Desired total level count (>= 2, defaults to {@link DEFAULT_TERRAIN_LEVEL_COUNT})
 * @param radius  Planet visual radius — drives the height step.
 */
export function generateTerrainPalette(
  temperatureMin:      number,
  temperatureMax:      number,
  atmosphereThickness: number,
  seaLevel:            number,
  levelCount:          number = DEFAULT_TERRAIN_LEVEL_COUNT,
  radius:              number = 1,
): TerrainLevel[] {
  const anchors = resolveAnchors(temperatureMin, temperatureMax, atmosphereThickness)
  const N       = Math.max(2, Math.floor(levelCount))
  const step    = Math.max(1e-4, radius * TERRAIN_LEVEL_STEP_PER_RADIUS)

  // Only liquid surfaces (water, ammonia, methane or nitrogen oceans) split
  // the palette into submerged ocean bands (negative heights) and land bands
  // above the sphere. Frozen and dry worlds keep every band ABOVE the
  // reference sphere — no ocean basin to carve, so the planet stays a solid
  // ball.
  const hasWetSurface = seaLevel > -0.99 && hasLiquidSurface({ type: 'rocky', temperatureMin, temperatureMax })

  if (!hasWetSurface) {
    const result: TerrainLevel[] = []
    for (let i = 0; i < N; i++) {
      const t     = i / Math.max(1, N - 1)
      const shade = interpLand(anchors, t)
      result.push({
        threshold: i === N - 1 ? Infinity : -1 + ((i + 1) / N) * 2,
        height:    (i + 0.5) * step,
        color:     shade.color,
        metalness: shade.metal,
        roughness: shade.rough,
        ...(shade.emissive  ? { emissive:         shade.emissive  } : {}),
        ...(shade.emissiveI ? { emissiveIntensity: shade.emissiveI } : {}),
      })
    }
    return result
  }

  // Wet rocky: split N levels into N/2 ocean + N/2 land (N/2 prefers the
  // ocean side when N is odd — sea floors get more resolution than peaks,
  // which matches the visual gradient we care about).
  const oceanLevels = Math.max(1, Math.floor(N / 2))
  const landLevels  = Math.max(1, N - oceanLevels)

  const oceanRange = seaLevel - (-1)
  const landRange  = 1.0 - seaLevel

  const result: TerrainLevel[] = []

  // Ocean side — indexes 0..oceanLevels-1, deepest first.
  // - Threshold splits the ocean noise range into equal slices.
  // - Height drops below the reference surface by (i - N/2 + 0.5) * step.
  // - Colour darkens linearly with depth so the sea floor fades to near-black
  //   while the surface band keeps the full sea colour.
  for (let i = 0; i < oceanLevels; i++) {
    const threshold  = -1 + ((i + 1) / oceanLevels) * oceanRange
    const height     = (i - N / 2 + 0.5) * step
    const depthNorm  = 1 - (i + 0.5) / oceanLevels       // 1 deepest, 0 at surface
    const shade      = 1 - depthNorm * OCEAN_DEEPEST_DARKEN
    result.push({
      threshold,
      height,
      color:     anchors.seaColor.clone().multiplyScalar(shade),
      metalness: anchors.seaMetal,
      roughness: anchors.seaRough,
    })
  }

  // Land side — indexes oceanLevels..N-1, lowest first.
  for (let i = 0; i < landLevels; i++) {
    const levelIdx = oceanLevels + i
    const height   = (levelIdx - N / 2 + 0.5) * step
    const t        = i / Math.max(1, landLevels - 1)
    const shade    = interpLand(anchors, t)
    const threshold = i === landLevels - 1
      ? Infinity
      : seaLevel + ((i + 1) / landLevels) * landRange
    result.push({
      threshold,
      height,
      color:     shade.color,
      metalness: shade.metal,
      roughness: shade.rough,
      ...(shade.emissive  ? { emissive:         shade.emissive  } : {}),
      ...(shade.emissiveI ? { emissiveIntensity: shade.emissiveI } : {}),
    })
  }

  return result
}
