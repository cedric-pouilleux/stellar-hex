<script setup lang="ts">
/**
 * Drives a body's visual rotation each frame, and optionally applies a
 * caller-supplied world position.
 *
 * Rotation is **always cosmetic** in this lib — `rotationSpeed` × `axialTilt`
 * feeds a local accumulator and is not part of any server-authoritative
 * state. Game logic does not observe a body's spin, so there is no "driven
 * orientation" mode here on purpose: pushing a server-side quaternion would
 * be a footgun (network jitter, no interpolation strategy in the lib).
 *
 * Position is the only field the caller may push: the lib has no opinion
 * on **where** a body sits in the world (orbital simulation, scripted
 * path, server snapshot). Pass `pose.position` to place the body, or omit
 * `pose` entirely and set `group.position` yourself outside the
 * component — both work.
 *
 * `dragQuat` is premultiplied on top of the auto-spin so hand-orbit
 * gestures remain visible.
 */
import { onMounted, watch } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import type { BodyConfig } from '../types/body.types'
import { createBodyMotion, type BodyMotionHandle } from '../render/body/bodyMotion'

const props = defineProps<{
  group:        THREE.Group
  config:       BodyConfig
  /**
   * Caller-driven world position. When set, the component copies it onto
   * the group every frame; rotation continues to advance from the local
   * auto-spin accumulator regardless. Omit (or pass `null`) to leave the
   * group's position untouched.
   *
   * Note: only `position` is consumed. The orientation is intentionally
   * not driveable — see the component-level doc above.
   */
  pose?:        { position?: THREE.Vector3 } | null
  /**
   * Optional drag quaternion premultiplied onto the auto-spin orientation
   * each frame. Used by hand-orbit gestures so the planet rotates under
   * the user's cursor without disturbing the auto-spin axis.
   */
  dragQuat?:    THREE.Quaternion | null
  /** When true, axial tilt is zeroed (preview pane — body sits upright). */
  previewMode?: boolean
}>()

const { onBeforeRender } = useLoop()

// ── Local accumulator ─────────────────────────────────────────────
// Built once per BodyController mount. Re-instanced when the underlying
// physics changes (config swap, preview toggle) so spin rates stay accurate.
let motion: BodyMotionHandle | null = null

function buildMotion(): BodyMotionHandle {
  return createBodyMotion({
    rotationSpeed: props.config.rotationSpeed,
    axialTilt:     props.previewMode ? 0 : props.config.axialTilt,
  })
}

onMounted(() => { motion = buildMotion() })

watch(
  () => [props.config.rotationSpeed, props.config.axialTilt, props.previewMode] as const,
  () => { motion = buildMotion() },
)

onBeforeRender(({ delta }) => {
  if (motion) {
    motion.tick(delta)
    motion.applyTo(props.group)
  }

  if (props.pose?.position) {
    props.group.position.copy(props.pose.position)
  }

  // Drag quaternion premultiplied so user gestures rotate in world space,
  // leaving the auto-spin axis untouched.
  if (props.dragQuat) {
    props.group.quaternion.premultiply(props.dragQuat)
  }
})
</script>

<template>
  <!-- Renderless: no DOM output -->
</template>
