# Palettes & terrain

La couleur de chaque tuile vient d'une **palette terrain** — une liste de [`TerrainLevel`](/api/core/interfaces/TerrainLevel) ordonnés du plus bas au plus haut. La lib choisit automatiquement la palette en fonction du `BodyConfig.type`, mais vous pouvez la **remplacer entièrement** ou n'en ajuster que les ancres.

## Génération automatique

`choosePalette(config)` route vers le bon générateur selon le couple `(type, surfaceLook)` (planètes) ou `type` seul (étoiles) :

| `type` / `surfaceLook` | Générateur |
| ---------------------- | ---------- |
| `'planetary'` + `'terrain'`  | `generateTerrainPalette` (rampe basse → haute) |
| `'planetary'` + `'metallic'` | `buildMetallicPalette` (4 stops : creux → plaines → hauteurs → pics) |
| `'planetary'` + `'bands'`    | `buildGasPalette` (4 bandes A/B/C/D) |
| `'star'`                     | `buildStarPalette` (surface → couronne) |

Chaque générateur produit une palette de **N bandes** où `N = resolveTerrainLevelCount(radius, coreRadiusRatio)`. C'est la même valeur que celle utilisée par la sim pour quantifier les élévations — donc `palette[elevation]` résout sans interpolation.

## Ancres simples (planète rocheuse)

Pour ajuster une rocheuse sans remplacer la palette, utilisez les deux ancres exposées sur `BodyConfig` :

```ts
const body = useBody({
  name: 'rocky-warm',
  type: 'planetary',
  surfaceLook: 'terrain',
  // ...
  terrainColorLow:  '#5c2a1a',   // bande la plus basse
  terrainColorHigh: '#d6a07c',   // bande la plus haute
}, DEFAULT_TILE_SIZE)
```

Les bandes intermédiaires sont interpolées en linéaire entre les deux ancres. C'est le moyen le plus simple de basculer un look « martien » ou « lunaire ».

## Palette gaz personnalisée

Les géantes gazeuses consomment quatre couleurs de bande :

```ts
const body = useBody({
  name: 'gas-giant',
  type: 'planetary',
  surfaceLook: 'bands',
  // ...
  bandColors: {
    colorA: '#d8c39e',  // teinte claire dominante
    colorB: '#7a4926',  // teinte sombre
    colorC: '#c9774a',  // accent
    colorD: '#5a3d2c',  // secondaire
  },
}, DEFAULT_TILE_SIZE)
```

`buildGasPalette` se charge de répartir les bandes en respectant les zones et fuseaux, avec une variation déterministe pilotée par le seed.

## Palette métallique avancée

Pour un monde métallique, `metallicBands` accepte un tuple de 4 [`MetallicBand`](/api/sim/interfaces/MetallicBand) (creux → plaines → hauteurs → pics). Chaque bande peut spécifier `metalness`, `roughness`, `height`, `emissive`, `emissiveIntensity` :

```ts
const body = useBody({
  name: 'Forge-α',
  type: 'planetary',
  surfaceLook: 'metallic',
  metallicBands: [
    { color: '#1a1118', metalness: 0.95, roughness: 0.45 },                 // creux
    { color: '#3d2a2a', metalness: 0.75, roughness: 0.55 },                 // plaines
    { color: '#a47352', metalness: 0.65, roughness: 0.40 },                 // hauteurs
    { color: '#ffaa55', metalness: 0.30, roughness: 0.20,                   // pics
      emissive: '#ff5500', emissiveIntensity: 0.6 },
  ],
}, DEFAULT_TILE_SIZE)
```

Les champs absents tombent sur l'échelle par défaut (cf. `buildMetallicPalette`).

### Anatomie d'une `MetallicBand`

| Champ | Type | Défaut neutre (par slot) | Effet |
| ----- | ---- | ------------------------ | ----- |
| `color`             | `ColorInput`     | requis | Couleur de la bande (hex string ou `0xRRGGBB`) |
| `metalness`         | `0..1`           | `0.62 → 0.96` | Métalicité PBR — gravit avec le slot (les pics sont plus métalliques que les fonds) |
| `roughness`         | `0..1`           | `0.50 → 0.14` | Rugosité PBR — décroît avec le slot (les pics sont plus polis) |
| `height`            | `number` (world units) | `0.000 → 0.120` | **Décalage radial absolu** au-dessus de la surface du noyau, en unités monde |
| `emissive`          | `ColorInput`     | absent | Couleur émissive — quand omise, aucune émission n'est ajoutée |
| `emissiveIntensity` | `0..1`           | `1.0` (si `emissive` est défini) | Intensité du canal émissif |

::: tip `height` est en unités monde, pas en bandes
Contrairement aux palettes rocky/gas où la hauteur dérive de [`terrainBandLayout`](/api/core/functions/terrainBandLayout) (`i × layout.unit`), les `MetallicBand.height` sont passés **verbatim** au shader. La règle pratique : choisis des valeurs proportionnelles à `config.radius` — pour un corps `radius = 1`, le défaut neutre `0.000 → 0.120` couvre 12 % du rayon, ce qui reste lisible sans concurrencer la silhouette.
:::

::: warning `emissive` ne s'allume pas tout seul
`emissiveIntensity` est appliqué **uniquement** quand `emissive` est défini. Pousser `emissiveIntensity: 0.6` sans `emissive` est silencieusement ignoré — utile à savoir pour les UI de tuning.
:::

## Override total

Si vous voulez piloter chaque bande explicitement, passez `palette` à `useBody` (le 3e argument est `BodyRenderOptions`) :

```ts
import { useBody, type TerrainLevel } from '@cedric-pouilleux/stellex-js/core'
import * as THREE from 'three'

const palette: TerrainLevel[] = [
  { color: new THREE.Color('#0a0a14'), height: 0.0  },
  { color: new THREE.Color('#1f1f30'), height: 0.06 },
  { color: new THREE.Color('#3a3a55'), height: 0.12 },
  { color: new THREE.Color('#7e7e98'), height: 0.20 },
  { color: new THREE.Color('#e8e8ee'), height: 0.30 },
]

const body = useBody(config, DEFAULT_TILE_SIZE, { palette })
```

**Attention** : la longueur du tableau doit correspondre à `resolveTerrainLevelCount(radius, coreRadiusRatio)`. Sinon `getTileLevel` clampe et certaines tuiles partagent une bande.

::: warning Précédence — `palette` gagne tout
Quand `BodyRenderOptions.palette` est fourni, il **remplace entièrement** la palette auto-générée. Les ancres `terrainColorLow` / `terrainColorHigh` du `BodyConfig`, comme `bandColors` ou `metallicBands`, sont **ignorées** — la lib ne fusionne pas. Logique : `palette` est conçu pour les cas où vous classifiez par biome / climat / faction et avez besoin du contrôle total bande par bande ; mélanger silencieusement avec les ancres serait un footgun.

Ordre de précédence pour le rocky :

1. `BodyRenderOptions.palette` — full override, bande à bande
2. `BodyConfig.terrainColorLow / High` — ancres de la rampe par défaut
3. [`DEFAULT_TERRAIN_LOW_COLOR`](/api/core/variables/DEFAULT_TERRAIN_LOW_COLOR) / [`DEFAULT_TERRAIN_HIGH_COLOR`](/api/core/variables/DEFAULT_TERRAIN_HIGH_COLOR) — fallback neutre (gris bas → gris haut)

Pour le métallique, `metallicBands` joue le rôle des ancres (4 stops) ; pour le gazeux, c'est `bandColors` (4 stops). Dans tous les cas, `palette` les overshadow tous quand il est passé.
:::

## Continents discrets (rocheuses)

Par défaut, l'élévation d'une rocheuse vient d'un FBm simplex continu — résultat sur une planète humide : un moiré d'îles éparpillées plutôt que de vraies masses terrestres. Pour produire **des continents discrets** (style Pangée, archipel, supercontinents), `BodyConfig` expose deux champs optionnels :

| Champ | Plage | Défaut | Effet |
| ----- | ----- | ------ | ----- |
| `continentAmount` | `0..1` | `0` | Amplitude du masque voronoï ajouté à l'élévation. `0` désactive entièrement (rétrocompat exacte) |
| `continentScale` | `1..3` | `1` | Fréquence du voronoï — `1` = 1-2 supercontinents, `3` = archipel de petites îles |

```ts
const body = useBody({
  name: 'gaia',
  type: 'planetary',
  surfaceLook: 'terrain',
  liquidState: 'liquid',
  liquidCoverage: 0.6,
  continentAmount: 0.7,
  continentScale: 1.5,
  // ...
}, DEFAULT_TILE_SIZE)
```

Le mask est **déterministe du `name`** — deux planètes avec le même nom font les mêmes continents. La même formule (`continentMask3D`) tourne en CPU dans `BodySimulation` **et** en GLSL dans `liquidMask.glsl`, donc la classification des tuiles hexa et la silhouette de la sphère shader restent parfaitement synchronisées sur le trait de côte.

L'effet reste actif sur les rocheuses sèches (visible via la palette d'élévation : plateaux et dépressions macro).

## Anatomie d'un `TerrainLevel`

```ts
interface TerrainLevel {
  threshold:          number        // borne supérieure de la bande (`elevation < threshold`)
  height:             number        // hauteur monde au-dessus du noyau
  color:              THREE.Color   // couleur affichée
  emissive?:          THREE.Color   // canal émissif (palettes métalliques, peaks chauds)
  emissiveIntensity?: number        // intensité du canal émissif (`0..1`, défaut `1.0`)
  metalness?:         number        // PBR metalness (palettes métalliques)
  roughness?:         number        // PBR roughness
}
```

`threshold` et `height` sont **toujours** posés par les générateurs de palette ; les quatre champs PBR / émissifs sont optionnels et utilisés essentiellement par les palettes métalliques (cf. [Palette métallique avancée](#palette-m%C3%A9tallique-avanc%C3%A9e)).

::: tip Le tag « liquide » vit ailleurs
La distinction entre fond marin et continent **n'est pas** portée par la palette — elle est calculée au runtime par `BodySimulation` à partir de `seaLevelElevation`. C'est `body.liquid.setSeaLevel(...)` qui déplace la frontière, pas un champ de `TerrainLevel`.
:::
