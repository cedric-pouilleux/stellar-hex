# @cedric-pouilleux/stellar-hex

Procedural celestial body — geometry, physics, simulation and rendering for Three.js and Vue 3.

Generates rocky planets, gas giants, metallic worlds and stars on a hexasphere, with deterministic noise-based terrain, biome classification, physics-driven water/liquid state, and a Three.js render pipeline. All generation is seedable so client and server produce identical worlds from the same inputs.

## Install

```sh
npm install @hexasphere/body three simplex-noise
# Optional (only for the Vue / TresJS surface):
npm install vue @tresjs/core
```

Peer dependencies:

| Package         | Required by            |
| --------------- | ---------------------- |
| `simplex-noise` | `sim`, `core`, default |
| `three`         | `core`, default        |
| `vue`           | default (index)        |
| `@tresjs/core`  | default (index)        |

## Entry points

The package exposes three entry points of increasing scope:

```ts
import { initBodySimulation, generateHexasphere } from '@hexasphere/body/sim'
import { useBody, BodyMaterial }                  from '@hexasphere/body/core'
import { Body, AtmosphereShell }                  from '@hexasphere/body'
```

- **`@hexasphere/body/sim`** — pure data & physics layer. No Three.js or Vue at runtime; runs in workers, Node or any environment that can execute ES modules. Use for servers, CLIs, or deterministic tests. *TypeScript note:* a few exported types (notably `TerrainLevel`) reference `THREE.Color`, so TypeScript consumers still need `three` installed as a dev-dependency for type-checking.
- **`@hexasphere/body/core`** — adds the Three.js render layer (shaders, meshes, materials, raycasting). No Vue dependency — drop into a vanilla Three.js scene.
- **`@hexasphere/body`** — full Vue/TresJS component surface (`<Body>`, `<AtmosphereShell>`, `<OrbitTrail>`, …).

## Quick start (headless)

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@hexasphere/body/sim'

const { tiles } = generateHexasphere(3, 8) // radius, subdivisions
const sim = initBodySimulation(tiles, {
  type:           'rocky',
  name:           'kepler-22b',
  radius:         3,
  temperatureMin: -10,
  temperatureMax: 25,
  rotationSpeed:  0.005,
  axialTilt:      0.41,
  atmosphereThickness: 0.6,
})

for (const [tileId, state] of sim.tileStates) {
  console.log(tileId, state.biome, state.elevation)
}
```

## Quick start (Three.js)

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE } from '@hexasphere/body/core'

const body = useBody(
  {
    type: 'rocky', name: 'earth', radius: 3,
    temperatureMin: -20, temperatureMax: 35,
    rotationSpeed: 0.01, axialTilt: 0.41,
    atmosphereThickness: 0.7,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)
// in animation loop:
body.tick(delta)
```

## Resources feature

Body treats resource IDs as opaque strings. To attach a resource catalog
(compatibility, colors, metal/liquid classification), register a
`ResourceDistributor` and a `BodyResourceBridge` at startup:

```ts
import {
  registerResourceDistributor,
  registerBodyResourceBridge,
} from '@hexasphere/body/sim'

registerResourceDistributor(/* your distributor */)
registerBodyResourceBridge({
  getCompatibleResourceColors: /* ... */,
  isMetallic: /* ... */,
  isSurfaceLiquidResource: /* ... */,
  getResourceDisplay: /* ... */,
  getBiomeLabel: /* ... */,
})
```

Without these hooks, body still works — tiles simply carry no resource
concentrations and palettes fall back to neutral defaults.

## Determinism

Every generation step is seeded from `BodyConfig.name` — no raw `Math.random()`. Two clients with the same config produce identical tiles, biomes, resource maps and visual variation.

## License

This project is licensed under the StellarHex Non-Commercial License (HC-NCL).
See LICENSE for details.
