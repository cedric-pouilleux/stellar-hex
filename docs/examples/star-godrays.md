# Star with God-Rays

Combines a star `BodyMaterial` with the post-processing god-rays shader.

```ts
import * as THREE from 'three'
import {
  BodyMaterial,
  GodRaysShader,
  kelvinToThreeColor,
} from '@cedric-pouilleux/stellar-hex/core'

const star = new BodyMaterial('star', {
  temperature: 5778, // Sun
})

const geom = new THREE.SphereGeometry(1, 64, 64)
const mesh = new THREE.Mesh(geom, star.material)

// Post-processing: plug `GodRaysShader` into your EffectComposer pipeline
// and point it at the star mesh's screen-space position.
// (See GodRaysShader uniforms: density, weight, decay, exposure…)
```

The numeric ranges for every star uniform (`temperature`, `convectionScale`,
`coronaSize`, etc.) live in `SHADER_RANGES.star` — useful for building
debug sliders.
