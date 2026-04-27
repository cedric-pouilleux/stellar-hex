# @cedric-pouilleux/stellar-hex

[npm](https://www.npmjs.com/package/@cedric-pouilleux/stellar-hex) · [GitHub](https://github.com/cedric-pouilleux/stellar-hex) · [Issues](https://github.com/cedric-pouilleux/stellar-hex/issues)

Procedural celestial body — geometry, physics, simulation and rendering for Three.js and Vue 3.

Generates rocky planets, gas giants, metallic worlds and stars on a hexasphere, with deterministic noise-based terrain, surface-liquid shells, atmosphere, clouds, rings and a Three.js render pipeline. All generation is seedable so client and server produce identical worlds from the same inputs.

## Install

```sh
npm install @cedric-pouilleux/stellar-hex three simplex-noise
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
import { initBodySimulation, generateHexasphere } from '@cedric-pouilleux/stellar-hex/sim'
import { useBody, BodyMaterial }                  from '@cedric-pouilleux/stellar-hex/core'
import { Body, CloudShell }                       from '@cedric-pouilleux/stellar-hex'
```

- **`@cedric-pouilleux/stellar-hex/sim`** — pure data & physics layer. No Three.js or Vue dependency, runtime or types; runs in workers, Node or any environment that can execute ES modules. Use for servers, CLIs, or deterministic tests.
- **`@cedric-pouilleux/stellar-hex/core`** — adds the Three.js render layer (shaders, meshes, materials, raycasting). No Vue dependency — drop into a vanilla Three.js scene.
- **`@cedric-pouilleux/stellar-hex`** — full Vue/TresJS component surface (`<Body>`, `<CloudShell>`, `<OrbitTrail>`, …).

## Quick start (headless)

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(3, 8) // radius, subdivisions
const sim = initBodySimulation(tiles, {
  type:           'rocky',
  name:           'kepler-22b',
  radius:         3,
  rotationSpeed:  0.005,
  axialTilt:      0.41,
  atmosphereThickness: 0.6,
})

for (const [tileId, state] of sim.tileStates) {
  console.log(tileId, state.elevation)
}
```

## Quick start (Three.js)

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellar-hex/core'

const body = useBody(
  {
    type: 'rocky', name: 'earth', radius: 3,
    rotationSpeed: 0.01, axialTilt: 0.41,
    atmosphereThickness: 0.7,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)
// in animation loop:
body.tick(delta)
```

## Resources live off-lib

The lib carries no resource vocabulary whatsoever. It returns a "raw"
planet — geometry, per-tile elevation, sea level, palette — and exposes
paint hooks so consumers can project their own game semantics on top:

```ts
const body = useBody(config, tileSize)

// Caller owns the distribution strategy, the catalogue and the paint.
const distribution = myGenerateDistribution(body.sim)
myPaintBody(body, distribution)       // calls body.tiles.applyTileOverlay
                                      // + body.tiles.paintSmoothSphere
```

Relevant `body.tiles` primitives:

- `tileBaseVisual(tileId)` — pre-blend palette snapshot (colour + PBR +
  submerged flag). Lets consumers run their own resource-aware blend off-lib.
- `applyTileOverlay(layer, Map<tileId, RGB>)` — stamps per-tile RGB into
  the interactive layered mesh (live mutation-friendly).
- `paintSmoothSphere(Map<tileId, RGB>)` — one-shot paint of the distant
  view (frozen at generation).
- `updateTileSolHeight(Map<tileId, height>)` — per-tile elevation mutation.

The playground ships a reference implementation (catalogue, cluster-based
distribution, paint pipeline) under
[`playground/src/lib/paint/`](playground/src/lib/paint/) — a useful
template for game integrations.

## Body structure (core / atmosphere split)

The ratio between the solid core and the gas envelope is driven by the
physics, not by an ad-hoc visual knob. Pass `gasMassFraction ∈ [0, 1]`
(the fraction of the body's total mass carried by gas) and the lib
derives the core radius from the solid + gas density references:

| `gasMassFraction` | Resolved body               | `coreRadiusRatio` |
| ----------------- | --------------------------- | ----------------- |
| `0`               | Fully solid world           | `1.0`             |
| `~0.05`           | Earth-like                  | `~0.97`           |
| `~0.3`            | Sub-Neptune                 | `~0.70`           |
| `~0.7`            | Neptune / Uranus            | `~0.25`           |
| `~0.93`           | Jupiter                     | `~0.20`           |
| `1`               | Pure gas (no core, no sol)  | `0.0`             |

Resolution order when building a body:

1. explicit `coreRadiusRatio` on the config — user opt-in override
2. derivation from `gasMassFraction`
3. `DEFAULT_CORE_RADIUS_RATIO` (0.55) — used when both knobs are omitted

Pure-gas bodies (`gasMassFraction: 1` or `coreRadiusRatio: 0`) are a
first-class case: `buildCoreMesh` skips the sphere allocation, the sol
band collapses (no relief), and the atmo shell occupies the whole
visible sphere.

### Surface liquid — rocky only

`liquidType` and `liquidState` are only honoured on `type: 'rocky'`.
Gaseous / metallic / star bodies are always dry regardless of what the
config carries — the sim sets `surfaceLiquid = undefined` and the render
layer skips the liquid sphere, the sea anchor and the shore basement.
The single enforcement point is `hasSurfaceLiquid(config)`, exported
from `/sim` for consumers that need to read the same invariant.

## Determinism

Every generation step is seeded from `BodyConfig.name` — no raw `Math.random()`. Two clients with the same config produce identical tiles, elevations, resource maps and visual variation.

## Public API stability

The public surface of each entry point (`/sim`, `/core`, default) is
snapshotted in [api/reports/](api/reports/) via
[`@microsoft/api-extractor`](https://api-extractor.com). Any change to
the exported types or signatures shows up as a diff on the corresponding
`*.api.md` file.

- `npm run api:check` — fails when `dist/*.d.ts` drifts from the
  committed snapshots (run in CI).
- `npm run api:update` — regenerates the snapshots; commit the diff
  alongside the intentional change.

## License

This project is licensed under the StellarHex Non-Commercial License (HC-NCL).
See LICENSE for details.
