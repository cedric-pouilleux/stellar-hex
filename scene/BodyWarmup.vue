<script setup lang="ts">
/**
 * Renderless TresJS helper that pre-compiles a body's shaders before the
 * first render. Reads `renderer` and `camera` from the surrounding
 * `<TresCanvas>` context, calls `body.warmup(...)` as soon as both are
 * ready, and forwards every progress event back to the parent via
 * `@progress`.
 *
 * Mount this component **inside** `<TresCanvas>` (so the Tres context
 * resolves) and place the loader UI in regular HTML alongside the
 * canvas, gated on the parent's loading state driven by the emitted
 * progress.
 *
 * Multi-body scenes mount one `<BodyWarmup>` per body. The Tres context
 * is shared, so renderer / camera are resolved consistently across all
 * instances.
 *
 * Fail-open contract: `ready` is **always** emitted eventually — when the
 * compile succeeds, when it rejects, and when the renderer is not a
 * `WebGLRenderer` (alternate back-ends compile lazily on first frame).
 * Loader UIs should never outlive a scene that already renders.
 */
import { watch, type WatchStopHandle } from 'vue'
import { Camera, WebGLRenderer } from 'three'
import { useTresContext } from '@tresjs/core'
import type { Body, WarmupProgress } from '../render/types/bodyHandle.types'

const props = defineProps<{
  /** Body returned by `useBody()` — the warmup target. */
  body: Body
}>()

const emit = defineEmits<{
  /** Fired at every warmup phase boundary, ending with `phase: 'done'`. */
  progress: [info: WarmupProgress]
  /** Fired once when the warmup resolves — successfully OR after a failure. */
  ready:    []
}>()

const { camera, renderer } = useTresContext()

let started = false
let stopWatch: WatchStopHandle | null = null

/**
 * Launches the warmup once renderer and camera are both available.
 * Idempotent — extra invocations from the watcher and `onReady` paths are
 * dropped via `started`.
 */
function start(instance: unknown, cam: Camera | null | undefined): void {
  if (started) return
  if (!instance || !cam) return
  started = true
  stopWatch?.()
  if (!(instance instanceof WebGLRenderer)) {
    // Alternate back-ends (WebGPU, custom) compile lazily — nothing to
    // pre-warm. Releasing the loader keeps the UI honest.
    emit('ready')
    return
  }
  void props.body
    .warmup(instance, cam, { onProgress: info => emit('progress', info) })
    .then(() => emit('ready'))
    .catch(err => {
      // Warmup is an optimisation, not a correctness requirement — the
      // body still renders lazily on first frame. Log the cause and
      // release the loader rather than stranding it forever.
      console.error('[BodyWarmup] warmup failed:', err)
      emit('ready')
    })
}

// Primary path: TresJS surfaces the WebGL instance through `onReady` once
// the renderer is built. This may fire before `<BodyWarmup>` mounts on
// fast paths, which is why we also watch `isInitialized` below.
renderer.onReady((instance) => {
  start(instance, camera.activeCamera.value)
})

// Defensive secondary path: if the renderer was already initialised when
// this component mounted (so `onReady` will not re-fire) or if the
// camera resolves on a later tick, watching the reactive flags catches
// the boundary. `started` guards against double execution.
stopWatch = watch(
  [() => renderer.isInitialized.value, () => camera.activeCamera.value] as const,
  ([ready, cam]) => {
    if (ready) start(renderer.instance, cam)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Renderless: no DOM, no Three.js node. Acts purely on lifecycle. -->
</template>
