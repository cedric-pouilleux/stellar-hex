<template>
  <primitive :object="body.group" />

  <BodyController
    :group="body.group"
    :config="body.config"
    :pose="pose"
    :preview-mode="previewMode"
    :drag-quat="dragQuat"
  />

  <BodyRings
    v-if="body.variation.rings"
    :group="body.group"
    :radius="body.config.radius"
    :rotation-speed="body.config.rotationSpeed"
    :variation="body.variation.rings"
    :sun-world-pos="sunWorldPos ?? undefined"
  />

  <ShadowUpdater
    v-if="showShadow && parentBody?.shadowUniforms"
    :caster-group="body.group"
    :pos-uniform="parentBody.shadowUniforms.pos"
  />
</template>

<script setup lang="ts">
/**
 * Scene-level wrapper that assembles a full celestial body from the
 * `features/body` building blocks. Takes only resolved bindings — it has no
 * awareness of scene-wide concepts like a top-down vs hexa mode, the focused
 * body, or system pause state. Those are the caller's responsibility.
 *
 * **World position** is a caller concern: pass `pose.position` per frame
 * (server snapshot, orbital sim, scripted path) or omit `pose` and set the
 * body's `group.position` yourself outside this component. Rotation is
 * always cosmetic and driven by the body's auto-spin accumulator — see
 * `BodyController.vue` for the rationale. Orbital mechanics are out of
 * scope — game-side concept, not a body property.
 */
import { watch } from 'vue'
import * as THREE from 'three'
import BodyController from './BodyController.vue'
import BodyRings from './BodyRings.vue'
import ShadowUpdater from './ShadowUpdater.vue'
import type { RenderableBody } from '../types/renderableBody'

const props = withDefaults(defineProps<{
  /** The body to render. */
  body:             RenderableBody
  /**
   * Parent body — used for shadow casting only. The lib does not own
   * orbital placement: world position comes from the caller (typically
   * via `pose`).
   */
  parentBody?:      RenderableBody | null
  /**
   * Caller-driven world position, copied onto the body's group each frame.
   * Pass `null` (or omit) to leave the group position untouched. Only
   * `position` is consumed — rotation is intentionally cosmetic and
   * advanced by the body's local auto-spin accumulator.
   */
  pose?:            { position?: THREE.Vector3 } | null
  /** Sets BodyController preview mode (zeroes axial tilt, body sits upright). */
  previewMode?:     boolean
  /** Drag quaternion premultiplied onto the resolved orientation each frame. */
  dragQuat?:        THREE.Quaternion | null
  /** Mount ShadowUpdater (pushes this body's position into its parent's shadow uniforms). */
  showShadow?:      boolean
  /**
   * Controlled tile-hover state. Body forwards it to the underlying hex mesh
   * via `body.hover.setTile`. External scene controllers must drive this prop
   * from their own raycast events — Body itself never mutates hover state.
   */
  hoveredTileId?:   number | null
  /**
   * Controlled body-level hover ring (used when another body is hovered
   * outside of the focused one). Forwarded to `body.hover.setBodyHover`.
   */
  bodyHover?:       boolean
  /**
   * Activates tile-level interactive rendering (hex mesh + raycastable proxy).
   * Typically true for the focused body only. Body calls the matching
   * `activate` / `deactivate` methods on the underlying body when the flag
   * flips, so callers do not have to orchestrate the transition themselves.
   */
  interactive?:     boolean
  /**
   * Optional caller-driven sun world-space position, forwarded to the
   * mounted `<BodyRings>` (when the body has rings). When omitted, the
   * ring wrapper falls back to its own per-frame
   * `findDominantLightWorldPos` traversal — fine for simple scenes with
   * a single light. Multi-star scenes pass the resolved sun ref here.
   */
  sunWorldPos?:     THREE.Vector3 | null
}>(), {
  parentBody:      null,
  pose:            null,
  previewMode:     false,
  dragQuat:        null,
  showShadow:      false,
  hoveredTileId:   null,
  bodyHover:       false,
  interactive:     false,
  sunWorldPos:     null,
})

// ── Controlled tile-state watchers ────────────────────────────────
// Body stays passive: every visual effect is driven by a reactive prop, never
// by an imperative call from outside. The watchers are the single point where
// prop changes hit the body's internal renderers.

watch(() => props.interactive, (active, prev) => {
  if (active === prev) return
  if (active) props.body.interactive?.activate()
  else        props.body.interactive?.deactivate()
}, { immediate: true })

watch(() => props.hoveredTileId, (id) => {
  props.body.hover?.setTile(id ?? null)
}, { immediate: true })

watch(() => props.bodyHover, (visible) => {
  props.body.hover?.setBodyHover(!!visible)
}, { immediate: true })
</script>
