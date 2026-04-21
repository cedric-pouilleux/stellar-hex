# Interactive Tiles — With Vue

In Vue, pass `:interactive="true"` to `<Body>` to activate the hex mesh.
Drive the hover state through the controlled `hoveredTileId` prop — raycasting
must run inside a child component placed within `<TresCanvas>` so it can access
the camera via `useTresContext`.

```vue
<!-- HexViewer.vue — the outer component -->
<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import HexRaycaster from './HexRaycaster.vue'

const config: BodyConfig = {
  type: 'rocky', name: 'hex-demo', radius: 1,
  temperatureMin: -20, temperatureMax: 35,
  liquidCoverage: 0.6, rotationSpeed: 0, axialTilt: 0,
  atmosphereThickness: 0.7,
}

const body          = useBody(config, DEFAULT_TILE_SIZE)
const hoveredTileId = ref<number | null>(null)
</script>

<template>
  <TresCanvas :clear-color="'#08080f'" style="height: 400px">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight :position="[6, 4, 5]" :intensity="2.5" />

    <Body
      :body="body"
      :paused="false"
      :speed-multiplier="1"
      :interactive="true"
      :hovered-tile-id="hoveredTileId"
    />

    <!-- Raycaster runs inside TresCanvas to access useTresContext() -->
    <HexRaycaster :body="body" @hover="hoveredTileId = $event" />
  </TresCanvas>
</template>
```

```vue
<!-- HexRaycaster.vue — inner component, must live inside <TresCanvas> -->
<script setup lang="ts">
import { useRenderLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three'
import type { RenderableBody } from '@cedric-pouilleux/stellar-hex'

const props  = defineProps<{ body: RenderableBody }>()
const emit   = defineEmits<{ hover: [id: number | null] }>()
const { camera, renderer } = useTresContext()

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()
let   lastId: number | null = null

renderer.value?.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  const r = renderer.value!.domElement.getBoundingClientRect()
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
})

const { onBeforeRender } = useRenderLoop()
onBeforeRender(() => {
  if (!camera.value) return
  raycaster.setFromCamera(pointer, camera.value as THREE.Camera)
  const id = props.body.queryHover?.(raycaster) ?? null
  if (id !== lastId) { lastId = id; emit('hover', id) }
})
</script>

<template><slot /></template>
```
