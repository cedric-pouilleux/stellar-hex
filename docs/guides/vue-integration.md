# Vue Integration

The root entry (`@cedric-pouilleux/stellar-hex`) exposes Vue composables on
top of `/core`. It assumes `vue@^3.5` and `@tresjs/core@^5.8` are installed
in your project.

## Basic body composable

```ts
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody } from '@cedric-pouilleux/stellar-hex'

const { mesh, sim } = useBody({
  config: {
    name:        'Home',
    type:        'rocky',
    radius:      1,
    temperature: 288,
  },
  subdivisions: 6,
})
</script>

<template>
  <TresCanvas>
    <TresPerspectiveCamera :position="[0, 0, 3]" />
    <TresAmbientLight :intensity="0.4" />
    <primitive :object="mesh" />
  </TresCanvas>
</template>
```

`sim` gives you the full [`BodySimulation`](/api/) — biomes, resources,
sea level — so you can reactively drive UI overlays from the same source
of truth as the mesh.
