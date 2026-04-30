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
 * Sun light: when a `sunLight` PointLight (or DirectionalLight) is provided,
 * the builder reads its world position each tick. Otherwise the builder
 * auto-discovers the dominant light under the scene root — preserving the
 * plug-and-play ergonomics for simple scenes with a single light source.
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { buildBodyRings } from '../render/shells/buildBodyRings'
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
   * Optional explicit light source. When provided, the builder reads its
   * world position every tick. When omitted, the builder auto-discovers
   * the dominant light under the scene root each frame.
   */
  sunLight?:        THREE.PointLight | THREE.DirectionalLight | null
}>()

// Mutable Vector3 the builder reads by reference — refreshed on every
// render before `tick()` so the shader sees the up-to-date world pos.
const planetWorldPos = new THREE.Vector3()

const rings = buildBodyRings({
  radius:         props.radius,
  rotationSpeed:  props.rotationSpeed,
  variation:      props.variation,
  planetWorldPos,
  sunLight:       props.sunLight ?? null,
})

watch(() => props.variation, v => rings.updateVariation(v), { deep: true })

const { onBeforeRender }  = useLoop()
const { off: stopLoop }   = onBeforeRender(({ delta }) => {
  // Refresh the planet's world position before tick — `rings.tick` and the
  // shader read `planetWorldPos` by reference.
  props.group.getWorldPosition(planetWorldPos)
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
