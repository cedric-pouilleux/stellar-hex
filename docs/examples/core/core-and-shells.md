<script setup>
import CoreShellDemo    from '../../.vitepress/theme/demos/CoreShellDemo.vue'
import CoreShellDemoRaw from '../../.vitepress/theme/demos/CoreShellDemo.vue?raw'
import CoreShellVueRaw  from '../../.vitepress/theme/demos/CoreShellVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: CoreShellDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: CoreShellVueRaw,  lang: 'vue' },
]
</script>

# Noyau & coquilles

Tout corps non-stellaire est composé d'un **noyau solide** central et d'une **coquille** (sol + atmo) qui l'entoure. Le ratio entre les deux est piloté par `coreRadiusRatio`, ou dérivé d'une `gasMassFraction` via `deriveCoreRadiusRatio`.

Le noyau est rendu par `buildCoreMesh` — une sphère animée (shader procédural + lumière pulsante) qui sert de fond à toute excavation. Tant que le sol n'est pas creusé, le noyau reste **invisible** (occulté par les prismes hexagonaux). Pour le voir, il faut **miner des tuiles jusqu'à `elevation = 0`** et regarder à travers le trou.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <CoreShellDemo />
  </DemoBlock>
</ClientOnly>

Une dizaine de tuiles ont été pré-excavées au mount pour exposer le noyau. **Cliquez d'autres tuiles pour creuser plus** — la flamme et la lumière qui s'en échappent appartiennent au mesh du noyau.

## Anatomie

```
                ┌──────────────────────────┐
                │   atmosphère (shell)     │ ← bandes empilées
                │   sol (terrain hex)      │   au-dessus du noyau
        ┌───────┴──────────────────────────┴───┐
        │           NOYAU OPAQUE              │ ← buildCoreMesh
        │   (radius × coreRadiusRatio)        │   sphère animée
        └─────────────────────────────────────┘
```

| Couche | Module | Rôle |
| ------ | ------ | ---- |
| Noyau              | `buildCoreMesh`         | Sphère opaque inner — visible par les tuiles minées (band 0) |
| Sol (hex)          | `buildLayeredInteractiveMesh` (sol band) | Terrain hexagonal au-dessus du noyau |
| Atmo (hex)         | `buildLayeredInteractiveMesh` (atmo band) | Coquille atmosphérique |
| Smooth fallback    | `buildSmoothSphereMesh` | Sphère lisse procédurale, affichée en mode shader ou en vue atmosphère |

::: warning Précision sur la vue atmosphère
`body.view.set('atmosphere')` masque le sol mais affiche **également** la smooth sphere de fallback à la surface — donc le noyau reste invisible. La seule façon de voir le noyau est la **vue surface** (mode hex) avec des tuiles minées à band 0.
:::

## Trois façons de fixer le ratio

```ts
import { resolveCoreRadiusRatio, deriveCoreRadiusRatio, DEFAULT_CORE_RADIUS_RATIO } from '@cedric-pouilleux/stellexjs/core'
```

L'ordre de priorité dans `resolveCoreRadiusRatio(config)` :

1. **Override explicite** — `config.coreRadiusRatio` (entre `0` et `1`)
2. **Dérivation physique** — `deriveCoreRadiusRatio(config.gasMassFraction)`
3. **Défaut** — `DEFAULT_CORE_RADIUS_RATIO` (`0.55`)

```ts
// 1. Override direct — taille du noyau pilotée à la main
useBody({ type: 'planetary', surfaceLook: 'terrain', name: 'a', coreRadiusRatio: 0.85, /* … */ })

// 2. Dérivé d'une fraction massique d'enveloppe gazeuse
useBody({ type: 'planetary', surfaceLook: 'bands', name: 'b', gasMassFraction: 0.9, /* … */ })

// 3. Défaut (0.55)
useBody({ type: 'planetary', surfaceLook: 'terrain', name: 'c', /* … */ })
```

## Dérivation depuis `gasMassFraction`

`deriveCoreRadiusRatio(f)` résout un partage de volume bi-phase à partir de deux densités de référence exposées par la lib :

```ts
REF_SOLID_DENSITY = 5500  // kg/m³
REF_GAS_DENSITY   =  100  // kg/m³
```

Et calcule :

```
V_solid / V_total = (1 - f) / ((1 - f) + f · ρ_solid / ρ_gas)
coreRadiusRatio   = ∛(V_solid / V_total)
```

Cas limites :

| `gasMassFraction` | `coreRadiusRatio` | Forme |
| ----------------- | ----------------- | ----- |
| `0`     | `1.00` | Solide pur — pas d'enveloppe gazeuse |
| `0.5`   | `~0.40` | Coquille épaisse, noyau intermédiaire |
| `0.9`   | `~0.22` | Petit noyau, grosse coquille |
| `1`     | `0.00` | Pas de noyau — `buildCoreMesh` skip |

Vous pouvez aussi spécifier `coreRadiusRatio` directement et ignorer la dérivation.

## Conséquence sur la simulation

Le ratio noyau/coquille **détermine le nombre de bandes** d'élévation via [`resolveTerrainLevelCount`](/api/core/functions/resolveTerrainLevelCount) — la lib calcule en interne `round(shell / step)` où `shell = (1 - coreRadiusRatio) × radius` et `step` est anchored sur `DEFAULT_TILE_SIZE`. Le résultat est borné à un minimum interne (4 bandes) pour garantir une staircase utilisable même sur les coquilles très fines.

Plus le noyau est gros, plus la coquille est mince, **moins** il y a de bandes d'élévation. Un corps avec `coreRadiusRatio: 0.85` aura peut-être 4 bandes seulement (le minimum), tandis qu'un corps à coquille épaisse (`0.40`) en aura ~8.

C'est aussi ce qui borne **la profondeur d'excavation** : creuser une tuile descend par paliers de `terrainBandLayout(...).unit` jusqu'à révéler le noyau à `elevation = 0`.

## Excaver pour voir le noyau

```ts
if (body.kind !== 'planet') return
// Creuser une tuile jusqu'au noyau (elev 0)
body.tiles.sol.updateTileSolHeight(new Map([[tileId, 0]]))

// Creuser un cratère de plusieurs tuiles
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellexjs/sim'

const nMap   = buildNeighborMap(body.sim.tiles)
const queue  = [startTileId]
const updates = new Map<number, number>()
while (queue.length && updates.size < 12) {
  const id = queue.shift()!
  if (updates.has(id)) continue
  updates.set(id, 0)
  for (const n of getNeighbors(id, nMap)) queue.push(n)
}
body.tiles.sol.updateTileSolHeight(updates)
```

Le noyau émet sa propre lumière (`PointLight` parentée au mesh) qui ne passe à travers les tuiles que là où le sol est creusé.

## API exposée

| Symbole                | Module       | Rôle |
| ---------------------- | ------------ | ---- |
| `DEFAULT_CORE_RADIUS_RATIO`   | `physics/body` | Constante `0.55` |
| `REF_SOLID_DENSITY`           | `physics/body` | `5500 kg/m³` |
| `REF_GAS_DENSITY`             | `physics/body` | `100 kg/m³` |
| `deriveCoreRadiusRatio(f)`    | `physics/body` | `gasMassFraction → ratio` (pure) |
| `resolveCoreRadiusRatio(cfg)` | `physics/body` | Échelle de priorité (override → dérivé → défaut) |
| `buildCoreMesh({ radius, coreRadiusRatio })` | `render/shells/buildCoreMesh` | Mesh sphère inner |
| `body.tiles.sol.updateTileSolHeight(map)`    | `PlanetBody` handle | Mute la hauteur sol des tuiles (`0` = expose le noyau) |
| `body.getCoreRadius()`        | `Body` handle  | Rayon monde du noyau |
| `body.getSurfaceRadius()`     | `Body` handle  | Rayon monde de la surface (= `config.radius`) |

## Cas particulier : pas de noyau

Quand `coreRadiusRatio = 0` (équivalent `gasMassFraction = 1`), `buildCoreMesh` détecte le cas et **skip** la création du mesh. Le rendu se réduit à : sphère smooth procédurale + shell atmosphère + (optionnel) anneau.

### Anatomie d'une géante 100 % gaz

```ts
const jovian = useBody({
  type:           'planetary',
  surfaceLook:    'bands',
  name:           'PureJovian',
  radius:          1.5,
  rotationSpeed:   0.003,
  axialTilt:       0.18,
  gasMassFraction: 1,                  // → coreRadiusRatio = 0
  atmosphereThickness: 0.6,
}, DEFAULT_TILE_SIZE)
```

À ce point :

- **`buildCoreMesh` retourne un mesh placeholder vide** — pas de sphère opaque inner, pas de PointLight de noyau, zéro draw call.
- **La sol band collapse** — sa hauteur radiale (`(1 - coreRatio - atmoThickness) × radius`) tombe sous `MIN_SOL_BAND_FRACTION × radius` (5 %), donc la lib ré-injecte la guard pour préserver une sliver de sol. En pratique, un body avec `gasMassFraction = 1` et `atmosphereThickness ≥ 0.95` aura un sol pratiquement inexistant.
- **L'atmo shell occupe presque toute la silhouette visible** — `atmoOuterRadius = radius`, `atmoInnerRadius ≈ radius × (1 - atmoThickness)`.
- **Aucune profondeur d'excavation utile** — `updateTileSolHeight(map)` reste utilisable mais la sol band est trop fine pour produire un effet visible.

C'est le pattern à privilégier pour Jupiter, Neptune, et toute géante dont vous ne voulez **pas** que le noyau apparaisse à l'excavation. La distinction d'avec un `gasMassFraction = 0.93` (Jupiter réaliste) :

| | `gasMassFraction: 0.93` | `gasMassFraction: 1` |
| --- | --- | --- |
| `coreRadiusRatio` résolu | ~0.20 | 0.0 |
| Mesh noyau | Petit, visible si excavation | **Skipped** |
| Cas pure-gas testable en gameplay | Oui (mining lent jusqu'au noyau) | Non |
| Coût GPU | +1 sphère + 1 light | référence |

### Toggle « pas d'atmo » pareil ?

Symétrique : `atmosphereThickness = 0` (ou `hasAtmosphere(config) === false`) skip le shell atmo, le `atmoBoardMesh` (atmosphère cliquable) et le mesh atmo de la `LayeredInteractive`. Une planète tellurique sèche minimale (sans atmo, sans liquide) ne mount donc que le noyau + le sol hex + (option) un anneau.
