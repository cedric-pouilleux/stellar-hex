<script setup lang="ts">
/**
 * Drives a body's orientation (and optionally its position) every frame.
 *
 * The lib has no opinion on **where** the body sits in the world — that's
 * a caller concern (server snapshot, orbital simulation, scripted path).
 * This component only cares about the body's orientation, which it
 * computes from `config.rotationSpeed` × `config.axialTilt` when no
 * authoritative pose is provided.
 *
 * Two operating modes, decided per render:
 *
 *   - **Driven**: `pose` prop is non-null. The component applies the
 *     caller's quaternion / position verbatim — no internal accumulator
 *     runs. Used by server-authoritative scenes.
 *
 *   - **Auto**: `pose` is omitted/`null`. A local {@link createBodyMotion}
 *     accumulator advances `spinAngle` from the render-loop `delta` and
 *     writes the resulting quaternion onto the group. The group's
 *     `position` is left untouched — the caller is responsible for placing
 *     the body in the scene.
 *
 * Both modes optionally premultiply a `dragQuat` so user-orbit gestures
 * remain visible regardless of the active mode. Time scrubbing (pause,
 * speed multiplier) is expressed by the caller either freezing its own
 * clock (auto mode) or pinning the pose to the last received snapshot
 * (driven mode).
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
   * Caller-driven pose. When set, the component bypasses its internal
   * accumulator and applies these values directly.
   *
   * Pass either field independently — `quaternion` alone keeps the
   * group position untouched; `position` alone keeps the orientation
   * untouched. Setting `pose` to `null`/`undefined` re-enables the
   * auto-anime mode (orientation only).
   */
  pose?:        { quaternion?: THREE.Quaternion, position?: THREE.Vector3 } | null
  /**
   * Optional drag quaternion premultiplied onto the resolved orientation
   * each frame. Used by hand-orbit gestures so the planet rotates under
   * the user's cursor without disturbing the auto-spin axis or the
   * authoritative pose.
   */
  dragQuat?:    THREE.Quaternion | null
  /** When true, axial tilt is zeroed (preview pane — body sits upright). */
  previewMode?: boolean
}>()

const { onBeforeRender } = useLoop()

// ── Local accumulator (auto mode) ─────────────────────────────────
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
  // Driven mode — caller owns the pose. We just apply.
  if (props.pose) {
    if (props.pose.quaternion) props.group.quaternion.copy(props.pose.quaternion)
    if (props.pose.position)   props.group.position.copy(props.pose.position)
  } else {
    // Auto mode — local accumulator advances + writes the quaternion.
    // Position is intentionally left alone: caller decides where the
    // body lives in world space.
    if (!motion) return
    motion.tick(delta)
    motion.applyTo(props.group)
  }

  // Drag quaternion is applied on top of either path so user gestures
  // remain visible whether the pose comes from the caller or the local
  // accumulator. Premultiply so the drag rotates in world space, leaving
  // the underlying orientation axis untouched.
  if (props.dragQuat) {
    props.group.quaternion.premultiply(props.dragQuat)
  }
})
</script>

<template>
  <!-- Renderless: no DOM output -->
</template>
