import * as THREE from 'three'

/** Shorthand hex → THREE.Color. */
export function c(hex: number) { return new THREE.Color(hex) }

/** Linear interpolation between two colors. */
export function lerp(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  )
}

/** Piecewise linear interpolation along temperature anchors (°C). */
export function tempLerp(anchors: [number, THREE.Color][], avgC: number): THREE.Color {
  if (avgC <= anchors[0][0])                   return anchors[0][1].clone()
  if (avgC >= anchors[anchors.length - 1][0])  return anchors[anchors.length - 1][1].clone()
  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, c0] = anchors[i]
    const [t1, c1] = anchors[i + 1]
    if (avgC <= t1) return lerp(c0, c1, (avgC - t0) / (t1 - t0))
  }
  return anchors[anchors.length - 1][1].clone()
}

/** Piecewise linear interpolation of a scalar along temperature anchors (°C). */
export function numLerp(anchors: [number, number][], avgC: number): number {
  if (avgC <= anchors[0][0])                   return anchors[0][1]
  if (avgC >= anchors[anchors.length - 1][0])  return anchors[anchors.length - 1][1]
  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, v0] = anchors[i]
    const [t1, v1] = anchors[i + 1]
    if (avgC <= t1) return v0 + (v1 - v0) * ((avgC - t0) / (t1 - t0))
  }
  return anchors[anchors.length - 1][1]
}
