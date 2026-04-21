<script setup>
import HexPlanetDemo from '../../.vitepress/theme/demos/HexPlanetDemo.vue'
import HexPlanetDemoRaw from '../../.vitepress/theme/demos/HexPlanetDemo.vue?raw'

const tabs = [{ label: 'Three.js', code: HexPlanetDemoRaw, lang: 'vue' }]
</script>

# Interactive Tiles — Native Three.js

Hover individual hex tiles to inspect biome and elevation data.
Drag to orbit, scroll to zoom.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <HexPlanetDemo />
  </DemoBlock>
</ClientOnly>

## How it works

`activateInteractive()` swaps the smooth display mesh for the full hex tile
mesh. `queryHover` + `setHover` are then driven each frame from a raycaster.

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
body.activateInteractive?.()
scene.add(body.group)

// in animation loop:
raycaster.setFromCamera(pointer, camera)
const tileId = body.queryHover?.(raycaster) ?? null
body.setHover?.(tileId)

// read tile data:
const state = body.sim.tileStates.get(tileId)
const h     = resolveTileHeight(config, body.sim.seaLevelElevation, state.elevation)
```

Call `deactivateInteractive()` to swap back to the smooth mesh.
