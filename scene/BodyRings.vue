<script setup lang="ts">
/**
 * TresJS wrapper around `buildBodyRings`.
 *
 * Mounting: the pure builder yields a `carrier` group that becomes a direct
 * child of the planet's group — so the ring inherits position, tilt, spin and
 * user drag. Live variation mutations are forwarded via `updateVariation`
 * without rebuilding the mesh (unless inner/outer ratios change, which force
 * a RingGeometry rebuild inside the builder).
 *
 * Sun position: the lib core requires an explicit `sunWorldPos` for the
 * rings' shadow + backlight math. This wrapper accepts the prop verbatim;
 * when omitted, it falls back to per-frame `findDominantLightWorldPos`
 * traversal of the scene root, preserving the plug-and-play ergonomics
 * for simple `<Body>` scenes that just have a single point/directional
 * light. Multi-star scenes pass the resolved sun ref explicitly.
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { buildBodyRings } from '../render/shells/buildBodyRings'
import { findSceneRoot, findDominantLightWorldPos } from '../render/lighting/findDominantLight'
import type { RingVariation } from '../render/shells/ringVariation'

const props = defineProps<{
  /** Planet group — carrier becomes a direct child so it inherits position, tilt, spin and drag. */
  group:            THREE.Group
  /** Planet visual radius (world units). Ring radii are `radius × innerRatio/outerRatio`. */
  radius:           number
  /** Ring self-rotation speed around its own normal (rad/s). */
  rotationSpeed:    number
  /** Deterministic ring variation produced by planetVariation. */
  variation:        RingVariation
  /**
   * Optional caller-driven sun world-space position. When provided, the
   * wrapper wires it directly into the ring shader (no traversal). When
   * omitted, the wrapper does a per-frame `findDominantLightWorldPos`
   * over the scene root — handy for simple scenes with a single
   * point/directional light.
   */
  sunWorldPos?:     THREE.Vector3
}>()

// Mutable Vector3 the builder reads by reference — refreshed on every
// render before `tick()` so the shader sees the up-to-date world pos.
const planetWorldPos = new THREE.Vector3()

// When the caller doesn't push a sun ref, the wrapper owns one and
// refreshes it via the scene-traversal helper each frame. Otherwise we
// alias the caller's vector and skip the traversal entirely.
const ownsSunRef     = props.sunWorldPos === undefined
const sunWorldPos    = props.sunWorldPos ?? new THREE.Vector3()

const rings = buildBodyRings({
  radius:         props.radius,
  rotationSpeed:  props.rotationSpeed,
  variation:      props.variation,
  planetWorldPos,
  sunWorldPos,
})

watch(() => props.variation, v => rings.updateVariation(v), { deep: true })

const { onBeforeRender }  = useLoop()
const { off: stopLoop }   = onBeforeRender(({ delta }) => {
  // Refresh the planet's world position before tick — `rings.tick` and the
  // shader read `planetWorldPos` by reference.
  props.group.getWorldPosition(planetWorldPos)
  // Auto-discover the dominant light only when the caller didn't push
  // its own sun ref — otherwise the caller's update is authoritative.
  if (ownsSunRef && rings.mesh.parent) {
    findDominantLightWorldPos(findSceneRoot(rings.mesh), sunWorldPos)
  }
  rings.tick(delta)
})

onMounted(() => props.group.add(rings.carrier))
onBeforeUnmount(() => {
  stopLoop()
  props.group.remove(rings.carrier)
  rings.dispose()
})
</script>

<template><!-- renderless --></template>
