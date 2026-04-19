<script setup lang="ts">
import { onMounted } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import type { BodyConfig, OrbitConfig } from '../types/body.types'

const props = defineProps<{
  group:            THREE.Group
  config:           BodyConfig
  orbit?:           OrbitConfig
  parentGroup?:     THREE.Group | null
  paused?:          boolean
  speedMultiplier?: number   // default 1 — scales all motion (orbit + rotation)
  onTick?:          (delta: number) => void  // always called, even when paused (e.g. shader uniforms)
  /** When true, skips orbit updates and removes axial tilt (preview mode takes over). */
  previewMode?:     boolean
  /**
   * Accumulated user-drag quaternion applied on top of auto-spin (hexa mode).
   * Premultiplied onto the group quaternion each frame so world-space drag
   * rotates the planet surface without disturbing the auto-spin axis.
   */
  userDragQuat?:    THREE.Quaternion | null
}>()

const { onBeforeRender } = useLoop()

// ── Motion accumulators ───────────────────────────────────────────
let orbitAngle = 0
let spinAngle  = 0

// ── Reusable quaternion temporaries ──────────────────────────────
const _tiltQuat = new THREE.Quaternion()
const _spinQuat = new THREE.Quaternion()
const _yAxis    = new THREE.Vector3(0, 1, 0)
const _zAxis    = new THREE.Vector3(0, 0, 1)

onMounted(() => {
  // Seed orbit at the configured starting angle so planets spread across their orbits.
  orbitAngle = props.orbit?.initialAngle ?? 0
  spinAngle  = 0
  // Quaternion-based rotation: no Euler setup needed (tilt is computed each frame).
})

onBeforeRender(({ delta }) => {
  const dt = delta * (props.speedMultiplier ?? 1)
  // shader uniforms etc — not gated by paused
  props.onTick?.(dt)

  if (!props.paused) {
    if (props.previewMode) {
      // In preview: self-rotation only, no axial tilt
      spinAngle += props.config.rotationSpeed * dt
    } else {
      // ── Orbit around parent (or origin) ──────────────────────────
      if (props.orbit) {
        orbitAngle += props.orbit.speed * dt
        const ox  = props.parentGroup?.position.x ?? 0
        const oy  = props.parentGroup?.position.y ?? 0
        const oz  = props.parentGroup?.position.z ?? 0
        const r   = props.orbit.radius
        const inc = props.orbit.inclination

        props.group.position.set(
          ox + Math.cos(orbitAngle) * r,
          oy - Math.sin(orbitAngle) * Math.sin(inc) * r,
          oz + Math.sin(orbitAngle) * Math.cos(inc) * r,
        )
      }

      spinAngle += props.config.rotationSpeed * dt
    }
  }

  // ── Apply rotation every frame (even when paused) so userDragQuat is always visible ──
  // Formula: Q = userDragQuat * Q_tilt(Z) * Q_spin(Y)
  // Order matters: spin must be applied BEFORE tilt so the planet rotates around
  // its own (tilted) pole. The reverse order tilts the pole first, then rotates
  // around world-Y — which makes the pole trace a cone and the planet tumble.
  const tilt = props.previewMode ? 0 : props.config.axialTilt
  _tiltQuat.setFromAxisAngle(_zAxis, tilt)
  _spinQuat.setFromAxisAngle(_yAxis, spinAngle)
  props.group.quaternion.copy(_tiltQuat).multiply(_spinQuat)
  if (props.userDragQuat) {
    props.group.quaternion.premultiply(props.userDragQuat)
  }
})
</script>

<template>
  <!-- Renderless: no DOM output -->
</template>
