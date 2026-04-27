/**
 * Open distribution-pattern system — replaces the hardcoded cluster strategy
 * that used to live in `resourceDemo.ts`.
 *
 * A **pattern** is a pure description of how a single resource is laid out
 * on a body's tiles. The dispatcher `applyPattern` evaluates a pattern
 * against a `DistributionContext` (tiles + eligibility filter + seed +
 * radius) and returns `Map<tileId, concentration>`.
 *
 * Five patterns are shipped:
 *
 *   - `cluster`  — gaussian blobs around N seed tiles. Ore deposits, storm
 *                  spots (Jupiter's Red Spot). ← this is the legacy strategy.
 *   - `band`     — concentrations along latitudinal bands of the body. Gas
 *                  giant cloud bands, atmospheric layers.
 *   - `vortex`   — logarithmic spiral around a pole. Cyclones, hurricanes.
 *   - `scatter`  — uniform hashed scatter. Background haze, fine dust.
 *   - `gradient` — pole-to-equator (or equator-to-pole) linear falloff. Polar
 *                  caps, equatorial belts, frost lines.
 *
 * All implementations are deterministic: same `hashKey` + same inputs →
 * identical output map. Eligibility filtering is optional — patterns with
 * `ctx.eligible === undefined` sample every tile.
 */

import type { BiomeType } from './biomes'

// ── Types ─────────────────────────────────────────────────────────

/** Minimal tile shape consumed by the pattern functions. */
export type PatternTile = { id: number; centerPoint: { x: number; y: number; z: number } }

/** 3-axis shorthand. `[0, 1, 0]` is the north polar axis. */
export type Vec3 = [number, number, number]

/**
 * Runtime context passed to every pattern. `hashKey` must be unique per
 * (body, resource) to keep distributions from different resources decorrelated
 * on the same body. `radius` is used to convert `sigmaFrac` / band widths into
 * absolute world-space distances.
 */
export interface DistributionContext {
  tiles:     readonly PatternTile[]
  biomeMap:  ReadonlyMap<number, BiomeType>
  /** Optional filter — when set, only tiles whose biome is in the set contribute. */
  eligible?: ReadonlySet<BiomeType>
  hashKey:   string
  radius:    number
}

// ── Pattern variants ─────────────────────────────────────────────

/** Base fields shared by every pattern. */
interface PatternBase {
  /** Peak output concentration in `[0, 1]`. Output values are never above this. */
  peak:       number
  /** Lower-bound gate — tiles below this value are omitted from the map. Default `0.08`. */
  threshold?: number
}

export interface ClusterPattern extends PatternBase {
  kind:      'cluster'
  /** Number of cluster seed tiles picked from the eligible pool. */
  seeds:     number
  /** Gaussian σ as a fraction of body radius. Larger → wider, softer blobs. */
  sigmaFrac: number
}

export interface BandPattern extends PatternBase {
  kind:   'band'
  /** Number of evenly-spaced bands along the axis (minimum 1). */
  count:  number
  /** Axis vector the bands wrap around. Defaults to `[0, 1, 0]` (polar). */
  axis?:  Vec3
  /**
   * Half-width of each band in "latitude" units (dot-product with axis, in
   * `[0, 1]`). At `width = 0.1` each band is roughly `±5.7°` of arc.
   */
  width:  number
}

export interface VortexPattern extends PatternBase {
  kind:            'vortex'
  /**
   * Centre axis of the vortex:
   *   - `'pole'`   → `[0, 1, 0]`
   *   - `'random'` → a deterministic unit vector derived from `hashKey`
   *   - explicit `Vec3` → used verbatim (caller pre-normalises if needed)
   */
  center:          'pole' | 'random' | Vec3
  /**
   * Logarithmic-spiral tightness. Larger values wind the arms more tightly
   * (tighter cyclones); smaller values produce loose whirlpools. Zero falls
   * back to a radial gradient from the pole.
   */
  spiralTightness: number
  /** Number of spiral arms (integer). Typical values: 1 (single swirl), 2 (double). */
  arms?:           number
}

export interface ScatterPattern extends PatternBase {
  kind:    'scatter'
  /**
   * Fraction of eligible tiles to populate, in `[0, 1]`. `0.3` marks roughly
   * 30 % of tiles as carrying the resource. Intensity ramps down proportionally
   * with the hashed distance from the cutoff, so picks are not uniform but
   * weighted toward low-hash tiles.
   */
  density: number
}

export interface GradientPattern extends PatternBase {
  kind:    'gradient'
  /**
   * Gradient direction:
   *   - `'pole'`    → peaks at both poles, zero at the equator (polar caps).
   *   - `'equator'` → peaks at the equator, zero at the poles (frost belt).
   *   - explicit `Vec3` → peaks along this axis (signed, `dot(tile, axis) → +1`).
   */
  axis:    'pole' | 'equator' | Vec3
  /**
   * Falloff exponent applied to the normalised latitude factor. `1` is linear;
   * `> 1` sharpens the transition; `< 1` softens it.
   */
  falloff: number
}

/** Discriminated union over every supported pattern. */
export type DistributionPattern =
  | ClusterPattern
  | BandPattern
  | VortexPattern
  | ScatterPattern
  | GradientPattern

// ── Deterministic hash ───────────────────────────────────────────

/**
 * FNV-1a → `[0, 1)` pseudo-random. Deterministic for `(seed, x)` pairs — same
 * inputs always produce the same output. Exported so resource assignment code
 * can share the hash family with pattern evaluation.
 */
export function hash01(seed: string, x: number | string): number {
  let h = 2166136261
  const s = seed + ':' + x
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

// ── Vec3 micro-helpers ───────────────────────────────────────────
// Kept inline — the handful of operations we need does not warrant a dependency.

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len === 0) return [0, 1, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/** Returns any unit vector perpendicular to `axis`. */
function anyPerp(axis: Vec3): Vec3 {
  // Pick the world axis least parallel to `axis`, then cross.
  const [x, y, z] = axis
  const ref: Vec3 = Math.abs(x) > 0.9 ? [0, 1, 0] : [1, 0, 0]
  const out = cross(axis, ref)
  return normalise(out)
}

/** Deterministic unit vector seeded off `hashKey`. */
function randomAxis(hashKey: string): Vec3 {
  // Gaussian approximation via three hashed samples → normalise. Not perfectly
  // uniform on the sphere, but good enough for a deterministic swirl centre.
  const x = hash01(hashKey, 'axis-x') * 2 - 1
  const y = hash01(hashKey, 'axis-y') * 2 - 1
  const z = hash01(hashKey, 'axis-z') * 2 - 1
  return normalise([x, y, z])
}

/** Normalised tile position on the unit sphere. */
function tileDir(tile: PatternTile, radius: number): Vec3 {
  const { x, y, z } = tile.centerPoint
  const inv = 1 / (radius || 1)
  return normalise([x * inv, y * inv, z * inv])
}

/** `true` when the tile's biome passes the optional eligibility filter. */
function isEligible(tile: PatternTile, ctx: DistributionContext): boolean {
  if (!ctx.eligible) return true
  const b = ctx.biomeMap.get(tile.id)
  return b !== undefined && ctx.eligible.has(b)
}

function writeIfAboveThreshold(
  out:       Map<number, number>,
  tileId:    number,
  amount:    number,
  threshold: number,
): void {
  if (amount >= threshold) out.set(tileId, amount)
}

// ── Pattern implementations ──────────────────────────────────────

/**
 * Gaussian blobs around `seeds` seed tiles. Matches the legacy cluster
 * strategy and the `buildClusterConcentration` signature that used to live
 * in `resourceDemo.ts`.
 */
export function applyClusterPattern(
  p:   ClusterPattern,
  ctx: DistributionContext,
): Map<number, number> | null {
  const candidates = ctx.tiles.filter(t => isEligible(t, ctx))
  if (candidates.length === 0) return null

  const seeds: PatternTile[] = []
  for (let i = 0; i < p.seeds; i++) {
    const idx = Math.floor(hash01(ctx.hashKey, 'seed-' + i) * candidates.length)
    seeds.push(candidates[idx])
  }

  const sigma     = Math.max(1e-4, p.sigmaFrac * ctx.radius)
  const denom     = 2 * sigma * sigma
  const threshold = p.threshold ?? 0.08
  const out       = new Map<number, number>()

  for (const t of ctx.tiles) {
    if (!isEligible(t, ctx)) continue
    let amount = 0
    for (const s of seeds) {
      const dx = t.centerPoint.x - s.centerPoint.x
      const dy = t.centerPoint.y - s.centerPoint.y
      const dz = t.centerPoint.z - s.centerPoint.z
      amount += Math.exp(-(dx * dx + dy * dy + dz * dz) / denom)
    }
    amount = Math.min(1, amount) * p.peak
    writeIfAboveThreshold(out, t.id, amount, threshold)
  }
  return out
}

/**
 * Evenly-spaced latitudinal bands along `axis`. Intensity peaks at each band's
 * centre and falls linearly to zero at the band edge (± `width`).
 */
export function applyBandPattern(
  p:   BandPattern,
  ctx: DistributionContext,
): Map<number, number> | null {
  const count = Math.max(1, Math.floor(p.count))
  const axis  = normalise(p.axis ?? [0, 1, 0])
  // Band centres evenly spaced in [-1, 1]. For `count === 1`, the single band
  // centres at the equator (lat = 0).
  const centres = count === 1
    ? [0]
    : Array.from({ length: count }, (_, i) => -1 + (2 * i) / (count - 1))

  const out       = new Map<number, number>()
  const threshold = p.threshold ?? 0.08
  const halfWidth = Math.max(1e-4, p.width)

  for (const t of ctx.tiles) {
    if (!isEligible(t, ctx)) continue
    const n   = tileDir(t, ctx.radius)
    const lat = dot(n, axis)
    let minDist = Infinity
    for (const c of centres) minDist = Math.min(minDist, Math.abs(lat - c))
    const intensity = Math.max(0, 1 - minDist / halfWidth)
    const amount    = intensity * p.peak
    writeIfAboveThreshold(out, t.id, amount, threshold)
  }
  return out
}

/**
 * Logarithmic spiral centred on `axis`. Intensity couples a radial falloff
 * (strong at the pole, fading toward the equator) with an angular modulation
 * that produces `arms` (default 1) spiral arms. Classic cyclone look.
 */
export function applyVortexPattern(
  p:   VortexPattern,
  ctx: DistributionContext,
): Map<number, number> | null {
  const axis: Vec3 =
    p.center === 'pole'   ? [0, 1, 0] :
    p.center === 'random' ? randomAxis(ctx.hashKey) :
    normalise(p.center)

  const arms      = Math.max(1, Math.floor(p.arms ?? 1))
  const tightness = Math.max(0, p.spiralTightness)
  const perp      = anyPerp(axis)
  const other     = cross(axis, perp)

  const out       = new Map<number, number>()
  const threshold = p.threshold ?? 0.08

  for (const t of ctx.tiles) {
    if (!isEligible(t, ctx)) continue
    const n   = tileDir(t, ctx.radius)
    const lat = dot(n, axis)                        // +1 at axis pole, -1 at anti-pole
    // Signed polar coordinate — vortices live on ONE pole (like a real cyclone),
    // so the anti-pole gets no contribution. `r` is 0 at the chosen pole and
    // rises to 1 as we travel toward (and past) the equator.
    const polar = Math.max(0, lat)
    const r     = 1 - polar                         // 0 at pole, 1 at equator/anti-pole

    // Angular position around the axis.
    const x = dot(n, perp)
    const y = dot(n, other)
    const theta = Math.atan2(y, x)

    // Logarithmic spiral: intensity peaks on `arms` arms. `tightness` winds
    // them tighter as `r` increases. A small ε inside log avoids -∞ at the pole.
    const phase = arms * theta - tightness * Math.log(r + 0.1)
    const arm   = (Math.cos(phase) + 1) * 0.5       // [0, 1]

    const radial = Math.exp(-r * 3)                 // fade toward equator
    const amount = arm * radial * p.peak
    writeIfAboveThreshold(out, t.id, amount, threshold)
  }
  return out
}

/**
 * Uniform hashed scatter — each eligible tile draws an independent sample
 * from `hash01`. Tiles whose hash lands below `density` receive coverage,
 * with intensity inversely proportional to how close the hash was to the
 * cutoff (so dense tiles are sparse, light tiles are common).
 */
export function applyScatterPattern(
  p:   ScatterPattern,
  ctx: DistributionContext,
): Map<number, number> | null {
  const out       = new Map<number, number>()
  const threshold = p.threshold ?? 0.08
  const density   = Math.min(1, Math.max(0, p.density))
  if (density === 0) return out

  for (const t of ctx.tiles) {
    if (!isEligible(t, ctx)) continue
    const n = hash01(ctx.hashKey, 'scatter-' + t.id)
    if (n >= density) continue
    const intensity = 1 - n / density
    const amount    = intensity * p.peak
    writeIfAboveThreshold(out, t.id, amount, threshold)
  }
  return out
}

/**
 * Pole-to-equator gradient. `axis === 'pole'` peaks at both poles (polar
 * caps); `'equator'` peaks at the equator (frost belt). An explicit `Vec3`
 * biases along that direction (signed — `dot(tile, axis) → +1` at the tip).
 */
export function applyGradientPattern(
  p:   GradientPattern,
  ctx: DistributionContext,
): Map<number, number> | null {
  const polar    = p.axis === 'pole' || p.axis === 'equator'
  const axisVec: Vec3 = polar ? [0, 1, 0] : normalise(p.axis as Vec3)
  const out      = new Map<number, number>()
  const threshold = p.threshold ?? 0.08
  const exponent = Math.max(0, p.falloff)

  for (const t of ctx.tiles) {
    if (!isEligible(t, ctx)) continue
    const n = tileDir(t, ctx.radius)
    const d = dot(n, axisVec)

    let t_val: number
    if (p.axis === 'pole')         t_val = Math.abs(d)        // peaks at both poles
    else if (p.axis === 'equator') t_val = 1 - Math.abs(d)    // peaks at equator
    else                           t_val = Math.max(0, d)     // peaks along explicit axis

    const intensity = Math.pow(t_val, exponent)
    const amount    = intensity * p.peak
    writeIfAboveThreshold(out, t.id, amount, threshold)
  }
  return out
}

// ── Dispatcher ────────────────────────────────────────────────────

/**
 * Dispatches to the per-kind implementation. Returns `null` when the pattern
 * cannot produce any output (e.g. cluster with no eligible seeds); returns
 * an empty map when evaluation succeeded but every tile fell below threshold.
 */
export function applyPattern(
  pattern: DistributionPattern,
  ctx:     DistributionContext,
): Map<number, number> | null {
  switch (pattern.kind) {
    case 'cluster':  return applyClusterPattern(pattern, ctx)
    case 'band':     return applyBandPattern(pattern, ctx)
    case 'vortex':   return applyVortexPattern(pattern, ctx)
    case 'scatter':  return applyScatterPattern(pattern, ctx)
    case 'gradient': return applyGradientPattern(pattern, ctx)
  }
}
