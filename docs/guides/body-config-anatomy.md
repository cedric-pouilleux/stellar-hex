# Anatomie d'un `BodyConfig`

`BodyConfig` est l'unique objet que vous passez à [`useBody`](/api/core/functions/useBody). Plutôt qu'une interface plate, c'est une **union discriminée** sur `type` (`'planetary'` | `'star'`), composée par **intersection** de 4 sous-profiles orthogonaux. Cette page sert de carte mentale : que met-on, où, et pourquoi.

```ts
type PlanetConfig = PlanetIdentity & PlanetPhysics & BodyNoiseProfile & PlanetVisualProfile
type StarConfig   = StarIdentity   & StarPhysics   & BodyNoiseProfile
type BodyConfig   = PlanetConfig | StarConfig
```

> Pour la motivation conceptuelle (pourquoi une union discriminée, sim vs render, déterminisme), voir [Concepts fondamentaux](./core-concepts).

---

## 1. Identity — qui est ce corps ?

Champs minimaux pour identifier le corps. Le `name` est la **graine déterministe** : deux corps avec le même `name` produisent les mêmes tuiles, le même relief, la même variation visuelle.

| Champ | Type | Branches | Rôle |
| ----- | ---- | -------- | ---- |
| `type` | `'planetary' \| 'star'` | les deux | Discriminant — narrowing TypeScript |
| `name` | `string` | les deux | Seed déterministe pour toute génération procédurale |
| `surfaceLook?` | `'terrain' \| 'bands' \| 'metallic'` | planet | Archétype visuel — pilote palette + matériau + shader |
| `spectralType` | `'O' \| 'B' \| 'A' \| 'F' \| 'G' \| 'K' \| 'M'` | star | Classification Morgan-Keenan — pilote toutes les dérivations stellaires (palette, granulation, godrays) |

Référence : [`PlanetIdentity`](/api/sim/interfaces/PlanetIdentity), [`StarIdentity`](/api/sim/interfaces/StarIdentity).

## 2. Physics — géométrie, rotation, structure radiale

Cœur physique partagé + extensions planet-only. La lib est **agnostique du climat** : aucun champ de température n'est lu, le caller pousse les conséquences (couleur d'océan, état liquide…) via les profiles visuels.

### Cœur partagé (`BodyPhysicsCore`)

| Champ | Type | Défaut | Rôle |
| ----- | ---- | ------ | ---- |
| `radius` | `number` | requis | Rayon visuel (world units). Pilote aussi le nombre de bandes de terrain. |
| `rotationSpeed` | `number` | requis | Auto-rotation (rad/s). |
| `axialTilt` | `number` | requis | Inclinaison axiale (radians). |
| `mass?` | `number` | dérivé | Masse en masses terrestres. |
| `coreRadiusRatio?` | `number` | `0.55` | Ratio noyau/silhouette. Override > dérivation `gasMassFraction` > défaut. |

### Planet-only (`PlanetPhysics`)

| Champ | Type | Défaut | Rôle |
| ----- | ---- | ------ | ---- |
| `atmosphereThickness?` | `[0, 1]` | par `surfaceLook` | Fraction radiale réservée à la coquille atmo. `0` = pas d'atmo. |
| `atmosphereOpacity?` | `[0, 1]` | par `surfaceLook` | Opacité du halo en vue shader. |
| `gasMassFraction?` | `[0, 1]` | — | Fraction massique d'enveloppe gazeuse — dérive `coreRadiusRatio` quand omis. |
| `liquidState?` | `'liquid' \| 'frozen' \| 'none'` | `'none'` | Phase de surface. `'liquid'` monte une coquille animée ; `'frozen'` est caller-owned. |
| `liquidCoverage?` | `[0, 1]` | `0.5` | Proportion de tuiles sous le niveau liquide à la naissance du corps. |

> Les invariants subtils (le 5 % minimum de bande sol, l'ordre de résolution `coreRadiusRatio`) sont détaillés dans [Concepts fondamentaux §8](./core-concepts#_8-trois-invariants-qui-surprennent).

Référence : [`PlanetPhysics`](/api/sim/interfaces/PlanetPhysics), [`StarPhysics`](/api/sim/type-aliases/StarPhysics).

## 3. NoiseProfile — relief et continents

Profile fBm partagé planet/star (les étoiles passent en `flatSurface = true` au niveau stratégie, le bruit est généré mais aplati). Toutes les valeurs sont optionnelles.

| Champ | Type | Défaut | Rôle |
| ----- | ---- | ------ | ---- |
| `noiseScale?` | `number` | `1.4` | Fréquence simplex de base. |
| `noiseOctaves?` | `number` | `1` | Nombre d'octaves fBm sommées. |
| `noisePersistence?` | `(0, 1]` | `0.5` | Décroissance d'amplitude par octave. |
| `noiseLacunarity?` | `number` | `2` | Multiplicateur de fréquence par octave. |
| `noisePower?` | `number` | `1` | Reshape `sign(n) * |n|^p` — affecte le shader, pas les bandes. |
| `noiseRidge?` | `[0, 1]` | `0` | Mix vers ridge-multifractal (crêtes pointues). |
| `continentAmount?` | `[0, 1]` | `0` | Masque voronoï basse fréquence — produit des continents discrets vs moiré FBm pur. |
| `continentScale?` | `[1, 3]` | `1` | Fréquence du masque continents — moins, plus gros. |
| `reliefFlatness?` | `[0, 1]` | `0` | Bias post-quantisation vers la bande la plus haute. `1` = perfectement plat à `radius`. |

Référence : [`BodyNoiseProfile`](/api/sim/interfaces/BodyNoiseProfile). Voir aussi l'exemple [Profil de bruit](/examples/relief/noise-profile).

## 4. VisualProfile — palette et features décoratives (planet-only)

Tunables visuels inline sur le config. Les **étoiles n'ont pas de visual profile** : leur look est entièrement dérivé de `spectralType`.

| Champ | Type | Rôle |
| ----- | ---- | ---- |
| `liquidColor?` | `ColorInput` | Requis si `liquidState !== 'none'` — la lib n'a pas de fallback chimique. |
| `bandColors?` | `{ colorA, colorB, colorC, colorD }` | Palette 4 stops pour gas giants — caller-owned (Jupiter, Neptune…). |
| `terrainColorLow?` | `ColorInput` | Ancre basse de la rampe rocheuse (bande la plus courte). |
| `terrainColorHigh?` | `ColorInput` | Ancre haute de la rampe rocheuse (bande la plus haute). |
| `metallicBands?` | `[MetallicBand, ×4]` | Palette 4 bandes pour corps métalliques (cratère → plaines → highlands → pics). |
| `hasRings?` | `boolean` | Active un système d'anneaux décoratif. |

> `bandColors`, `metallicBands`, `terrainColor*` sont **ignorés** quand vous passez un `palette` complet via les options de `useBody` (cf. [Palettes & terrain](./palettes-and-terrain)). La lib ne fusionne pas — c'est tout ou rien, par design.

Référence : [`PlanetVisualProfile`](/api/sim/interfaces/PlanetVisualProfile), [`MetallicBand`](/api/sim/interfaces/MetallicBand).

> **Cracks et lava** ne sont pas dans `BodyConfig` — leur intensité vit sur [`BodyVariation`](./variation) (`crackIntensity`, `lavaIntensity`, `lavaColor`). C'est intentionnel : ce sont des effets visuels décidés par le gameplay, pas des propriétés physiques.

---

## Options de `useBody(config, tileSize, options?)`

Le second argument `tileSize` pilote la taille apparente des hexagones (subdivisions dérivées). Le troisième est un sac d'options orthogonales — la plupart sont des **hooks d'intégration** plutôt que des paramètres procéduraux.

| Option | Type | Quand l'utiliser |
| ------ | ---- | ---------------- |
| `sunLight?` | `PointLight \| DirectionalLight \| null` | Quasi-toujours. La lib lit la position monde à chaque `tick()` pour pousser la direction lumière dans les shaders (terminator, godrays, halo atmo). Partagez **la même instance** entre tous les corps d'un système. |
| `palette?` | `TerrainLevel[]` | Quand vous voulez classifier par biome / climat / faction et imposer chaque bande. **Remplace entièrement** la palette auto-générée — les ancres `terrainColor*` / `bandColors` / `metallicBands` du config sont alors ignorées. |
| `variation?` | `BodyVariation` | Vous voulez pinner une identité visuelle (intensité fissures, lave, granulation…) plutôt que la dériver du `name`. Sinon, dérivée auto. Voir [Variation visuelle](./variation). |
| `quality?` | `RenderQuality` | Profil de qualité (subdivisions atmo, coût des shaders). À passer si vous gérez plusieurs niveaux globaux. |
| `graphicsUniforms?` | `GraphicsUniforms` | Pool d'uniformes graphiques partagé entre corps. Voir [Graphics uniforms](./graphics-uniforms). |
| `hoverChannel?` | `HoverChannel` | Canal partagé hover/sélection. Utile quand plusieurs UI (panneau d'info, surbrillance) doivent suivre la même tuile. |
| `hoverCursor?` | `HoverCursorConfig` | Curseur de survol custom — style unique. Voir [Curseur de survol](./hover-cursor). |
| `hoverCursors?` | `HoverCursorPresets` | Plusieurs presets nommés, swappés à runtime (mode build vs combat, etc.). |
| `defaultCursor?` | `string` | Nom du preset initial quand `hoverCursors` est fourni. |

Si vous ne savez pas par où commencer : `sunLight` suffit pour un rendu correct. Tout le reste est de l'intégration avancée.

---

## Exemple — planète rocheuse minimale

```ts
import type { PlanetConfig } from '@cedric-pouilleux/stellexjs/sim'
import { useBody } from '@cedric-pouilleux/stellexjs/core'

const config: PlanetConfig = {
  // identity
  type:          'planetary',
  name:          'Kepler-22b',
  surfaceLook:   'terrain',
  // physics
  radius:        12,
  rotationSpeed: 0.001,
  axialTilt:     0.4,
  liquidState:   'liquid',
  liquidCoverage: 0.6,
  // noise
  continentAmount: 0.7,
  // visual
  liquidColor:   '#1d6fa5',
  terrainColorLow:  '#3a5a2b',
  terrainColorHigh: '#d8d3c2',
}

const body = useBody(config, /* tileSize */ 0.5, { sunLight })
```

## Exemple — étoile

```ts
import type { StarConfig } from '@cedric-pouilleux/stellexjs/sim'

const sun: StarConfig = {
  type:          'star',
  name:          'Sol',
  spectralType:  'G',
  radius:        80,
  rotationSpeed: 0.0002,
  axialTilt:     0,
}

const body = useBody(sun, /* tileSize */ 2)
```

Aucune palette, aucune ancre de couleur : tout dérive de `spectralType`. Tenter d'assigner `surfaceLook` ou `metallicBands` ici provoque une erreur **à la compilation** — c'est le bénéfice principal de l'union discriminée.

---

## Pour aller plus loin

- [Concepts fondamentaux](./core-concepts) — déterminisme, sim vs render, invariants
- [Variation visuelle](./variation) — l'autre côté du couple physique/visuel
- [Palettes & terrain](./palettes-and-terrain) — quand le `VisualProfile` ne suffit plus
- [API avancée](./advanced-api) — résolveurs (`bodyOuterRadius`, `resolveCoreRadiusRatio`…) pour pré-calculer sans allouer de mesh
- Pages d'exemples par type : [rocky](/examples/body-types/rocky), [metallic](/examples/body-types/metallic), [gas](/examples/body-types/gas), [star](/examples/body-types/star)
