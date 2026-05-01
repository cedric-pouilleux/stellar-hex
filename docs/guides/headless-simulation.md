# Simulation headless

Quand vous n'avez besoin que de la **couche de données déterministe** — élévations par tuile, niveau de la mer, masque liquide, voisinage — importez depuis `/sim`. Pas de Three.js, pas de WebGL, pas de DOM.

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 5) // rayon=1, subdivisions=5
const sim = initBodySimulation(tiles, {
  name:           'Worker-Body-42',
  type:           'planetary',
  surfaceLook:    'terrain',
  radius:          1,
  rotationSpeed:   0.005,
  axialTilt:       0.41,
})

// Tout ce qui suit est sérialisable.
console.log(sim.tileStates.size)
console.log(sim.liquidCoverage)
console.log(sim.hasLiquidSurface)
console.log(sim.seaLevelElevation)
```

## Ce qui est exporté

| Symbole | Type | Usage |
| ------- | ---- | ----- |
| `generateHexasphere`   | fonction | Subdivise une icosphère en tuiles hex |
| `initBodySimulation`   | fonction | Calcule élévations quantifiées, niveau de la mer, couverture liquide |
| `buildNeighborMap`     | fonction | Graphe d'adjacence 6-way |
| `getNeighbors`         | fonction | Voisins d'une tuile par id |
| `resolveStarData`      | fonction | Lookup spectral → temp/rayon/luminosité |
| `toStarParams`         | fonction | `StarPhysicsInput` → params shader |
| `hasSurfaceLiquid`     | fonction | Predicate liquide en surface (lit `liquidState`) |
| `deriveCoreRadiusRatio`| fonction | `gasMassFraction` → ratio noyau/visuel |
| `resolveCoreRadiusRatio` | fonction | Ordre de résolution explicite → dérivé → défaut |
| `SPECTRAL_TABLE`, `DEFAULT_TILE_SIZE`, `REF_STAR_*`, `REF_*_DENSITY` | constantes | Catalogues et références |

Plus tous les types : `BodyConfig` (union discriminée `PlanetConfig | StarConfig`), `PlanetConfig`, `StarConfig`, `BodyIdentity`, `PlanetIdentity`, `StarIdentity`, `BodyPhysics`, `BodyPhysicsCore`, `PlanetPhysics`, `StarPhysics`, `BodyNoiseProfile`, `PlanetVisualProfile` (alias `BodyVisualProfile`), `StarPhysicsInput`, `Tile`, `HexasphereData`, `TileState`.

## Pourquoi headless ?

- **Pré-calcul serveur** — générez une fois, mettez en cache, expédiez l'état.
- **Workers** — sortez la sim du thread principal sans bundler Three.js.
- **CLI / outillage** — dump par-tuile en CSV, validation de seeds, batch.
- **Tests** — reproductibilité parfaite, pas de mock GL.

Le frontend reconstruit géométrie et matériaux à partir du **même seed** : seul le `BodyConfig` traverse le réseau.

## Pattern serveur → client

```ts
// Côté serveur (Node.js)
import { initBodySimulation, generateHexasphere } from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 6)
const sim       = initBodySimulation(tiles, config)

return { config, snapshot: serializeSim(sim) }

// Côté client (Vue + TresJS)
import { useBody, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellar-hex'

const body = useBody(config, DEFAULT_TILE_SIZE)
// body.sim a les mêmes valeurs que `snapshot` — déterministe.
```

## Voisinage et BFS

```ts
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellar-hex/sim'

const map = buildNeighborMap(tiles)
const visited = new Set<number>()
const queue   = [startTileId]
while (queue.length) {
  const id = queue.shift()!
  if (visited.has(id)) continue
  visited.add(id)
  for (const n of getNeighbors(id, map)) {
    if (!visited.has(n)) queue.push(n)
  }
}
```

Voir [Voisinage & BFS](/examples/hex-tiles/neighbors) pour un exemple animé.

## Ressources et chimie

La lib **n'a pas** de notion de ressources, ni de chimie. Le seul flag de présence d'un liquide est `BodyPhysics.liquidState` (`'liquid' | 'frozen' | 'none'`) ; l'identité de la substance (eau, méthane, fer fondu…) reste dans votre catalogue. Lancez votre propre stratégie de distribution sur le `sim` retourné (champs `tiles` / `tileStates` / `seaLevelElevation` / `hasLiquidSurface`) et conservez le résultat dans votre domaine — état de jeu, save persistante, store Pinia.

`playground/src/lib/paint/` est une implémentation de référence (placement de minerais, peinture de tuiles, excavation).
