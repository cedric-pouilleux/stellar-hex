# API avancée — extensions et primitives

`useBody` est le happy path : il assemble géométrie, mesh, shaders, palette et raycast en un appel. Quand vous sortez de ce périmètre — éditeur de scène, builder custom, archétype visuel maison, helpers d'éclairage — la lib expose les **briques internes** comme API publique. Cette page recense les exports rarement nécessaires mais indispensables quand on en a besoin.

Tous les exports cités sont stables et monitorés par `api-extractor` (cf. [`api/reports/`](https://github.com/cedric-pouilleux/stellar-hex/tree/main/api/reports)).

## Stratégies par `SurfaceLook`

Les planètes dispatchent leur pipeline de rendu sur une **table de stratégies** indexée par [`SurfaceLook`](/api/sim/type-aliases/SurfaceLook). Chaque entrée déclare la palette à utiliser, le shader à invoquer, l'opacité atmo par défaut, les ranges de variation sol… Adding un nouvel archétype visuel collapse à **une entrée dans la table**.

```ts
import {
  SURFACE_LOOK_STRATEGIES,
  strategyFor,
  type BodyTypeStrategy,
} from '@cedric-pouilleux/stellar-hex/core'

// Routing depuis un BodyConfig (étoiles → strategy fixe, planètes → SurfaceLook)
const strategy = strategyFor(config)

console.log(strategy.shaderType)               // 'rocky' | 'gaseous' | 'metallic' | 'star'
console.log(strategy.flatSurface)              // true sur les étoiles
console.log(strategy.displayMeshIsAtmosphere)  // true sur les gazeuses (smooth sphere = silhouette atmo)
console.log(strategy.canHaveRings)             // false sur les étoiles
console.log(strategy.defaultAtmosphereOpacity) // ~0.45 (terrain) / 1.0 (bands) / 0 (metallic, star)

// Accès direct à une stratégie planet (ne route pas — vous savez ce que vous faites)
const terrain = SURFACE_LOOK_STRATEGIES.terrain
const palette = terrain.buildPalette(planetConfig, /* count */ 8, /* coreRatio */ 0.55)
```

Champs notables d'un [`BodyTypeStrategy`](/api/core/interfaces/BodyTypeStrategy) :

| Champ | Type | Rôle |
| ----- | ---- | ---- |
| `shaderType` | `LibBodyType` | Famille de shader (`'rocky'` / `'gaseous'` / `'metallic'` / `'star'`) — décorrélée de la taxonomie publique `BodyType` qui ne distingue plus que `'planetary' \| 'star'` |
| `flatSurface` | `boolean` | Empêche le displacement vertex sur la smooth sphere (étoiles) |
| `displayMeshIsAtmosphere` | `boolean` | La smooth sphere joue le rôle d'enveloppe atmosphérique (gazeuses) |
| `canHaveRings` | `boolean` | Gate physique pour `RingVariation` |
| `metallicSheen` | `number` | Coefficient passé au shader (0 ou 1) |
| `solVariationRanges?` | `SolVariationRanges` | Override des ranges de variation crack/lava (métallique uniquement) |
| `defaultAtmosphereOpacity` | `number` | Opacité atmo en vue `'shader'` quand `BodyConfig.atmosphereOpacity` est omis |
| `tileRefRadius(config)` | `(BodyConfig) => number` | Rayon de référence pour calculer le tile count |
| `buildPalette(config, count, coreRatio)` | fonction | Génère la palette terrain |
| `buildShaderParams(config, seed, variation?)` | fonction | Assemble le `ParamMap` pour le shader |

::: tip Quand consulter cette table
Vous écrivez un éditeur visuel qui veut prévisualiser l'effet d'un changement de `surfaceLook` **sans** rebuild d'un body complet ; ou vous cherchez à savoir si un `BodyConfig` peut porter un anneau avant d'allouer un mesh ; ou vous écrivez une stratégie maison (`'crystalline'`, `'oceanic'`).
:::

## Dériver les uniforms shader sans body

[`configToLibParams(config, variation?)`](/api/core/functions/configToLibParams) résout `BodyConfig + BodyVariation → ParamMap` **sans allouer de GPU**. Utilité : panneaux de preview, thumbnails, debug, tests d'intégration.

```ts
import {
  configToLibParams,
  generateBodyVariation,
} from '@cedric-pouilleux/stellar-hex/core'

const variation = generateBodyVariation(config)
const params    = configToLibParams(config, variation)

// `params` est exactement ce que `body.planetMaterial` recevrait via setParams.
preview.show({
  type:   config.surfaceLook ?? 'terrain',
  params,
})
```

C'est la même fonction qu'invoque `useBody` en interne — la garantie « ce que je vois en preview = ce que je verrai en scène » est structurelle.

## Primitives géométriques

`useBody` construit la géométrie hex sol via deux primitives publiques. Vous pouvez les invoquer directement pour bâtir un mesh hex personnalisé (éditeur, fixture de test, batch de thumbnails).

### `buildLayeredPrismGeometry` — un seul prisme

```ts
import { buildLayeredPrismGeometry } from '@cedric-pouilleux/stellar-hex/core'

const { geometry, range } = buildLayeredPrismGeometry(
  tile,                  // Tile retourné par generateHexasphere
  /* coreRadius */    1.5,
  /* solHeight */     0.2,
  /* shellThickness */ 0.5,
)
// geometry : BufferGeometry non-indexed
// range    : { start: 0, count: vertices }
// attributs : position (vec3), normal (vec3), aSolHeight (float)
```

Les murs et le fan inférieur sont **toujours émis** même quand le prisme s'effondre (`solHeight === 0`) — les triangles sont dégénérés et le GPU les drop. Cette discipline garantit des **vertex counts stables** : muter `aSolHeight` puis reconstruire en place ne réalloue jamais le buffer.

### `buildLayeredMergedGeometry` — toutes les tuiles d'un coup

```ts
import { buildLayeredMergedGeometry } from '@cedric-pouilleux/stellar-hex/core'

const merged = buildLayeredMergedGeometry(
  tiles,            // readonly Tile[]
  /* coreRadius */     1.5,
  /* solOuterRadius */ 2.0,
  /* solHeightFn */    (tile) => myHeightForTile(tile.id),
)
// merged.geometry       : BufferGeometry mergée
// merged.faceToTileId   : number[]      — face index → tileId pour le raycast
// merged.tileRange      : Map<id, { start, count }>
// merged.shellThickness : 0.5
```

`SolHeightFn` est purement fonctionnel — vous pouvez la brancher sur n'importe quelle source (sim, save, override de jeu).

### `buildAtmoBoardMesh` — board atmo cliquable

L'atmo cliquable des planètes est une **hexasphère séparée** projetée sur la bande `[solOuter, silhouette]`. Mêmes primitives, mais sans staircase d'élévation — un seul niveau par tuile.

```ts
import { buildAtmoBoardMesh } from '@cedric-pouilleux/stellar-hex/core'

const atmoBoard = buildAtmoBoardMesh({
  tiles:        atmoTiles,                  // hexasphere distincte du sol
  innerRadius:  body.getSurfaceRadius() * (1 - 0.5),
  outerRadius:  body.getSurfaceRadius(),
  defaultColor: { r: 0.10, g: 0.10, b: 0.16 },
})
scene.add(atmoBoard.group)
```

::: warning Sol et atmo sont deux hexaspheres distinctes
Un id sol `42` et un id atmo `42` ne désignent **pas** la même verticale. Pour relier les deux, faites un nearest-neighbor sur `getTilePosition`.
:::

## Outer radius — anchor pour vos coquilles custom

[`bodyOuterRadius(config, palette?)`](/api/core/functions/bodyOuterRadius) retourne le rayon **hors-tout** d'un corps : `radius` plus la hauteur de la bande la plus haute. C'est l'ancrage à utiliser pour toute coquille (atmo custom, halo, anneau de débris) qui doit visuellement passer par-dessus le terrain hex.

```ts
import { bodyOuterRadius } from '@cedric-pouilleux/stellar-hex/core'

const r = bodyOuterRadius(body.config, body.palette)
const dustHalo = new THREE.Mesh(
  new THREE.SphereGeometry(r * 1.01, 32, 16),
  dustHaloMaterial,
)
body.group.add(dustHalo)
```

Quand la palette est omise, un fallback safe (`0.06`) est utilisé — couvre toute palette générée par la lib quel que soit le rayon.

## Helpers d'éclairage scène

Les shaders custom de la lib ne lisent **pas** l'`AmbientLight` ni n'agrègent plusieurs `DirectionalLight` — ils consomment **une** position monde de "soleil". Deux helpers gèrent la résolution de cette position :

### `findDominantLightWorldPos` — auto-discovery

```ts
import { findDominantLightWorldPos, findSceneRoot } from '@cedric-pouilleux/stellar-hex/core'
import * as THREE from 'three'

const sunPos = new THREE.Vector3()
const found  = findDominantLightWorldPos(findSceneRoot(myMesh), sunPos)
if (!found) sunPos.set(1, 0, 0)  // fallback +X
```

Scanne tous les `PointLight` et `DirectionalLight` sous `root`, retient le plus intense, écrit sa position monde dans `out`. Les directional sont projetées en un point virtuel à `1e5` derrière la scène pour produire une direction quasi-parallèle. C'est exactement le helper qu'utilise `useBody` quand l'option `sunLight` est omise — l'exposer publiquement permet de réutiliser la même logique pour vos propres shaders custom.

### `findSceneRoot` — remonte au top du graphe

```ts
import { findSceneRoot } from '@cedric-pouilleux/stellar-hex/core'
const root = findSceneRoot(body.group)  // remonte la chaîne parent jusqu'à la racine
```

Utile en couple avec `findDominantLightWorldPos` ou pour tout outil qui veut traverser le graphe complet d'une scène à partir d'un node arbitraire.

## God rays paramétrés depuis une étoile

[`godRaysFromStar(input)`](/api/core/functions/godRaysFromStar) dérive les paramètres screen-space (`exposure`, `decay`, `density`, `weight`) d'un effet god rays à partir d'un [`StarPhysicsInput`](/api/sim/interfaces/StarPhysicsInput) — la luminosité, le rayon, et la température conditionnent la calibration.

```ts
import {
  godRaysFromStar,
  GodRaysShader,
} from '@cedric-pouilleux/stellar-hex/core'

const params = godRaysFromStar({ spectralType: 'M' })
// params : { exposure, decay, density, weight }

const pass = /* mount GodRaysShader ... */
pass.uniforms.exposure.value = params.exposure
pass.uniforms.decay.value    = params.decay
pass.uniforms.density.value  = params.density
pass.uniforms.weight.value   = params.weight
```

Calibration de référence (G sans override) : `exposure ≈ 0.44`, `decay ≈ 0.94`, `density ≈ 0.70`, `weight ≈ 0.36`. La compensation de taille divise `exposure` par `(baseRadius / actualRadius)²` — garantit que doubler le rayon visuel ne floode pas le mask.

## Anneaux — ranges et archétypes

`generateRingVariation(config, rng)` est exposé publiquement — utile pour générer une variation **hors** du flow standard (preview de configurations, builder d'anneaux multiples, etc.).

```ts
import {
  generateRingVariation,
  RING_RANGES,
  RING_ARCHETYPES,
  ARCHETYPE_PROFILES,
  seededPrng,
} from '@cedric-pouilleux/stellar-hex/core'

const rng = seededPrng(config.name + ':rings')
const ring = generateRingVariation(config, rng)
// → null si !canHaveRings (étoile) OU !hasRings sur le config
```

[`RING_RANGES`](/api/core/variables/RING_RANGES) expose les bornes `{ min, max }` de chaque slider procédural — utiles pour binder un panneau de tuning sans hardcoder les bornes :

```ts
for (const key in RING_RANGES) {
  const { min, max } = RING_RANGES[key as keyof typeof RING_RANGES]
  panel.addRange(key, { min, max, value: ring![key] })
}
```

[`RING_ARCHETYPES`](/api/core/variables/RING_ARCHETYPES) liste les 12 archétypes ordonnés (`'broad'`, `'double'`, `'narrow'`, `'dusty'`, `'triple'`, `'outer'`, `'shepherd'`, `'quadruple'`, `'skewedIn'`, `'skewedOut'`, `'dense'`, `'sparse'`). [`ARCHETYPE_PROFILES`](/api/core/variables/ARCHETYPE_PROFILES) fournit les enveloppes 8-stops correspondantes — vous pouvez forcer un archétype et son profil :

```ts
ring!.archetype = 'shepherd'
ring!.profile   = ARCHETYPE_PROFILES.shepherd
```

## Constantes de scène (preview / FX)

La lib expose plusieurs **constantes par défaut** que vos panneaux ou présets peuvent consommer plutôt que de les redéfinir :

| Symbole | Module | Valeur | Usage typique |
| ------- | ------ | ------ | ------------- |
| `PREVIEW_ORBIT_SPEED` | `config/render` | `0.85` | Sensibilité de drag dans un panneau de preview |
| `FOCUS_LERP`          | `config/render` | `5.0`  | Lerp par seconde pour un focus caméra |
| `SHADOW_SUN_RADIUS`   | `config/render` | `3.0`  | Doit matcher le `radius` du soleil de la scène |
| `ORBIT_TRAIL_SEGMENTS`| `config/render` | `128`  | Segments d'une trajectoire orbitale |
| `DEFAULT_LENS_FLARE`  | `config/render` | `LensFlareConfig` | Préset équilibré pour étoile G |
| `DEFAULT_SUN_FX`      | `config/render` | `SunFXConfig`     | Blinding modéré + 5 anneaux |
| `DEFAULT_HOVER`       | `config/render` | `HoverConfig`     | Préset additif blanc, voir [hover cursor](/guides/hover-cursor#tile-overlay-highlight) |
| `DEFAULT_BODY_HOVER`  | `config/render` | `BodyHoverConfig` | Anneau silhouette blanc, 2 px |

::: tip Les FX configs ne sont **pas** appliqués par la lib
`LensFlareConfig`, `SunFXConfig` et `GodRaysParams` sont des **schémas + défauts** — la lib ne mount pas de lens-flare ni de blinding pass. C'est au caller de consommer le schéma pour son propre pass post-process. Le helper `godRaysFromStar` (cf. plus haut) fait exception : il retourne un `GodRaysParams` calibré par étoile.
:::

## Voir aussi

- [Concepts fondamentaux](/guides/core-concepts) — les invariants à connaître avant de toucher à ces primitives
- [Shaders & matériaux](/guides/shaders-and-materials) — l'autre porte d'entrée bas niveau (`BodyMaterial`)
- [Graphics uniforms](/guides/graphics-uniforms) — bag d'uniforms partagés cloud / liquid / terrain
- [Variation visuelle](/guides/variation) — comment `BodyVariation` se compose sur les paramètres
