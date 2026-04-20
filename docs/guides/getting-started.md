# Getting Started

`@cedric-pouilleux/stellar-hex` is a procedural celestial body generator. It
ships three entry points so you can import only what you need:

| Entry point | What's in it                                         | Use case                      |
| ----------- | ---------------------------------------------------- | ----------------------------- |
| `/sim`      | Pure TS — geometry, physics, sim, biomes, resources  | Backend / worker / CLI        |
| `/core`     | Everything above + Three.js shaders, materials, mesh | Any non-Vue Three.js consumer |
| `/`         | Everything above + Vue + TresJS integration          | Vue 3 / TresJS apps           |

## Installation

```bash
npm install @cedric-pouilleux/stellar-hex three simplex-noise
# optional (for the Vue surface)
npm install vue @tresjs/core
```

## 30-second tour

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const tiles = generateHexasphere(6)      // hex mesh subdivisions
const sim   = initBodySimulation(tiles, {
  name: 'Kepler-186f',
  type: 'rocky',
  radius: 1,
  temperature: 275,
  // …full BodyConfig
})

// sim.tileStates, sim.biomeMap, sim.resourceMap…
```

Head to the [Three.js Basics](/guides/threejs-basics) guide to wire the
simulation into a scene, or browse the [API reference](/api/) for every
exported symbol.
