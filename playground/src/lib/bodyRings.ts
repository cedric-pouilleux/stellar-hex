import * as THREE from 'three'
import { buildBodyRings, type BodyRingsHandle, type RingVariation } from '@lib'
import type { RingOverrides } from './state'

/**
 * Merges seed-driven ring variation with user-editable overrides.
 * Undefined override fields fall back to the generated variation so the
 * deterministic look is preserved until the user actively tweaks a field.
 */
export function mergeRingVariation(
  base:      RingVariation,
  overrides: RingOverrides,
): RingVariation {
  return { ...base, ...strip(overrides) }
}

function strip<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k in o) {
    const v = o[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * Attaches a ring system to a body group when the variation provides one.
 *
 * Mirrors what `scene/BodyRings.vue` does for the main app: the carrier group
 * is added as a direct child of the planet so it inherits tilt/spin/drag,
 * while the ring's own self-rotation is accumulated inside the handle.
 *
 * @param group         - Planet group the carrier should be attached to.
 * @param radius        - Planet visual radius (world units).
 * @param rotationSpeed - Ring self-spin in rad/s (typically the planet's).
 * @param variation     - Deterministic ring variation; `null` disables rings.
 * @param sunLight      - Explicit light source. Pass `null` to let the
 *                        builder auto-discover the dominant light each
 *                        tick from the scene root.
 * @returns The handle when rings were attached, `null` otherwise.
 */
export function attachBodyRings(
  group:         THREE.Group,
  radius:        number,
  rotationSpeed: number,
  variation:     RingVariation | null | undefined,
  sunLight:      THREE.PointLight | THREE.DirectionalLight | null,
): BodyRingsHandle | null {
  if (!variation) return null

  // Mutable Vector3 wired into the lib's shadow uniform by reference. The
  // wrapped `tick` refreshes it from the body's world matrix before
  // delegating, so callers stay on the original `tick(dt)` ergonomics.
  const planetWorldPos = new THREE.Vector3()
  const inner = buildBodyRings({ radius, rotationSpeed, variation, planetWorldPos, sunLight })
  group.add(inner.carrier)

  const wrapped: BodyRingsHandle = {
    carrier: inner.carrier,
    mesh:    inner.mesh,
    tick(dt: number): void {
      group.getWorldPosition(planetWorldPos)
      inner.tick(dt)
    },
    updateVariation: inner.updateVariation,
    dispose:         inner.dispose,
  }
  return wrapped
}

/**
 * Detaches and disposes a ring handle previously produced by {@link attachBodyRings}.
 */
export function detachBodyRings(group: THREE.Group, rings: BodyRingsHandle): void {
  group.remove(rings.carrier)
  rings.dispose()
}
