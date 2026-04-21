# Star with God-Rays — Native Three.js

Star body built with `useBody` and a post-processing god-rays pass via
`godRaysFromStar`.

```ts
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass }     from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {
  useBody,
  DEFAULT_TILE_SIZE,
  GodRaysShader,
  godRaysFromStar,
} from '@cedric-pouilleux/stellar-hex/core'

const scene    = new THREE.Scene()
const camera   = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true })
camera.position.set(0, 0, 4)

const body = useBody(
  {
    type:           'star',
    name:           'Sol',
    radius:         1,
    temperatureMin: 5000,
    temperatureMax: 5778,
    spectralType:   'G',
    rotationSpeed:  0.002,
    axialTilt:      0,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)

// Post-processing — god-rays from the star's screen-space position
const composer  = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const godRays   = godRaysFromStar(body.group, camera, renderer)
composer.addPass(godRays.pass)

// in animation loop:
body.tick(dt)
godRays.update() // syncs star screen-space position
composer.render()
```

Numeric ranges for every star uniform (`temperature`, `convectionScale`,
`coronaSize`, …) live in `SHADER_RANGES.star` — useful for building debug sliders.
