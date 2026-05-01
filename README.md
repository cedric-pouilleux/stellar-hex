# @cedric-pouilleux/stellexjs

[Docs](https://cedric-pouilleux.github.io/stellex-js/) · [Playground](https://cedric-pouilleux.github.io/stellex-js/playground/) · [API](https://cedric-pouilleux.github.io/stellex-js/api/) · [npm](https://www.npmjs.com/package/@cedric-pouilleux/stellexjs) · [GitHub](https://github.com/cedric-pouilleux/stellex-js) · [Issues](https://github.com/cedric-pouilleux/stellex-js/issues)

Procedural celestial body — geometry, physics, simulation and rendering for Three.js and Vue 3.

Generates rocky planets, gas giants, metallic worlds and stars on a hexasphere, with deterministic noise-based terrain, surface-liquid shells, atmosphere, clouds, rings and a Three.js render pipeline. All generation is seedable so client and server produce identical worlds from the same inputs.

## Install

```sh
npm install @cedric-pouilleux/stellexjs three simplex-noise
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
import { initBodySimulation, generateHexasphere } from '@cedric-pouilleux/stellexjs/sim'
import { useBody, BodyMaterial }                  from '@cedric-pouilleux/stellexjs/core'
import { Body, BodyRings, ShadowUpdater }         from '@cedric-pouilleux/stellexjs'
```

- **`@cedric-pouilleux/stellexjs/sim`** — pure data & physics layer. No Three.js or Vue dependency, runtime or types; runs in workers, Node or any environment that can execute ES modules. Use for servers, CLIs, or deterministic tests.
- **`@cedric-pouilleux/stellexjs/core`** — adds the Three.js render layer (shaders, meshes, materials, raycasting). No Vue dependency — drop into a vanilla Three.js scene.
- **`@cedric-pouilleux/stellexjs`** — full Vue/TresJS component surface (`<Body>`, `<BodyController>`, `<BodyRings>`, `<BodyWarmup>`, `<ShadowUpdater>`, `<TileCenterProjector>`).

## Quick start (headless)

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellexjs/sim'

const { tiles } = generateHexasphere(3, 8) // radius, subdivisions
const sim = initBodySimulation(tiles, {
  type:                'planetary',
  surfaceLook:         'terrain',
  name:                'kepler-22b',
  radius:              3,
  rotationSpeed:       0.005,
  axialTilt:           0.41,
  atmosphereThickness: 0.6,
})

for (const [tileId, state] of sim.tileStates) {
  console.log(tileId, state.elevation)
}
```

## Quick start (Three.js)

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellexjs/core'

const body = useBody(
  {
    type: 'planetary', surfaceLook: 'terrain',
    name: 'earth', radius: 3,
    rotationSpeed: 0.01, axialTilt: 0.41,
    atmosphereThickness: 0.7,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)

// Pre-compile every shader before the first render — keeps the main
// thread responsive while the GPU driver links programs in the
// background (uses `KHR_parallel_shader_compile` when available).
await body.warmup(renderer, camera, {
  onProgress: ({ phase, progress, label }) => {
    // Drive a loading bar — `phase` is a stable code, `label` an
    // English fallback, `progress` ∈ [0, 1].
  },
})

// in animation loop:
body.tick(delta)
```

On Vue/TresJS scenes, mount `<BodyWarmup :body="body" @ready="…" />` inside `<TresCanvas>` instead — it resolves the renderer / camera from the canvas context and emits the same progress events.

## Resources live off-lib

The lib carries no resource vocabulary whatsoever. It returns a "raw"
planet — geometry, per-tile elevation, sea level, palette — and exposes
paint hooks so consumers can project their own game semantics on top:

```ts
const body = useBody(config, tileSize)

// Caller owns the distribution strategy, the catalogue and the paint.
const distribution = myGenerateDistribution(body.sim)
myPaintBody(body, distribution)       // calls body.tiles.sol.applyOverlay
                                      // + body.tiles.paintSmoothSphere
```

Relevant `body.tiles` primitives (planet branch — narrow on `body.kind === 'planet'`):

- `body.tiles.sol.tileBaseVisual(tileId)` — pre-blend palette snapshot
  (colour + PBR + submerged flag). Lets consumers run their own
  resource-aware blend off-lib.
- `body.tiles.sol.applyOverlay(Map<tileId, RGB>)` — stamps per-tile RGB
  into the interactive layered mesh (live mutation-friendly). Same shape
  on `body.tiles.atmo.applyOverlay` for the atmo board.
- `body.tiles.paintSmoothSphere(Map<tileId, RGB>)` — one-shot paint of
  the distant view (frozen at generation).
- `body.tiles.sol.updateTileSolHeight(Map<tileId, height>)` — per-tile
  elevation mutation.

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

### Surface liquid — planetary only

`liquidState` (and the related `liquidColor` / `liquidCoverage`) lives on
[`PlanetConfig`](./types/body.types.ts) — the discriminated-union branch
of [`BodyConfig`](./types/body.types.ts). The fields are simply absent
from the `StarConfig` branch, so the type-checker rejects them at the
construction site rather than letting them be silently ignored at
runtime. The single enforcement point is `hasSurfaceLiquid(config)`,
exported from `/sim` for consumers that need to read the same invariant.

## Determinism

Every generation step is seeded from `BodyConfig.name` — no raw `Math.random()`. Two clients with the same config produce identical tiles, elevations, resource maps and visual variation.

## Documentation

The full doc site lives at <https://cedric-pouilleux.github.io/stellex-js/> — the
guides below are the recommended entry points by use case.

**Get started**

- [Démarrer](https://cedric-pouilleux.github.io/stellex-js/guides/getting-started) — installation + Hello World
- [Concepts fondamentaux](https://cedric-pouilleux.github.io/stellex-js/guides/core-concepts) — invariants, taxonomy, view modes, deterministic seeding

**Wire it into your stack**

- [Three.js (vanilla)](https://cedric-pouilleux.github.io/stellex-js/guides/threejs-integration) — handle reference + `useBody` options
- [Vue 3 + TresJS](https://cedric-pouilleux.github.io/stellex-js/guides/vue-integration) — `<Body>` and friends
- [Headless / server](https://cedric-pouilleux.github.io/stellex-js/guides/headless-simulation) — Node, workers, CLIs without WebGL

**Tune the look**

- [Stars](https://cedric-pouilleux.github.io/stellex-js/guides/stars) — spectral types, kelvin helpers, godrays calibration
- [Palettes & terrain](https://cedric-pouilleux.github.io/stellex-js/guides/palettes-and-terrain) — anchors, custom palettes, `MetallicBand`
- [Variation visuelle](https://cedric-pouilleux.github.io/stellex-js/guides/variation) — `BodyVariation` knobs (cracks, lava, gas turbulence, …)
- [Graphics uniforms](https://cedric-pouilleux.github.io/stellex-js/guides/graphics-uniforms) — shared cloud / liquid / terrain uniform bag
- [Hover cursor](https://cedric-pouilleux.github.io/stellex-js/guides/hover-cursor) — ring + floor ring + emissive presets, tile overlay highlight

**Wire game logic on top**

- [Intégrer du gameplay](https://cedric-pouilleux.github.io/stellex-js/guides/gameplay-integration) — paint hooks, distribution, persistence
- [Performance](https://cedric-pouilleux.github.io/stellex-js/guides/performance) — `tileSize`, BVH, `RenderQuality`
- [Advanced API](https://cedric-pouilleux.github.io/stellex-js/guides/advanced-api) — strategies, geometry primitives, lighting helpers, FX configs

For an interactive playground (sliders for every shader knob), open
<https://cedric-pouilleux.github.io/stellex-js/playground/>.

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

This project is licensed under the StellexJS Non-Commercial License (HC-NCL).
See LICENSE for details.
