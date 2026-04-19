/** 3D point in space */
export interface Point3D {
  x: number
  y: number
  z: number
}

/** A tile (hexagon or pentagon) on the hexasphere */
export interface Tile {
  /** Unique identifier for this tile */
  id: number
  /** Center point projected on the sphere surface */
  centerPoint: Point3D
  /** Ordered boundary vertices forming the polygon */
  boundary: Point3D[]
  /** True if this tile is a pentagon (12 exist on any hexasphere) */
  isPentagon: boolean
}

/** Result of hexasphere generation */
export interface HexasphereData {
  /** Sphere radius */
  radius: number
  /** Number of subdivisions per icosahedron edge */
  subdivisions: number
  /** All generated tiles */
  tiles: Tile[]
}
