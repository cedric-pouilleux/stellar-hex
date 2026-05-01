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
 */
import { WebGLRenderer } from 'three'
import { useTresContext } from '@tresjs/core'
import type { Body, WarmupProgress } from '../render/types/bodyHandle.types'

const props = defineProps<{
  /** Body returned by `useBody()` — the warmup target. */
  body: Body
}>()

const emit = defineEmits<{
  /** Fired at every warmup phase boundary, ending with `phase: 'done'`. */
  progress: [info: WarmupProgress]
  /** Fired once when the warmup resolves successfully. */
  ready:    []
}>()

const { camera, renderer } = useTresContext()

// `onReady` fires once the WebGL renderer instance is built — earlier
// than `onMounted` would guarantee, since TresCanvas creates the
// renderer asynchronously after layout. Subscribing here avoids racing
// against `instance` being undefined at the first tick.
renderer.onReady((instance) => {
  if (!(instance instanceof WebGLRenderer)) {
    // The body warmup uses `WebGLRenderer.compileAsync` — alternate
    // renderers (WebGPU, custom) are not supported on this path yet.
    return
  }
  const cam = camera.activeCamera.value
  if (!cam) {
    throw new Error('<BodyWarmup> requires an active camera in the surrounding <TresCanvas>.')
  }
  void props.body.warmup(instance, cam, {
    onProgress: info => emit('progress', info),
  }).then(() => emit('ready'))
})
</script>

<template>
  <!-- Renderless: no DOM, no Three.js node. Acts purely on lifecycle. -->
</template>
