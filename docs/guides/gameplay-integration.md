# Intégrer du gameplay

`stellar-hex` rend des **planètes brutes** — géométrie hex, élévations quantifiées, niveau de la mer, palette résolue, état physique du liquide. Tout le reste — ressources, biomes, climats, factions, ennemis — vit dans votre code. Cette discipline est un **choix de design délibéré**, et ce guide explique comment brancher du gameplay par-dessus sans le combattre.

## La doctrine en une phrase

**La lib n'a pas de vocabulaire métier.** Elle expose des primitives géométriques + visuelles ; vous projetez votre catalogue de jeu dessus via les hooks de paint. Le commentaire d'en-tête de [sim.ts](sim.ts) le formule sans ambiguïté :

> Substance vocabulary (`'h2o'`, `'ch4'`, melting points, vapour pressure, phase partitions, atmosphere retention models, climate models…) lives entirely in caller code.

## Ce que la lib **ne fait pas** et pourquoi

| La lib ne… | Vous… | Raison |
| ---------- | ----- | ------ |
| ... ne lit aucune température | … calculez votre modèle thermique caller-side | Permet à la même lib de servir un sim « éducatif » et un Stellaris-like sans prendre parti |
| ... ne mappe pas substance → couleur (`'h2o'` → `#175da1`) | … gardez le catalogue substance dans votre code | Évite à la lib de porter une chimie qui vieillirait mal |
| ... ne dérive pas de phase depuis une condition | … poussez `liquidState: 'liquid' \| 'frozen' \| 'none'` | Push-only : votre modèle décide quand l'océan gèle |
| ... ne calcule pas d'orbites | … écrivez `body.group.position` chaque frame | Mécanique orbitale = game-domain, pas body-domain |
| ... ne place pas de ressources / biomes | … itérez `body.sim.tileStates` dans votre stratégie | Distribution = game logic, pas géométrie |
| ... ne gère pas la pause | … sautez `body.tick(dt)` si pause | Le caller possède son time source |
| ... ne dérive pas de couleur d'atmo | … poussez `tint` dans `buildAtmoShell` | Pareil — votre climat décide |

Le bénéfice : la lib reste **stable**, **portable** (Node.js, worker, browser), et **testable** sans monter de scène 3D.

## Les primitives de paint

Toute personnalisation passe par les primitives exposées sur `body.tiles`. Les boards `sol` et `atmo` sont **deux hexaspheres distinctes** (un id sol `42` et un id atmo `42` ne sont pas comparables), chacun avec son propre namespace.

```ts
// Planet only — narrow d'abord, les namespaces sol/atmo n'existent pas sur StarBody
if (body.kind === 'planet') {
  // Sol board (relief + excavation)
  body.tiles.sol.tileBaseVisual(id)            // → snapshot pré-blend (palette + PBR + submerged)
  body.tiles.sol.writeTileColor(id, rgb)       // → 1 tuile sol
  body.tiles.sol.applyOverlay(map)             // → batch sol
  body.tiles.sol.updateTileSolHeight(map)      // → mute la hauteur (excavation)

  // Atmo board (cliquable, pas de relief — null si atmosphereThickness === 0)
  body.tiles.atmo?.applyOverlay(map)           // → stamp sur la bande atmo

  // Aides cross-board
  body.tiles.paintSmoothSphere(map)            // → vue d'ensemble (smooth sphere)
  body.tiles.paintAtmoShell(map)               // → halo atmo procédural (K-NN)
}

// StarBody — tiles plat, pas de namespace sol/atmo
if (body.kind === 'star') {
  body.tiles.tileBaseVisual(id)
  body.tiles.writeTileColor(id, rgb)
}
```

Le tableau complet :

| Primitive | Branche | Effet | Coût |
| --------- | ------- | ----- | ---- |
| `tiles.sol.tileBaseVisual(id)` / `tiles.tileBaseVisual(id)` (star) | planet (sol) / star | Snapshot palette + PBR + flag `submerged` | O(1), aucune mutation |
| `tiles.sol.writeTileColor` / `tiles.atmo?.writeTileColor` / `tiles.writeTileColor` (star) | planet / planet / star | Patch sur 1 tuile dans le buffer vertex | O(1), aucun rebuild GPU |
| `tiles.sol.applyOverlay(map)` / `tiles.atmo?.applyOverlay(map)` | planet | Batch de stamps par board | O(n entrées) |
| `tiles.sol.updateTileSolHeight(map)` | planet | Mute la hauteur des prismes sol | O(n) + recompute neighbours |
| `tiles.paintSmoothSphere(map)` | planet | Stamp sur la sphère lisse (vue d'ensemble) | O(vertices) |
| `tiles.paintAtmoShell(map)` | planet | Stamp K-NN sur le halo procédural | O(vertices × K) |

Aucune ne **rebuilde** la géométrie ou ne recompile les shaders. Vous pouvez donc les appeler par tick.

## Walkthrough — distribution → paint → mutation

Cas d'école : distribuer 3 ressources sur une planète rocheuse, peindre les tuiles correspondantes, et permettre l'excavation.

### 1. Catalogue caller-side

```ts
// Votre code, hors lib
type Resource = 'iron' | 'water' | 'coal'

const RESOURCE_COLORS: Record<Resource, { r: number; g: number; b: number }> = {
  iron:  { r: 0.45, g: 0.35, b: 0.25 },
  water: { r: 0.20, g: 0.55, b: 0.85 },
  coal:  { r: 0.10, g: 0.10, b: 0.12 },
}
```

### 2. Stratégie de distribution

Vous itérez les `tileStates` du body et appliquez vos règles :

```ts
import { seededPrng } from '@cedric-pouilleux/stellar-hex/sim'

function distributeResources(body: PlanetBody): Map<number, Resource> {
  const out = new Map<number, Resource>()
  const sea = body.sim.seaLevelElevation
  const rng = seededPrng(body.config.name + ':resources')

  for (const [id, state] of body.sim.tileStates) {
    if (state.elevation <= sea)              out.set(id, 'water')
    else if (state.elevation <= sea + 1)     out.set(id, 'coal')
    else if (rng() < 0.25)                   out.set(id, 'iron')
  }
  return out
}
```

::: tip Scopez vos seeds
Préfixez le nom du body par un scope (`':resources'`, `':factions'`, …) pour que vos générateurs soient indépendants entre eux et reproductibles entre runs.
:::

### 3. Peindre

```ts
function paint(body: PlanetBody, distribution: Map<number, Resource>) {
  const colors = new Map<number, { r: number; g: number; b: number }>()
  for (const [id, res] of distribution) {
    colors.set(id, RESOURCE_COLORS[res])
  }

  // Vue interactive (mesh hex)
  body.tiles.sol.applyOverlay(colors)

  // Vue d'ensemble (smooth sphere) — facultatif mais reste cohérent en zoom
  body.tiles.paintSmoothSphere(colors)
}
```

### 4. Mutation runtime — excavation

Quand un joueur mine une tuile, vous pouvez :

- abaisser la hauteur du prisme,
- repeindre la tuile avec la couleur sous-jacente (mineral exposé).

```ts
function mine(body: PlanetBody, tileId: number) {
  // Descendre d'un palier (ou jusqu'à 0 pour exposer le noyau)
  const state = body.sim.tileStates.get(tileId)!
  body.tiles.sol.updateTileSolHeight(new Map([[tileId, Math.max(0, state.elevation - 1)]]))

  // Repeindre — utilisez tileBaseVisual pour récupérer la palette d'origine
  const base = body.tiles.sol.tileBaseVisual(tileId)
  if (base) {
    body.tiles.sol.writeTileColor(tileId, { r: base.r, g: base.g, b: base.b })
  }
}
```

`tileBaseVisual` retourne aussi `submerged: boolean` — pratique pour skipper la dépeinture sur les tuiles océan (vous voulez probablement garder la couleur du liquide).

## Pattern « ressource live » (overlay éphémère)

Pour des effets temporaires (zone de capture qui clignote, propagation d'incendie), `applyOverlay` accepte une mutation par tick :

```ts
function tickFire(body: PlanetBody, fireMap: Map<number, number>) {
  const colors = new Map<number, { r: number; g: number; b: number }>()
  for (const [id, intensity] of fireMap) {
    colors.set(id, {
      r: 1.0,
      g: 0.4 * (1 - intensity),
      b: 0.0,
    })
  }
  body.tiles.sol.applyOverlay(colors)
}
```

Pas de coût GPU additionnel — c'est un patch in-place sur le `Float32BufferAttribute`.

## Pattern « atmo polluée »

La bande atmo est cliquable + peignable indépendamment du sol (cf. [Atmosphère jouable](/examples/atmosphere/playable)) :

```ts
if (body.tiles.atmo) {
  body.tiles.atmo.applyOverlay(new Map([
    [42, { r: 0.95, g: 0.45, b: 0.85 }],   // pollution rose
  ]))
}
```

Les ids sol et atmo **ne sont pas comparables** (deux hexaspheres distinctes). Pour relier une tuile sol à la tuile atmo « au-dessus », faites un raycast vertical caller-side, ou utilisez le projecteur de centre de tuile (cf. [Composants de scène](/guides/scene-components#tilecenterprojector)).

## Persistance

La doctrine pousse à **séparer ce que la lib produit de ce que votre jeu mute** :

| Donnée | Source de vérité | À sérialiser ? |
| ------ | ---------------- | --------------- |
| Géométrie / élévations | `body.sim` (rejouable depuis `name`) | Non — re-générée |
| Niveau de la mer initial | Idem | Non |
| Distribution de ressources | Votre code | Oui — dans votre store |
| Tuiles minées | Votre code (delta vs la sim initiale) | Oui — `Map<tileId, elevationDelta>` |
| Tuiles peintes runtime (faction, fire…) | Votre code | Oui — `Map<tileId, FactionId>` |
| `liquidState` modifié runtime | Votre `BodyConfig` | Oui — push back sur le config |

Au reload, vous re-générez la planète depuis `BodyConfig`, puis appliquez vos deltas via `updateTileSolHeight` + `applyOverlay`. La lib ne stocke rien que vous ne lui ayez donné.

## Le playground comme référence

`playground/src/lib/paint/` ([GitHub](https://github.com/cedric-pouilleux/stellar-hex/tree/main/playground/src/lib/paint)) est une implémentation complète du pattern :

- `bodyPaint.ts` — pipeline d'orchestration
- `clusterDistribution.ts` — distribution par clusters BFS
- `mineralCatalog.ts` / `gasCatalog.ts` / `liquidCatalog.ts` — catalogues caller-side
- `temperaturePalette.ts` — modèle thermique → ancres `terrainColorLow/High`

C'est le template recommandé pour un projet de jeu sérieux — copier-coller, adapter le catalogue, c'est tout.

## Voir aussi

- [Concepts fondamentaux §5 — Responsabilités du caller](/guides/core-concepts#_5-les-responsabilit%C3%A9s-du-caller)
- [Mode jouable](/examples/hex-tiles/playable-mode) — survol + clic + paint
- [Voisinage & BFS](/examples/hex-tiles/neighbors) — pathfinding et diffusion
- [Atmosphère jouable](/examples/atmosphere/playable) — paint sur la bande atmo
