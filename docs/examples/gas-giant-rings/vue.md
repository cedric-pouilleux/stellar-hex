# Gas Giant with Rings — With Vue

Using the `<Body>` component: rings are mounted automatically when
`body.variation.rings` is set — `useBody` generates ring variation from the
seed, so no manual `buildBodyRings` call is needed.

```vue
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

const config: BodyConfig = {
  type:           'gaseous',
  name:           'Jovian',
  radius:         2,
  temperatureMin: 90,
  temperatureMax: 130,
  rotationSpeed:  0.003,
  axialTilt:      0.05,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas :clear-color="'#08080f'" style="height: 400px">
    <TresPerspectiveCamera :position="[0, 2, 8]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2" />
    <!-- <Body> mounts <BodyRings> automatically when body.variation.rings is set -->
    <Body
      :body="body"
      :paused="false"
      :speed-multiplier="1"
      :preview-mode="true"
    />
  </TresCanvas>
</template>
```
