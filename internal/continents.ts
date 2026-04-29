/**
 * Macro continent mask — additive layer on top of the simplex elevation field
 * that produces discrete landmasses (vs the moiré of micro islands a pure FBM
 * generates on humid worlds).
 *
 * The mask is a 3D voronoi tessellation of the unit sphere. Each cell receives
 * a binary "continent / depression" tag from a sin-free polynomial hash, so the
 * formula is byte-identical between the CPU sampler used by `BodySimulation`
 * and the GLSL replica that lives in `liquidMask.glsl`. Boundaries are softened
 * with a smoothstep on the F2-F1 distance — sharp cliffs would clash with the
 * smooth band quantisation downstream.
 *
 * Pure module — no `three` dependency, safe to import from headless callers.
 */

import { seededPrng } from './prng'

/**
 * Polynomial hash derived from Dave Hoskins' `hash3` (used in `noise.glsl`).
 * Returns three values in `[0, 1)` — the call site picks `.x` for the binary
 * continent tag and `.xyz` for the cell-position jitter so each voronoi cell
 * lands somewhere inside its grid box rather than on the box centre.
 *
 * Mirrors the GLSL implementation **exactly** — any precision drift here
 * translates into CPU/GPU desync at the cell boundaries.
 */
function hash3(x: number, y: number, z: number): [number, number, number] {
  let px = (x * 0.1031) % 1; if (px < 0) px += 1
  let py = (y * 0.1030) % 1; if (py < 0) py += 1
  let pz = (z * 0.0973) % 1; if (pz < 0) pz += 1
  // p += dot(p, p.yxz + 33.33)
  const d = px * (py + 33.33) + py * (px + 33.33) + pz * (pz + 33.33)
  px += d; py += d; pz += d
  // (p.xxy + p.yxx) * p.zyx
  let rx = (px + py) * pz
  let ry = (px + px) * py
  let rz = (py + px) * px
  rx -= Math.floor(rx)
  ry -= Math.floor(ry)
  rz -= Math.floor(rz)
  return [rx, ry, rz]
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Evaluates the continent mask at a unit-sphere position.
 *
 * The point is scaled into voronoi space (`unit * scale + seedOffset`) and the
 * 3×3×3 neighbourhood is searched for the two closest cells. The tag of the
 * nearest cell decides continent (`+1`) or depression (`-1`); the F2-F1
 * distance softens the boundary so cell walls feel like coastlines rather
 * than tectonic faults.
 *
 * @param unit       Unit-sphere direction `(x, y, z)`. Magnitude must be ~1.
 * @param scale      Voronoi frequency. `1` ≈ 4–8 cells visible from one
 *                   hemisphere; `2` ≈ 12–20 cells; up to `3` for archipelagos.
 * @param seedOffset Per-planet domain offset — see {@link continentSeedFromName}.
 * @returns Mask in `[-1, +1]` ready to be added to a noise sample, scaled by
 *          a caller-supplied amplitude.
 */
export function continentMask3D(
  unit:       { x: number; y: number; z: number },
  scale:      number,
  seedOffset: readonly [number, number, number],
): number {
  const px = unit.x * scale + seedOffset[0]
  const py = unit.y * scale + seedOffset[1]
  const pz = unit.z * scale + seedOffset[2]

  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz)
  const fx = px - ix,        fy = py - iy,        fz = pz - iz

  let f1 = Infinity, f2 = Infinity
  let nearestTag = 0

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = ix + dx, cellY = iy + dy, cellZ = iz + dz
        const [hx, hy, hz] = hash3(cellX, cellY, cellZ)
        const dvx = dx + hx - fx
        const dvy = dy + hy - fy
        const dvz = dz + hz - fz
        const d2  = dvx * dvx + dvy * dvy + dvz * dvz
        if (d2 < f1) {
          f2 = f1
          f1 = d2
          // Re-hash the cell origin with a different swizzle to decorrelate
          // the binary tag from the jitter — cells with jitter > 0.5 must not
          // automatically be continents.
          nearestTag = hash3(cellZ, cellX, cellY)[0]
        } else if (d2 < f2) {
          f2 = d2
        }
      }
    }
  }

  const sign = nearestTag > 0.5 ? 1 : -1
  // Soften the border across a fixed distance band — narrow enough that
  // coastlines stay readable, wide enough to avoid one-tile cliffs.
  const edge = Math.sqrt(f2) - Math.sqrt(f1)
  const softness = smoothstep(0, 0.18, edge)
  return sign * softness
}

/**
 * Derives a deterministic 3-component seed offset from the body name. The
 * offset shifts the voronoi sampling domain so two bodies with different names
 * grow different continent layouts — same name → same continents.
 *
 * The triplet is also exposed as a `vec3` shader uniform so the GPU mask
 * matches the CPU classification on the liquid boundary.
 */
export function continentSeedFromName(name: string): [number, number, number] {
  const rng = seededPrng(name + ':continent')
  return [rng() * 1000, rng() * 1000, rng() * 1000]
}
