# Intégration Three.js (vanille)

Ce guide branche un corps dans une `THREE.Scene` **sans aucune dépendance Vue**. Tout vient de `/core`.

## Squelette de scène

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellar-hex/core'

const scene    = new THREE.Scene()
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

const sun = new THREE.DirectionalLight(0xffffff, 2.5)
sun.position.set(5, 3, 3)
scene.add(sun)
```

::: tip Une seule lumière pilote le shader
Les matériaux de la lib sont custom : ils ne lisent pas l'`AmbientLight` et n'agrègent pas plusieurs `DirectionalLight`. Une seule source dirige la direction soleil → corps, soit explicitement via `useBody({ sunLight })`, soit par auto-discovery (scan de la lumière la plus intense). Voir [Sources lumineuses multiples](/examples/lighting/multi-light) pour les cas multi-étoiles.
:::

## Générer le corps

```ts
const body = useBody(
  {
    name:                'Demo',
    type:                'rocky',
    radius:               1,
    rotationSpeed:        0.01,
    axialTilt:            0.41,
    atmosphereThickness:  0.5,
  },
  DEFAULT_TILE_SIZE,
  // Pipes the scene light into the body shader's planet→sun direction.
  // Omit it and the lib auto-discovers the dominant scene light each tick.
  { sunLight: sun },
)

scene.add(body.group)
camera.position.set(0, 0, 4)
```

`useBody(config, tileSize)` renvoie un [`Body`](/api/core/type-aliases/Body) — une **union discriminée** `PlanetBody | StarBody`. Tous les corps partagent les primitives communes, et les planètes (rocky / gaseous / metallic) exposent en plus les namespaces `liquid`, `view`, `atmoShell`, `liquidCorona` et la version étendue de `tiles`.

| Champ | Présent sur | Rôle |
| ----- | ----------- | ---- |
| `body.kind`          | tous | Discriminant `'planet' \| 'star'` |
| `body.group`         | tous | `THREE.Group` à ajouter dans la scène |
| `body.sim`           | tous | Résultat de `initBodySimulation` (tuiles, élévations…) |
| `body.config`        | tous | Le `BodyConfig` originel |
| `body.palette`       | tous | La palette terrain résolue |
| `body.variation`     | tous | Variations procédurales dérivées du seed (anneaux, etc.) |
| `body.interactive`   | tous | Setters de mode interactif (smooth ↔ hex) |
| `body.hover`         | tous | API hover unifié — ring + emissive light + column (cf. [guide curseur](/guides/hover-cursor)) |
| `body.tiles`         | tous | API per-tile (visuels, couleurs) — étendue sur les planètes |
| `body.liquid`        | planet | Niveau de la mer dynamique |
| `body.view`          | planet | Mode de visualisation (`surface \| atmosphere \| shader`) |
| `body.atmoShell`     | planet | Halo atmo procédural (peut être `null`) |
| `body.liquidCorona`  | planet | Corona translucide (peut être `null`) |
| `body.tick(dt)`      | tous | Avance rotation + uniforms shader |
| `body.dispose()`     | tous | Libère les ressources GPU |

Pour atteindre les namespaces planet-only, narrow d'abord le union :

```ts
if (body.kind === 'planet') {
  body.liquid.setSeaLevel(1.0)
  body.view.set('atmosphere')
}
```

## Boucle d'animation

```ts
const clock = new THREE.Clock()
let last = clock.getElapsedTime()

renderer.setAnimationLoop(() => {
  const now = clock.getElapsedTime()
  body.tick(now - last)
  last = now
  renderer.render(scene, camera)
})
```

`body.tick(dt)` fait deux choses :

1. avance la rotation propre (`rotationSpeed * dt`),
2. met à jour les uniforms temporels des shaders (atmo, océan, étoile).

Pour une scène qui pause (`speedMultiplier = 0`), ne pas appeler `body.tick` suffit — la matière reste figée.

## Ajouter des couches

Les couches additionnelles sont **opt-in**. Vous décidez explicitement quand les construire. Toutes (atmo, anneaux, halo, sphère liquide) suivent le même pattern : un `build*` qui retourne un handle `{ mesh | carrier, tick, dispose }`.

### Atmosphère / halo

L'atmosphère visuelle est intégrée :

- **Vue shader** — un halo procédural (`buildAtmoShell`) est monté automatiquement par `useBody` quand `atmosphereOpacity > 0` (cf. `body.atmoShell` sur les `PlanetBody`).
- **Vue surface (jouable)** — la bande atmo de l'`InteractiveLayeredMesh` est cliquable + peignable.
- **Lave / fissures** — pilotées par les flags `hasLava` / `hasCracks` du `BodyConfig` et leurs uniforms shader (`lavaAmount`, `lavaEmissive`, …) via `body.planetMaterial.setParams({ … })`.

### Anneaux

```ts
import * as THREE from 'three'
import { buildBodyRings } from '@cedric-pouilleux/stellar-hex/core'

if (body.variation.rings) {
  const planetWorldPos = new THREE.Vector3()

  const rings = buildBodyRings({
    radius:         body.config.radius,
    rotationSpeed:  body.config.rotationSpeed,
    variation:      body.variation.rings,
    planetWorldPos,             // requis (lu par référence pour l'ombre)
  })
  body.group.add(rings.carrier) // carrier, pas mesh — hérite tilt/spin

  // dans la boucle :
  body.group.getWorldPosition(planetWorldPos)
  rings.tick(dt)
}
```

### Liquide

Le liquide est intégré au mesh principal pour les mondes rocheux : `buildLayeredInteractiveMesh` empile une coquille hexagonale (`buildLiquidShell`) sur les tuiles submergées, top fan animé (vagues / foam / caustics) au niveau de la mer, sans murs. Pour un contrôle direct (preview, scène headless), `buildLiquidShell(...)` est exporté depuis `/core` et accepte les tuiles cibles, `baseElevation`, `topElevation`, `palette`, `color` et un bag `graphicsUniforms` pour piloter les uniforms de vagues / opacité / fresnel.

### Atmosphère opaque (gazeuses)

```ts
import { buildAtmoShell } from '@cedric-pouilleux/stellar-hex/core'

const atmo = buildAtmoShell({
  config: body.config,
  palette: body.palette,
})
body.group.add(atmo.mesh)
atmo.tick(dt)
```

`buildAtmoShell` est ce qui est utilisé en interne pour la couche atmo des géantes ; vous pouvez le monter manuellement pour l'instrumenter (uniforms personnalisés, debug).

## Variantes par type

Changez juste `type` — palette, matériau et shader sont auto-dérivés :

| `type` | Description |
| ------ | ----------- |
| `'rocky'`    | Planète tellurique, relief hex, liquide optionnel |
| `'gaseous'`  | Géante gazeuse, atmo bandée, noyau rocheux optionnel (`gasMassFraction` / `coreRadiusRatio`) |
| `'metallic'` | Monde métallique réflectif, lave optionnelle |
| `'star'`     | Sphère émissive avec granulation (pas de relief) |

Voir [`BodyConfig`](/api/sim/type-aliases/BodyConfig) pour tous les paramètres exposés.

## Raycasting / interaction

Pour les tuiles cliquables, voir [Visualiseur interactif](/examples/hex-tiles/interactive-viewer).
