/**
 * Seeded simplex-noise permutation table + GPU texture upload.
 *
 * Mirrors the `buildPermutationTable` Fisher-Yates shuffle used inside
 * `simplex-noise` so a GLSL simplex3D can reproduce the exact CPU
 * elevation field. Consumed by any shader that wants the same noise
 * sample the CPU uses (e.g. `shaders/glsl/lib/liquidMask.glsl` gates
 * per-fragment effects on the smooth-sphere by comparing the noise to
 * the current sea level).
 */

import * as THREE from 'three'
import { seededPrng } from '../internal/prng'

/** Builds the 512-byte permutation table for a given seed (first 256 bytes
 *  shuffled, duplicated into [256, 511] so `p[jj + p[kk]]` never wraps). */
export function buildPermTable(seed: string): Uint8Array {
  const random = seededPrng(seed)
  const p = new Uint8Array(512)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 0; i < 255; i++) {
    const r   = i + ~~(random() * (256 - i))
    const tmp = p[i]; p[i] = p[r]; p[r] = tmp
  }
  for (let i = 256; i < 512; i++) p[i] = p[i - 256]
  return p
}

/** Wraps the perm table as a 512×1 nearest-filter texture the shader can sample. */
export function permTableToTexture(perm: Uint8Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(perm, 512, 1, THREE.RedFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS     = THREE.ClampToEdgeWrapping
  tex.wrapT     = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}
