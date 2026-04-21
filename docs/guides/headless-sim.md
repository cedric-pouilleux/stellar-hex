# Headless Simulation

When you only need the deterministic data layer — biomes, surface liquid,
resource maps — import from `/sim`. No Three.js, no WebGL, no DOM.

```ts
import {
  generateHexasphere,
  initBodySimulation,
  registerResourceDistributor,
} from '@cedric-pouilleux/stellar-hex/sim'

// Optional: plug in a custom resource distributor before sim init
// registerResourceDistributor(({ tiles, biomeMap, config }) => …)

const tiles = generateHexasphere(5)
const sim   = initBodySimulation(tiles, {
  name:        'Worker-Body-42',
  type:        'rocky',
  radius:      1,
  temperature: 260,
})

// Everything below is serialisable: ship it to the client.
console.log(sim.biomeMap.size)
console.log(sim.liquidCoverage)
console.log(sim.surfaceLiquid)
```

## Why headless?

- **Server-side pre-computation.** Generate once, cache, ship the state.
- **Workers.** Offload sim off the main thread without bundling Three.js.
- **CLI / tooling.** Dump biomes to CSV, validate seeds, etc.

The frontend rebuilds geometry and materials from the **same seed**, so
nothing extra has to cross the wire.
