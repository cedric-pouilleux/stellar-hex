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
 * The ring shader auto-discovers the scene's dominant light source for its
 * backlight / shadow math — no sun prop.
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { buildBodyRings } from '../render/buildBodyRings'
import type { RingVariation } from '../render/ringVariation'

const props = defineProps<{
  /** Planet group — carrier becomes a direct child so it inherits position, tilt, spin and drag. */
  group:            THREE.Group
  /** Planet visual radius (world units). Ring radii are `radius × innerRatio/outerRatio`. */
  radius:           number
  /** Ring self-rotation speed around its own normal (rad/s). */
  rotationSpeed:    number
  /** Deterministic ring variation produced by planetVariation. */
  variation:        RingVariation
  /** When true, the ring's self-spin stops (carrier still tracks the group). */
  paused?:          boolean
  /** Scales ring-spin accumulation (default 1). */
  speedMultiplier?: number
}>()

const _planetWP = new THREE.Vector3()

const rings = buildBodyRings({
  radius:            props.radius,
  rotationSpeed:     props.rotationSpeed,
  variation:         props.variation,
  paused:            props.paused,
  speedMultiplier:   props.speedMultiplier,
  getPlanetWorldPos: () => props.group.getWorldPosition(_planetWP),
})

watch(() => props.paused,          v => rings.setPaused(v ?? false))
watch(() => props.speedMultiplier, v => rings.setSpeedMultiplier(v ?? 1))
watch(() => props.variation, v => rings.updateVariation(v), { deep: true })

const { onBeforeRender }  = useLoop()
const { off: stopLoop }   = onBeforeRender(({ delta }) => rings.tick(delta))

onMounted(() => props.group.add(rings.carrier))
onBeforeUnmount(() => {
  stopLoop()
  props.group.remove(rings.carrier)
  rings.dispose()
})
</script>

<template><!-- renderless --></template>
