# Intégration Three.js (vanille)

Ce guide branche un corps dans une `THREE.Scene` **sans aucune dépendance Vue**. Tout vient de `/core`.

## Squelette de scène

```ts
import * as THREE from 'three'
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellex-js/core'

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
    type:                'planetary',
    surfaceLook:         'terrain',
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

`useBody(config, tileSize)` renvoie un [`Body`](/api/core/type-aliases/Body) — une **union discriminée** `PlanetBody | StarBody`. Tous les corps partagent les primitives communes, et les planètes exposent en plus les namespaces `liquid`, `view`, `atmoShell` et la version étendue de `tiles`.

| Champ | Présent sur | Rôle |
| ----- | ----------- | ---- |
| `body.kind`             | tous   | Discriminant `'planet' \| 'star'` |
| `body.group`            | tous   | `THREE.Group` à ajouter dans la scène |
| `body.sim`              | tous   | Résultat de `initBodySimulation` (tuiles, élévations…) |
| `body.config`           | tous   | Le `BodyConfig` originel (narrowed sur la branche correspondante) |
| `body.palette`          | tous   | La palette terrain résolue |
| `body.variation`        | tous   | Variations procédurales dérivées du seed (anneaux, etc.) |
| `body.tileCount`        | tous   | Nombre de tuiles sol générées |
| `body.planetMaterial`   | tous   | `BodyMaterial` actif — accès direct aux uniforms shader (`setParams`) |
| `body.graphicsUniforms` | tous   | Bag d'uniforms partagés cloud / liquid / terrain (cf. [Graphics uniforms](/guides/graphics-uniforms)) |
| `body.hoverChannel`     | tous   | `HoverChannel` publié pour les projecteurs scène (cf. [hover cursor](/guides/hover-cursor#hoverchannel)) |
| `body.shadowUniforms`   | tous   | `{ pos: { value: Vector3 } }` consommé par `<ShadowUpdater>` |
| `body.occluderUniforms` | tous   | Uniforms d'occlusion (anneaux ↔ planète) |
| `body.interactive`      | tous   | Setters de mode interactif (smooth ↔ hex) + `queryHover` |
| `body.hover`            | tous   | API hover unifié — ring + floorRing + emissive light (cf. [guide curseur](/guides/hover-cursor)) |
| `body.tiles`            | tous   | API per-tile (visuels, couleurs) — étendue sur les planètes (`sol`/`atmo`) |
| `body.getCoreRadius()`  | tous   | Rayon monde du noyau opaque |
| `body.getSurfaceRadius()` | tous | Rayon monde de la silhouette (= `config.radius`) |
| `body.liquid`           | planet | Niveau de la mer dynamique (`setSeaLevel`, `setVisible`, `setOpacity`, `setColor`) |
| `body.view`             | planet | Mode de visualisation (`'surface' \| 'atmosphere' \| 'shader'`) |
| `body.atmoShell`        | planet | Halo atmo procédural (peut être `null` quand `atmosphereOpacity === 0`) |
| `body.tick(dt)`         | tous   | Avance rotation + uniforms shader |
| `body.dispose()`        | tous   | Libère les ressources GPU |

Pour atteindre les namespaces planet-only, narrow d'abord le union :

```ts
if (body.kind === 'planet') {
  body.liquid.setSeaLevel(1.0)
  body.view.set('atmosphere')
}
```

## Options de `useBody` — référence rapide

Le 3e argument de `useBody` est un sac d'options, **toutes facultatives**. Chaque champ est documenté en détail dans son guide thématique ; ce tableau sert de point d'entrée unifié.

```ts
useBody(config, tileSize, {
  sunLight, palette, variation, quality,
  hoverChannel, graphicsUniforms,
  hoverCursor, hoverCursors, defaultCursor,
})
```

| Champ | Type | Défaut | Rôle | Détail |
| ----- | ---- | ------ | ---- | ------ |
| `sunLight`         | `THREE.PointLight \| THREE.DirectionalLight \| null` | `null` (auto-discovery) | Source pipée vers le shader (planet→sun direction) | encart « Une seule lumière » plus haut |
| `palette`          | `TerrainLevel[]`         | dérivée de `config` | Override total de la palette terrain (longueur = `resolveTerrainLevelCount`) | [Palettes & terrain](/guides/palettes-and-terrain#override-total) |
| `variation`        | `BodyVariation`          | `generateBodyVariation(config)` | Identité visuelle pré-calculée (cache, override partiel, lava forcé) | [Variation visuelle](/guides/variation) |
| `quality`          | `RenderQuality`          | `{ sphereDetail: 'standard' }` | Bump des sphères lisses (`'standard' \| 'high' \| 'ultra'`) | [Performance §10](/guides/performance#_10-renderquality-bumper-la-finesse-des-sph%C3%A8res) |
| `hoverChannel`     | `HoverChannel`           | `createHoverChannel()` | Channel partagé entre N corps (UX tooltip global) | [Hover cursor — HoverChannel](/guides/hover-cursor#hoverchannel) |
| `graphicsUniforms` | `GraphicsUniforms`       | `createGraphicsUniforms()` | Bag d'uniforms cloud / liquid / terrain — partageable entre corps | [Graphics uniforms](/guides/graphics-uniforms) |
| `hoverCursor`      | `HoverCursorConfig`      | défauts neutres | Style unique du curseur de tuile (ring + floorRing + emissive) | [Hover cursor](/guides/hover-cursor#initialisation-un-seul-style) |
| `hoverCursors`     | `HoverCursorPresets`     | aucun | Dictionnaire de presets nommés (attack, build, inspect…) | [Hover cursor — presets](/guides/hover-cursor#initialisation-presets-multiples) |
| `defaultCursor`    | `string`                 | première clé de `hoverCursors` | Préset actif au montage | idem |

::: tip Mutuellement exclusifs
`hoverCursor` (style unique) et `hoverCursors` (presets multiples) ne sont pas faits pour cohabiter sur le même body. Choisis `hoverCursor` pour un style figé ; `hoverCursors` dès que tu veux switcher à chaud (`body.hover.useCursor('attack')`). Cf. l'encart « Allocation par union » dans le guide hover.
:::

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
- **Vue surface (jouable)** — l'atmosphère de l'`InteractiveLayeredMesh` est cliquable + peignable.
- **Lave / fissures** — pilotées par les flags `hasLava` / `hasCracks` du `BodyConfig` et leurs uniforms shader (`lavaAmount`, `lavaEmissive`, …) via `body.planetMaterial.setParams({ … })`.

### Anneaux

```ts
import * as THREE from 'three'
import { buildBodyRings } from '@cedric-pouilleux/stellex-js/core'

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
import { buildAtmoShell } from '@cedric-pouilleux/stellex-js/core'

const atmo = buildAtmoShell({
  config: body.config,
  palette: body.palette,
})
body.group.add(atmo.mesh)
atmo.tick(dt)
```

`buildAtmoShell` est ce qui est utilisé en interne pour la couche atmo des géantes ; vous pouvez le monter manuellement pour l'instrumenter (uniforms personnalisés, debug).

## Variantes par type

`BodyConfig` est une union discriminée sur `type` (`'planetary' | 'star'`). Sur une planète, `surfaceLook` choisit l'archétype visuel — palette, matériau et shader sont auto-dérivés :

| `type` | `surfaceLook` | Description |
| ------ | ------------- | ----------- |
| `'planetary'` | `'terrain'` (défaut) | Planète tellurique, relief hex, liquide optionnel |
| `'planetary'` | `'bands'`    | Géante gazeuse, atmo bandée, noyau rocheux optionnel (`gasMassFraction` / `coreRadiusRatio`) |
| `'planetary'` | `'metallic'` | Monde métallique réflectif, lave optionnelle |
| `'star'`      | _(ignoré)_   | Sphère émissive avec granulation (pas de relief) — `spectralType` requis |

Voir [`BodyConfig`](/api/sim/type-aliases/BodyConfig) pour tous les paramètres exposés.

## Raycasting / interaction

Pour les tuiles cliquables, voir [Visualiseur interactif](/examples/hex-tiles/interactive-viewer).
