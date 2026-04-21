# Star with God-Rays — With Vue

Using `<Body>` for the star surface. God-rays require a post-processing pass
wired through TresJS's `<TresEffectComposer>` (from `@tresjs/post-processing`)
or a custom `useRenderLoop` pass.

```vue
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, godRaysFromStar } from '@cedric-pouilleux/stellar-hex'
import { useRenderLoop, useTresContext } from '@tresjs/core'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

const config: BodyConfig = {
  type:           'star',
  name:           'Sol',
  radius:         1,
  temperatureMin: 5000,
  temperatureMax: 5778,
  spectralType:   'G',
  rotationSpeed:  0.002,
  axialTilt:      0,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas :clear-color="'#000005'" style="height: 400px">
    <TresPerspectiveCamera :position="[0, 0, 4]" />
    <TresAmbientLight :intensity="0.05" />
    <!--
      Body mounts the animated star shader + the aura (AtmosphereShell).
      Wire god-rays via a post-processing pass in a child component that
      has access to useTresContext (renderer, scene, camera).
    -->
    <Body
      :body="body"
      :paused="false"
      :speed-multiplier="1"
      :preview-mode="true"
    />
  </TresCanvas>
</template>
```
