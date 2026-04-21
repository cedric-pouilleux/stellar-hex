<script setup>
import HexPlanetDemo    from '../../.vitepress/theme/demos/HexPlanetDemo.vue'
import HexPlanetDemoRaw from '../../.vitepress/theme/demos/HexPlanetDemo.vue?raw'
import HexPlanetVueRaw  from '../../.vitepress/theme/demos/HexPlanetVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: HexPlanetDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: HexPlanetVueRaw,  lang: 'vue' },
]
</script>

# Interactive Tiles — Hex viewer

Hover individual hex tiles to inspect biome and elevation data.
Drag to orbit, scroll to zoom.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <HexPlanetDemo />
  </DemoBlock>
</ClientOnly>

## How it works

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
body.activateInteractive?.()   // swap smooth mesh → hex tile mesh
scene.add(body.group)

// per frame:
raycaster.setFromCamera(pointer, camera)
const tileId = body.queryHover?.(raycaster) ?? null
body.setHover?.(tileId)

const state = body.sim.tileStates.get(tileId)
const h     = resolveTileHeight(config, body.sim.seaLevelElevation, state.elevation)
```
