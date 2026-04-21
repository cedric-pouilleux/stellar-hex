<script setup>
import HexPlanetDemo from '../.vitepress/theme/demos/HexPlanetDemo.vue'
import HexPlanetDemoRaw from '../.vitepress/theme/demos/HexPlanetDemo.vue?raw'

const tabs = [
  { label: 'Three.js', code: HexPlanetDemoRaw, lang: 'vue' },
]
</script>

# Interactive Tiles

Hover individual hex tiles to inspect biome and elevation data.
Drag to orbit, scroll to zoom.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <HexPlanetDemo />
  </DemoBlock>
</ClientOnly>

## How it works

Call `activateInteractive()` on the body to swap the smooth display mesh for
the full hex tile mesh, then drive `queryHover` / `setHover` from a raycaster
each frame.

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE, resolveTileHeight } from '@cedric-pouilleux/stellar-hex/core'

const body = useBody(config, DEFAULT_TILE_SIZE)
body.activateInteractive?.()
scene.add(body.group)

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()

// in animation loop:
raycaster.setFromCamera(pointer, camera)
const tileId = body.queryHover?.(raycaster) ?? null
body.setHover?.(tileId)

// read tile state from the simulation:
const sim   = body.sim
const state = sim.tileStates.get(tileId)
const h     = resolveTileHeight(config, sim.seaLevelElevation, state.elevation)
```

Calling `deactivateInteractive()` swaps back to the smooth display mesh.
