/**
 * Spherical nearest-tile lookup — shared spatial index used by every
 * caller that needs to map an arbitrary world-space point to its closest
 * tile on a hexasphere.
 *
 * The trick is a 2D azimuth × polar grid covering the unit sphere. Each
 * tile is binned into one cell at index time; queries scan the 3×3 cell
 * neighbourhood around the query direction. Polar rows wrap fully in
 * azimuth so the wrap-around at the poles is handled correctly.
 *
 * Cost is `O(k)` per query where `k` is the average tile count per cell
 * (≈ 36 for ~640 tiles), versus `O(T)` for a brute-force dot product
 * scan. Allocation-free on the hot path — typed-array buckets only.
 */

/** Minimal tile shape the lookup needs — accepts `Tile[]` directly. */
export interface SphericalIndexedTile {
  id:          number
  centerPoint: { x: number; y: number; z: number }
}

// 360° / 18 = 20° azimuth bin · 180° / 9 = 20° polar bin.
// Max inter-tile angle is ~9° at typical subdivisions, so a 3×3 window
// is safe; pole rows expand to all azimuths to dodge wrap-around misses.
const GRID_AZI = 18
const GRID_POL = 9

function aziCell(nz: number, nx: number): number {
  return Math.floor(((Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5) * GRID_AZI) % GRID_AZI
}

function polCell(ny: number): number {
  return Math.min(GRID_POL - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI) * GRID_POL))
}

/** Pre-built spatial index — typed arrays + cell buckets. */
interface SphericalIndex {
  count: number
  nx:    Float32Array
  ny:    Float32Array
  nz:    Float32Array
  ids:   Int32Array
  cells: number[][]
}

function buildIndex(tiles: readonly SphericalIndexedTile[]): SphericalIndex {
  const count = tiles.length
  const nx    = new Float32Array(count)
  const ny    = new Float32Array(count)
  const nz    = new Float32Array(count)
  const ids   = new Int32Array(count)
  const cells: number[][] = Array.from({ length: GRID_AZI * GRID_POL }, () => [])

  for (let i = 0; i < count; i++) {
    const c   = tiles[i].centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z)
    const ux  = c.x / len, uy = c.y / len, uz = c.z / len
    nx[i]  = ux
    ny[i]  = uy
    nz[i]  = uz
    ids[i] = tiles[i].id
    cells[polCell(uy) * GRID_AZI + aziCell(uz, ux)].push(i)
  }

  return { count, nx, ny, nz, ids, cells }
}

/** Iterates the 3×3 cell neighbourhood around a query direction. */
function forEachNeighbourCell(
  index: SphericalIndex,
  qAzi:  number,
  qPol:  number,
  visit: (cell: number[]) => void,
): void {
  for (let dp = -1; dp <= 1; dp++) {
    const p = qPol + dp
    if (p < 0 || p >= GRID_POL) continue
    const isPolar  = p === 0 || p === GRID_POL - 1
    const aziCount = isPolar ? GRID_AZI : 3
    const aziStart = isPolar ? 0 : qAzi - 1
    for (let da = 0; da < aziCount; da++) {
      const a = ((aziStart + da) + GRID_AZI) % GRID_AZI
      visit(index.cells[p * GRID_AZI + a])
    }
  }
}

/**
 * Builds a single-nearest lookup. Returns the tile id of the tile whose
 * unit-sphere centre is closest to the query direction (highest dot
 * product). Allocation-free per query.
 */
export function buildSphericalNearestLookup(
  tiles: readonly SphericalIndexedTile[],
): (x: number, y: number, z: number) => number {
  const index = buildIndex(tiles)
  const { nx, ny, nz, ids } = index

  return (x, y, z) => {
    const len = Math.sqrt(x * x + y * y + z * z)
    const qx  = x / len, qy = y / len, qz = z / len
    const qa  = aziCell(qz, qx)
    const qp  = polCell(qy)

    let bestDot = -Infinity
    let bestIdx = 0
    forEachNeighbourCell(index, qa, qp, (cell) => {
      for (const i of cell) {
        const dot = qx * nx[i] + qy * ny[i] + qz * nz[i]
        if (dot > bestDot) { bestDot = dot; bestIdx = i }
      }
    })
    return ids[bestIdx]
  }
}

/**
 * Builds a top-K lookup. Writes K tile ids and their normalised blend
 * weights into caller-supplied typed arrays starting at `outOffset`,
 * so the caller can pre-allocate a single flat buffer of size `verts × K`
 * and the query path stays allocation-free.
 *
 * Weights are derived from `dot − dotKth` (offset against the K-th best)
 * then normalised to sum to 1; degenerate cases (all dots equal) collapse
 * to uniform `1/K`. This is the natural smooth-blend weighting for
 * vertex paint use cases — point-by-point queries can ignore the weight
 * output if they only need the ids.
 *
 * `k` is silently clamped to `tiles.length` when smaller; a tiles array
 * of length zero is a usage error and never expected.
 */
export function buildSphericalKNearestLookup(
  tiles: readonly SphericalIndexedTile[],
  k:     number,
): (
  x:          number,
  y:          number,
  z:          number,
  outIds:     Int32Array,
  outWeights: Float32Array,
  outOffset:  number,
) => void {
  const index   = buildIndex(tiles)
  const { nx, ny, nz, ids } = index
  const K       = Math.min(Math.max(1, k | 0), index.count)
  const topIdx  = new Int32Array(K)
  const topDot  = new Float32Array(K)

  return (x, y, z, outIds, outWeights, outOffset) => {
    const len = Math.sqrt(x * x + y * y + z * z)
    const qx  = x / len, qy = y / len, qz = z / len
    const qa  = aziCell(qz, qx)
    const qp  = polCell(qy)

    for (let i = 0; i < K; i++) { topIdx[i] = 0; topDot[i] = -Infinity }

    function tryInsert(i: number): void {
      const dot = qx * nx[i] + qy * ny[i] + qz * nz[i]
      let pos = K
      for (let p = 0; p < K; p++) {
        if (dot > topDot[p]) { pos = p; break }
      }
      if (pos >= K) return
      for (let p = K - 1; p > pos; p--) {
        topDot[p] = topDot[p - 1]
        topIdx[p] = topIdx[p - 1]
      }
      topDot[pos] = dot
      topIdx[pos] = i
    }

    forEachNeighbourCell(index, qa, qp, (cell) => {
      for (const i of cell) tryInsert(i)
    })

    // Fallback for sparse tile sets — when the 3×3 cell window does not
    // fill all K slots (happens at K close to the tile count, never in
    // production-density hex meshes), reset and brute-force scan every
    // tile so the top-K stays well-defined and the normalised weights
    // don't read NaN. Reset is required because re-inserting the same
    // tiles into a partially filled top-K would duplicate the entries
    // that got in via the local sweep.
    if (topDot[K - 1] === -Infinity) {
      for (let i = 0; i < K; i++) { topIdx[i] = 0; topDot[i] = -Infinity }
      for (let i = 0; i < index.count; i++) tryInsert(i)
    }

    const floor = topDot[K - 1]
    let sum = 0
    for (let p = 0; p < K; p++) sum += topDot[p] - floor
    const useUniform = sum <= 1e-6

    for (let p = 0; p < K; p++) {
      outIds[outOffset + p]     = ids[topIdx[p]]
      outWeights[outOffset + p] = useUniform
        ? 1 / K
        : (topDot[p] - floor) / sum
    }
  }
}
