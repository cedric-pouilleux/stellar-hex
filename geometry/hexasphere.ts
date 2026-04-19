import type { Point3D, Tile, HexasphereData } from './hexasphere.types'

// ── Icosahedron base geometry ───────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2

const ICOSAHEDRON_VERTICES: Point3D[] = [
  { x: -1, y: PHI, z: 0 },
  { x: 1, y: PHI, z: 0 },
  { x: -1, y: -PHI, z: 0 },
  { x: 1, y: -PHI, z: 0 },
  { x: 0, y: -1, z: PHI },
  { x: 0, y: 1, z: PHI },
  { x: 0, y: -1, z: -PHI },
  { x: 0, y: 1, z: -PHI },
  { x: PHI, y: 0, z: -1 },
  { x: PHI, y: 0, z: 1 },
  { x: -PHI, y: 0, z: -1 },
  { x: -PHI, y: 0, z: 1 },
]

/** Each face is a triple of vertex indices */
const ICOSAHEDRON_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

// ── Vector utilities ────────────────────────────────────────────────

function normalize(p: Point3D): Point3D {
  const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
  if (len < 1e-10) return { x: 0, y: 1, z: 0 }  // degenerate point — fallback to north pole
  return { x: p.x / len, y: p.y / len, z: p.z / len }
}

function scale(p: Point3D, s: number): Point3D {
  return { x: p.x * s, y: p.y * s, z: p.z * s }
}

/**
 * Stable integer key for a unit-sphere point.
 * Multiplying by 1e6 and rounding gives sub-micron precision on a unit sphere —
 * far tighter than any floating-point drift from barycentric interpolation.
 * Using integer arithmetic (no toFixed) avoids locale/rounding inconsistencies.
 */
function pointKey(p: Point3D): string {
  const x = Math.round(p.x * 1_000_000)
  const y = Math.round(p.y * 1_000_000)
  const z = Math.round(p.z * 1_000_000)
  return `${x},${y},${z}`
}

// ── Subdivision ─────────────────────────────────────────────────────

interface Triangle {
  a: Point3D
  b: Point3D
  c: Point3D
}

/**
 * Subdivide a triangle into n² sub-triangles and project onto unit sphere.
 */
function subdivideTriangle(
  a: Point3D,
  b: Point3D,
  c: Point3D,
  n: number,
): Triangle[] {
  // Create a grid of points using barycentric interpolation
  const rows: Point3D[][] = []

  for (let i = 0; i <= n; i++) {
    const row: Point3D[] = []
    for (let j = 0; j <= n - i; j++) {
      const k = n - i - j
      const p: Point3D = {
        x: (a.x * i + b.x * j + c.x * k) / n,
        y: (a.y * i + b.y * j + c.y * k) / n,
        z: (a.z * i + b.z * j + c.z * k) / n,
      }
      row.push(normalize(p))
    }
    rows.push(row)
  }

  const triangles: Triangle[] = []

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      // Upward-pointing triangle
      triangles.push({
        a: rows[i][j],
        b: rows[i][j + 1],
        c: rows[i + 1][j],
      })

      // Downward-pointing triangle (if exists)
      if (j + 1 <= n - i - 1) {
        triangles.push({
          a: rows[i][j + 1],
          b: rows[i + 1][j + 1],
          c: rows[i + 1][j],
        })
      }
    }
  }

  return triangles
}

// ── Tile generation (dual mesh) ─────────────────────────────────────

/**
 * Compute the centroid of a triangle, projected onto the unit sphere.
 */
function triangleCentroid(t: Triangle): Point3D {
  return normalize({
    x: (t.a.x + t.b.x + t.c.x) / 3,
    y: (t.a.y + t.b.y + t.c.y) / 3,
    z: (t.a.z + t.b.z + t.c.z) / 3,
  })
}

/**
 * Generate the hexasphere by building the dual of the subdivided icosahedron.
 *
 * Algorithm:
 * 1. Subdivide each icosahedron face into n² triangles
 * 2. Project all vertices onto the unit sphere
 * 3. For each unique vertex, find all adjacent triangles
 * 4. Use the centroids of those triangles + midpoints of shared edges
 *    to form the tile boundary (hex or pent)
 */
export function generateHexasphere(
  radius: number,
  subdivisions: number,
): HexasphereData {
  // Normalize icosahedron vertices onto unit sphere
  const icoVerts = ICOSAHEDRON_VERTICES.map(normalize)

  // Step 1: Generate all subdivided triangles
  const allTriangles: Triangle[] = []
  for (const [ia, ib, ic] of ICOSAHEDRON_FACES) {
    const tris = subdivideTriangle(icoVerts[ia], icoVerts[ib], icoVerts[ic], subdivisions)
    allTriangles.push(...tris)
  }

  // Step 2: Build vertex → adjacent triangles map
  const vertexTriangles = new Map<string, number[]>()

  for (let ti = 0; ti < allTriangles.length; ti++) {
    const t = allTriangles[ti]
    for (const v of [t.a, t.b, t.c]) {
      const key = pointKey(v)
      if (!vertexTriangles.has(key)) {
        vertexTriangles.set(key, [])
      }
      vertexTriangles.get(key)!.push(ti)
    }
  }

  // Step 3: For each unique vertex, build a tile
  const tiles: Tile[] = []
  let tileId = 0

  for (const [, triIndices] of vertexTriangles) {
    // Collect centroids of adjacent triangles as boundary points
    const centroids = triIndices.map((ti) => triangleCentroid(allTriangles[ti]))

    // Sort centroids by angle around the vertex center for correct winding
    const center = normalize(
      centroids.reduce(
        (acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y, z: acc.z + c.z }),
        { x: 0, y: 0, z: 0 },
      ),
    )

    const sortedBoundary = sortPointsAroundCenter(centroids, center)

    // Scale to desired radius
    const scaledCenter = scale(center, radius)
    const scaledBoundary = sortedBoundary.map((p) => scale(p, radius))

    tiles.push({
      id: tileId++,
      centerPoint: scaledCenter,
      boundary: scaledBoundary,
      isPentagon: sortedBoundary.length === 5,
    })
  }

  return { radius, subdivisions, tiles }
}

/**
 * Sort boundary points around a center using angular ordering.
 * Projects points onto a local tangent plane and sorts by atan2.
 */
function sortPointsAroundCenter(points: Point3D[], center: Point3D): Point3D[] {
  // Build a local coordinate frame on the tangent plane
  const n = center // normal = center (unit sphere)

  // Find an arbitrary vector not parallel to n
  const arbitrary: Point3D =
    Math.abs(n.x) < 0.9
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 }

  // tangent u = normalize(arbitrary - (arbitrary·n)·n)
  const dot = arbitrary.x * n.x + arbitrary.y * n.y + arbitrary.z * n.z
  const u = normalize({
    x: arbitrary.x - dot * n.x,
    y: arbitrary.y - dot * n.y,
    z: arbitrary.z - dot * n.z,
  })

  // v = n × u
  const v: Point3D = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  }

  // Project each point and compute angle
  return [...points].sort((a, b) => {
    const aProj = { u: a.x * u.x + a.y * u.y + a.z * u.z, v: a.x * v.x + a.y * v.y + a.z * v.z }
    const bProj = { u: b.x * u.x + b.y * u.y + b.z * u.z, v: b.x * v.x + b.y * v.y + b.z * v.z }
    return Math.atan2(aProj.v, aProj.u) - Math.atan2(bProj.v, bProj.u)
  })
}

