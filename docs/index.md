---
layout: home

hero:
  name: Stellar Hex
  text: Corps stellaires procéduraux
  tagline: Géométrie hexagonale, physique, simulation et rendu — pour Three.js et Vue 3.
  actions:
    - theme: brand
      text: Démarrer
      link: /guides/getting-started
    - theme: alt
      text: Voir les exemples
      link: /examples/body-types/rocky
    - theme: alt
      text: API
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/cedric-pouilleux/stellar-hex

features:
  - title: Trois points d'entrée
    details: Importez depuis <code>/sim</code> pour la logique pure, <code>/core</code> pour Three.js, ou <code>/</code> pour la surface Vue + TresJS complète.
  - title: Déterministe
    details: Un seed pilote chaque étape de génération — même seed, même planète, à chaque fois.
  - title: Quatre types de corps
    details: Rocheux, métallique, gazeux, étoile — chacun avec sa palette, son shader et ses couches dédiées.
  - title: Tuiles hexagonales
    details: Hexasphère subdivisible, voisinage 6-way, raycasting accéléré et overlays par tuile.
  - title: Atmosphère, anneaux, océans
    details: Couches modulaires assemblées via <code>useBody</code> ou les composants <code>&lt;Body&gt;</code> et <code>&lt;BodyRings&gt;</code>.
  - title: Headless-ready
    details: La couche <code>/sim</code> n'a aucune dépendance WebGL — backend, worker ou CLI.
---

## Aperçu en 30 secondes

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 6)
const sim = initBodySimulation(tiles, {
  name:                'Kepler-186f',
  type:                'rocky',
  radius:               1,
  rotationSpeed:        0.005,
  axialTilt:            0.41,
  atmosphereThickness:  0.5,
})

// sim.tileStates, sim.seaLevelElevation, sim.hasLiquidSurface…
```

Trois lignes pour générer une planète déterministe, sans WebGL.
Pour brancher la sim sur une scène, voir [Three.js](./guides/threejs-integration) ou [Vue + TresJS](./guides/vue-integration).
