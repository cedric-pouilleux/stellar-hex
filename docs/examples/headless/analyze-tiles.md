<script setup>
import { headlessAnalyzeCode } from '../../.vitepress/theme/code/headless-analyze'

const tabs = [
  { label: 'Three.js', code: headlessAnalyzeCode, lang: 'ts' },
  { label: 'Vue',      code: headlessAnalyzeCode, lang: 'ts' },
]
</script>

# Analyse des tuiles

Trois recettes courantes pour exploiter `BodySimulation` sans rendu : histogramme des bandes d'élévation, détection des côtes, recherche du plus grand continent.

<DemoBlock :tabs="tabs">
  <div class="no-demo">
    Snippet headless — exécutez-le dans Node.js, un worker ou un test Vitest.
  </div>
</DemoBlock>

## 1. Histogramme par bande

```ts
const histogram = new Map<number, number>()
for (const [, state] of sim.tileStates) {
  histogram.set(state.elevation, (histogram.get(state.elevation) ?? 0) + 1)
}
```

La sim utilise une **quantification équi-fréquence** : chaque bande reçoit approximativement le même nombre de tuiles (à ±5 %). Si l'histogramme est très déséquilibré, vérifiez `noiseRidge` ou `reliefFlatness` — ils peuvent reshape la distribution.

## 2. Tuiles côtières

```ts
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellex-js/sim'

const nMap = buildNeighborMap(tiles)
const sea  = sim.seaLevelElevation

const coastline = [...sim.tileStates].filter(([id, state]) => {
  if (state.elevation <= sea) return false  // ignorer les fonds marins
  return getNeighbors(id, nMap).some(nid => {
    const n = sim.tileStates.get(nid)
    return n && n.elevation <= sea
  })
})
```

Une « tuile côtière » est une tuile **émergée** qui touche au moins une tuile **immergée**. Utile pour : placer des ports, calculer un score d'habitabilité, dessiner un overlay côte.

## 3. Plus grand continent

```ts
const visited = new Set<number>()
let biggest = 0
for (const [id, state] of sim.tileStates) {
  if (visited.has(id) || state.elevation <= sea) continue
  let size = 0
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    if (visited.has(cur)) continue
    const s = sim.tileStates.get(cur)
    if (!s || s.elevation <= sea) continue
    visited.add(cur)
    size++
    for (const nid of getNeighbors(cur, nMap)) queue.push(nid)
  }
  if (size > biggest) biggest = size
}
```

Composante connexe BFS classique. Sur un corps standard (`tileSize=0.05`, ~5 000 tuiles), c'est `O(n)` et tient en quelques ms.

## Pourquoi headless ?

- **Validation de seed** — itérez 1 000 noms et gardez ceux dont le plus grand continent fait > 30 % de la surface.
- **Génération de batch** — pré-calculez 100 corps pour un éditeur de niveau.
- **Tests de régression** — vérifiez qu'un changement de bruit ne casse pas la couverture liquide cible.

Aucun de ces cas n'a besoin de WebGL — la lib reste utilisable depuis CI, scripts CLI, fonctions serverless.
