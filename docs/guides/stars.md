# Étoiles

Le pipeline étoile est **structurellement distinct** du pipeline planète. Une étoile n'a pas de relief jouable, pas de surface liquide, pas d'atmosphère cliquable, pas de basculement de vue ; en contrepartie, elle porte une granulation animée, une corona, une pulsation, et son look est entièrement dérivé de son `spectralType` — sans caller-side palette à fournir.

Ce guide consolide tout ce qui touche aux étoiles : configuration, handle, helpers spectraux, conversions Kelvin et calibration des effets post-process. Pour les concepts généraux (déterminisme, séparation `sim`/`core`/`vue`, pipeline planète), voir [Concepts fondamentaux](/guides/core-concepts).

## Hello, étoile

```ts
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellex-js/core'

const sun = useBody({
  type:          'star',
  spectralType:  'G',
  name:          'Sol',
  radius:         3,
  rotationSpeed:  0.01,
  axialTilt:      0,
}, DEFAULT_TILE_SIZE)

scene.add(sun.group)

renderer.setAnimationLoop((dt) => {
  sun.tick(dt)        // avance granulation + pulsation + corona
  renderer.render(scene, camera)
})
```

`spectralType` est **obligatoire** sur une `StarConfig` — c'est lui qui pilote palette, granulation, corona, godrays et tile-ref radius.

## Classification spectrale

Sept classes Morgan–Keenan supportées. La table interne [`SPECTRAL_TABLE`](/api/sim/variables/SPECTRAL_TABLE) (exportée depuis `/sim`) fournit les valeurs canoniques :

| `spectralType` | Couleur visuelle | `tempK` | `radius` (réf.) | Description |
| -------------- | ---------------- | ------- | --------------- | ----------- |
| `'O'` | Bleu-blanc      | 40 000 K | 15  | Géante massive, rare, durée de vie courte |
| `'B'` | Bleu-blanc      | 20 000 K | 7   | Géante chaude |
| `'A'` | Blanc           |  9 000 K | 4   | Étoile blanche |
| `'F'` | Blanc-jaune     |  7 000 K | 3.5 | Plus chaude que le Soleil |
| `'G'` | Jaune (Soleil)  |  5 778 K | 3   | Référence — `REF_STAR_TEMP`, `REF_STAR_RADIUS` |
| `'K'` | Orange          |  4 500 K | 2.5 | Plus froide que le Soleil |
| `'M'` | Rouge           |  3 000 K | 1.5 | Naine rouge |

Le `radius` du tableau est une **valeur visuelle** (unités monde), pas une grandeur astrophysique. La luminosité relative est dérivée de Stefan-Boltzmann par [`resolveStarData`](#dérivations-physiques) — pas hardcodée.

## Le handle `StarBody`

```ts
const sun = useBody(starConfig, DEFAULT_TILE_SIZE)
if (sun.kind === 'star') {
  // ...
}
```

[`StarBody`](/api/core/interfaces/StarBody) est la branche étoile de l'union [`Body`](/api/core/type-aliases/Body). Vs [`PlanetBody`](/api/core/interfaces/PlanetBody), elle :

| Trait | `PlanetBody` | `StarBody` |
| ----- | ------------ | ---------- |
| `kind` | `'planet'` | `'star'` |
| `liquid`     | présent | **absent** |
| `view`       | présent (`'surface' \| 'atmosphere' \| 'shader'`) | **absent** (toujours en mode shader) |
| `atmoShell`  | `AtmoShellHandle \| null` | **absent** |
| `tiles.atmo` | `BoardTiles \| null` | **absent** (pas de board atmo) |
| `tiles.sol`  | `SolBoardTiles` (avec `updateTileSolHeight`) | **absent** — `tiles` est plat ([`StarTiles`](/api/core/interfaces/StarTiles)) |
| `tiles.tileBaseVisual` | sous `tiles.sol.tileBaseVisual` | **directement** sur `tiles.tileBaseVisual` |
| `tiles.writeTileColor` | sous `tiles.sol.writeTileColor` | **directement** sur `tiles.writeTileColor` |
| `flatSurface` (strategy) | `false` | `true` (granulation = shader effect) |
| `canHaveRings` (strategy) | `true` | `false` |
| `tick(dt)` | rotation + uniforms atmo | granulation + corona + pulsation |

Les primitives **communes** (présentes sur les deux branches) restent disponibles : `group`, `sim`, `palette`, `variation`, `planetMaterial`, `graphicsUniforms`, `hoverChannel`, `interactive`, `hover`, `tick`, `dispose`, `getCoreRadius`, `getSurfaceRadius`.

## Tile count et `STAR_TILE_REF`

Sur une planète, le tile count dérive de `radius`. Sur une étoile, ça produirait des tuiles minuscules sur les O et démesurées sur les M (le ratio de rayon est `15:1.5 = 10x` entre les extrêmes). Pour stabiliser les tile counts, le pipeline étoile utilise [`STAR_TILE_REF`](/api/core/variables/STAR_TILE_REF) :

```ts
import { STAR_TILE_REF } from '@cedric-pouilleux/stellex-js/core'
// { M: 2.0, K: 2.5, G: 3.0, F: 3.5 }
```

| Spectral | Tile-ref radius | Effet |
| -------- | --------------- | ----- |
| `M`      | `2.0` | Naines rouges — tile count bumped malgré le petit `radius` |
| `K`      | `2.5` | |
| `G`      | `3.0` | Identité (réf Soleil) |
| `F`      | `3.5` | |
| `A/B/O`  | fallback `3.0`  | Pas listés — utilisent la valeur G par défaut |

Le tile count concret est `tileSizeToSubdivisions(STAR_TILE_REF[spectralType], tileSize)`.

## Dérivations physiques

Trois helpers exportés depuis `/sim` (donc utilisables côté serveur / worker / CLI sans WebGL) :

### [`resolveStarData`](/api/sim/functions/resolveStarData)

```ts
import { resolveStarData } from '@cedric-pouilleux/stellex-js/sim'

const data = resolveStarData({ spectralType: 'M' })
// { tempK: 3000, radius: 1.5, luminosity: 0.067, color: '#ffcc6f' }
```

`luminosity` est calculée via Stefan-Boltzmann relative au G (`L_G = 1`). `color` est la teinte CSS canonique de la classe spectrale (utile pour les UI / minimap).

`tempK` et `radius` peuvent être **overridés** :

```ts
resolveStarData({ spectralType: 'G', tempK: 5500, radius: 2.8 })
// → tempK et radius surchargés ; luminosity recalculée depuis ces overrides
```

### [`toStarParams`](/api/sim/functions/toStarParams)

```ts
import { toStarParams } from '@cedric-pouilleux/stellex-js/sim'

const params = toStarParams({ spectralType: 'O' })
// { radius: 15, tempK: 40000 }
```

Forme minimaliste — utile quand seuls `radius` + `tempK` sont consommés (mécanique orbitale, FX de chaleur, etc.).

### [`SPECTRAL_TABLE`](/api/sim/variables/SPECTRAL_TABLE)

Lecture directe quand vous voulez la valeur sans traverser un resolver :

```ts
import { SPECTRAL_TABLE } from '@cedric-pouilleux/stellex-js/sim'

console.log(SPECTRAL_TABLE.G.tempK)   // 5778
console.log(SPECTRAL_TABLE.M.color)   // '#ffcc6f'
```

## Helpers Kelvin

Trois utilitaires de conversion couleur exportés depuis `/core`. Utilisent l'approximation de Tanner Helland, valide entre ~1 000 K et ~40 000 K.

```ts
import { kelvinToRGB, kelvinToThreeColor, kelvinLabel } from '@cedric-pouilleux/stellex-js/core'

kelvinToRGB(5778)
// { r: 1.0, g: 0.97, b: 0.92, hex: '#fff7eb' } — Soleil

kelvinToThreeColor(3500)
// { r: 1.0, g: 0.65, b: 0.31 } — naine M, prêt pour new THREE.Color(r, g, b)

kelvinLabel(5778)
// 'Étoile G comme notre Soleil (~5778K)'
```

::: tip Quand utiliser quoi
- **Vous avez un `spectralType` connu** → `SPECTRAL_TABLE[type].color` (CSS hex pré-calculé, pas de calcul).
- **Vous avez une température arbitraire** (e.g. `kelvinToRGB(4200)` pour une étoile sub-K simulée) → helpers Kelvin.
- **Vous voulez l'étiquette UI** → `kelvinLabel` (déjà en français).
:::

## Helpers visuels

### [`buildStarPalette`](/api/core/functions/buildStarPalette)

```ts
import { buildStarPalette } from '@cedric-pouilleux/stellex-js/core'

const palette = buildStarPalette('M')
// TerrainLevel[] : surface → corona en gradient pour la classe M
```

Palette terrain pour le shader étoile — surface → bord/corona. Consommée automatiquement par `useBody` ; vous l'invoquez directement uniquement pour des previews ou des shaders custom.

### [`godRaysFromStar`](/api/core/functions/godRaysFromStar)

Calibre les paramètres god rays (`exposure`, `decay`, `density`, `weight`) à partir d'un [`StarPhysicsInput`](/api/sim/interfaces/StarPhysicsInput) — voir le détail dans le guide [API avancée](/guides/advanced-api#god-rays-paramétrés-depuis-une-étoile). Couplé à `GodRaysShader` (post-processing pass), ça produit un effet calibré par classe spectrale sans tuning manuel.

```ts
import { godRaysFromStar } from '@cedric-pouilleux/stellex-js/core'

const params = godRaysFromStar({ spectralType: 'O' })
// exposure / decay / density / weight calibrés pour une géante O
```

## Override radius / tempK

`StarConfig` expose les mêmes leviers que `BodyPhysicsCore` (`radius`, `rotationSpeed`, `axialTilt`, `mass?`, `coreRadiusRatio?`). Les seuls champs étoile-spécifiques sont **`spectralType`** (requis) et l'override implicite `tempK` qui passe par `resolveStarData` quand vous voulez une valeur non-canonique :

```ts
// Étoile G "personnalisée" — un peu plus froide et plus grosse que le Soleil
useBody({
  type:         'star',
  spectralType: 'G',
  name:         'Helios-Beta',
  radius:        4.2,        // override visuel (par défaut 3 pour G)
  rotationSpeed: 0.005,
  axialTilt:     0,
}, DEFAULT_TILE_SIZE)
```

Pour overrider `tempK` (qui vit hors de `BodyConfig` puisque c'est une dérivation), passez par `resolveStarData` directement quand vous calculez un état de jeu :

```ts
const data = resolveStarData({ spectralType: 'G', tempK: 5500 })
// luminosity recalculée pour 5500 K (≠ valeur canonique G de 5778 K)
```

## Pas de `view`, pas de `liquid`, pas d'`atmoShell`

C'est le plus gros piège — TS rejette directement ces accès sur `StarBody` :

```ts
const star = useBody(starConfig, DEFAULT_TILE_SIZE)

star.view.set('surface')        // ❌ TS error : 'view' does not exist on StarBody
star.liquid.setSeaLevel(1.0)    // ❌
star.atmoShell?.tick(dt)        // ❌
star.tiles.sol.tileGeometry(0)  // ❌ : pas de namespace .sol sur StarTiles

// ✅ Avec narrowing
if (star.kind === 'star') {
  // tiles plat sur StarBody
  star.tiles.tileGeometry(0)
  star.tiles.tileBaseVisual(0)
  star.tiles.writeTileColor(0, { r: 1, g: 0, b: 0 })
}
```

Si tu veux factoriser du code agnostique, type-le contre `BodyBase` et reste sur les primitives communes (`group`, `tick`, `dispose`, `interactive`, `hover`, `getCoreRadius`, `getSurfaceRadius`, …).

## Voir aussi

- [Concepts fondamentaux §7](/guides/core-concepts#_7-étoiles-vs-planètes) — récap des différences pipeline
- [Type d'étoile (exemple)](/examples/body-types/star) — démo visuelle des 7 classes
- [God rays stellaires](/examples/lighting/star-godrays) — composition avec `EffectComposer`
- [Sources lumineuses multiples](/examples/lighting/multi-light) — pattern multi-étoiles
- [Système solaire](/examples/scenes/solar-system) — scène complète planètes + étoile
- [API avancée — `godRaysFromStar`](/guides/advanced-api#god-rays-paramétrés-depuis-une-étoile)
- [API : `StarConfig`](/api/sim/type-aliases/StarConfig)
- [API : `StarBody`](/api/core/interfaces/StarBody)
- [API : `ResolvedStarData`](/api/sim/interfaces/ResolvedStarData)
