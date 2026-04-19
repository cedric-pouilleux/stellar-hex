<template>
  <primitive :object="body.group" />

  <BodyController
    :group="body.group"
    :config="body.config"
    :orbit="body.orbit"
    :parent-group="parentBody?.group ?? null"
    :speed-multiplier="speedMultiplier"
    :on-tick="body.tick"
    :preview-mode="previewMode"
    :paused="paused"
    :user-drag-quat="userDragQuat"
  />

  <AtmosphereShell
    v-if="showAtmosphere"
    :group="body.group"
    :radius="atmosphereRadius(body.config)"
    :lit-by-sun="body.config.type !== 'star'"
    v-bind="auraParamsFor(body.config)"
  />

  <CloudShell
    v-if="showClouds"
    :group="body.group"
    :radius="body.config.radius"
    :coverage="cloudCoverage!"
    :frozen="body.config.temperatureMax <= 0"
    :occluder-uniforms="occluderUniforms"
  />

  <BodyRings
    v-if="body.variation.rings"
    :group="body.group"
    :radius="body.config.radius"
    :rotation-speed="body.config.rotationSpeed"
    :variation="body.variation.rings"
    :paused="paused"
    :speed-multiplier="speedMultiplier"
  />

  <ShadowUpdater
    v-if="showShadow && parentBody?.shadowUniforms"
    :caster-group="body.group"
    :pos-uniform="parentBody.shadowUniforms.pos"
  />

  <OrbitTrail
    v-if="showTrail && body.orbit && parentBody"
    :orbit="body.orbit"
    :parent-group="parentBody.group"
  />
</template>

<script setup lang="ts">
/**
 * Scene-level wrapper that assembles a full celestial body from the
 * `features/body` building blocks. Takes only resolved bindings — it has no
 * awareness of scene-wide concepts like a top-down vs hexa mode, the focused
 * body, or system pause state. Those are the caller's responsibility.
 *
 * Body is also agnostic of any light source: the planet material reacts to
 * scene lights via standard THREE shading, and the custom shells (CloudShell /
 * BodyRings) auto-discover the dominant light in the scene at runtime. The
 * caller just has to ensure the scene contains a point / directional light.
 */
import { computed, watch } from 'vue'
import * as THREE from 'three'
import BodyController from './BodyController.vue'
import AtmosphereShell from './AtmosphereShell.vue'
import CloudShell from './CloudShell.vue'
import BodyRings from './BodyRings.vue'
import ShadowUpdater from './ShadowUpdater.vue'
import OrbitTrail from './OrbitTrail.vue'
import { atmosphereRadius, auraParamsFor, cloudCoverageFor, hasAtmosphere } from '../render/sceneBodyUtils'
import type { OccluderUniforms } from '../render/useHexasphereMesh'
import type { RenderableBody } from '../types/renderableBody'

const props = withDefaults(defineProps<{
  /** The body to render. */
  body:             RenderableBody
  /** Parent body — used for orbit anchoring, shadow casting and trail tracking. */
  parentBody?:      RenderableBody | null
  /** Occluder uniforms forwarded to CloudShell. Omit to disable cast shadows on clouds. */
  occluderUniforms?: OccluderUniforms
  /** Pauses self-spin / orbit advance in BodyController and BodyRings. */
  paused:           boolean
  /** Global sim speed multiplier. */
  speedMultiplier:  number
  /** Sets BodyController preview mode (disables auto-spin, enables user drag). */
  previewMode?:     boolean
  /** Accumulated user-drag quaternion (preview mode). */
  userDragQuat?:    THREE.Quaternion
  /** Fully resolved cloud visibility gate — combined with the body's intrinsic cloud coverage. */
  cloudsVisible?:   boolean
  /** Mount ShadowUpdater (pushes this body's position into its parent's shadow uniforms). */
  showShadow?:      boolean
  /** Mount OrbitTrail (decorative polyline around the parent). */
  showTrail?:       boolean
  /**
   * Controlled tile-hover state. Body forwards it to the underlying hex mesh
   * via `body.setHover`. External scene controllers must drive this prop from
   * their own raycast events — Body itself never mutates hover state.
   */
  hoveredTileId?:   number | null
  /**
   * Controlled pinned-tile state (click-to-pin marker). Same contract as
   * `hoveredTileId`: scene controllers decide, Body applies the visual.
   */
  pinnedTileId?:    number | null
  /**
   * Controlled body-level hover ring (used when another body is hovered
   * outside of the focused one). Forwarded to `body.setBodyHover`.
   */
  bodyHover?:       boolean
  /**
   * Activates tile-level interactive rendering (hex mesh + raycastable proxy).
   * Typically true for the focused body only. Body calls the matching
   * `activate` / `deactivate` methods on the underlying body when the flag
   * flips, so callers do not have to orchestrate the transition themselves.
   */
  interactive?:     boolean
}>(), {
  parentBody:      null,
  occluderUniforms: undefined,
  previewMode:     false,
  userDragQuat:    undefined,
  cloudsVisible:   true,
  showShadow:      false,
  showTrail:       false,
  hoveredTileId:   null,
  pinnedTileId:    null,
  bodyHover:       false,
  interactive:     false,
})

const showAtmosphere = computed(() => hasAtmosphere(props.body.config))

const cloudCoverage = computed(() => cloudCoverageFor(props.body.config))
const showClouds    = computed(() => props.cloudsVisible && cloudCoverage.value !== null)

// ── Controlled tile-state watchers ────────────────────────────────
// Body stays passive: every visual effect is driven by a reactive prop, never
// by an imperative call from outside. The watchers are the single point where
// prop changes hit the body's internal renderers.

watch(() => props.interactive, (active, prev) => {
  if (active === prev) return
  if (active) props.body.activateInteractive?.()
  else        props.body.deactivateInteractive?.()
}, { immediate: true })

watch(() => props.hoveredTileId, (id) => {
  props.body.setHover?.(id ?? null)
}, { immediate: true })

watch(() => props.pinnedTileId, (id) => {
  props.body.setPinnedTile?.(id ?? null)
}, { immediate: true })

watch(() => props.bodyHover, (visible) => {
  props.body.setBodyHover?.(!!visible)
}, { immediate: true })
</script>
