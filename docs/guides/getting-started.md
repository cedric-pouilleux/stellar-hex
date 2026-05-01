# Démarrer

`@cedric-pouilleux/stellar-hex` est un générateur procédural de corps stellaires (planètes rocheuses, géantes gazeuses, planètes métalliques, étoiles). Il livre **trois points d'entrée** indépendants pour que vous n'importiez que le strict nécessaire.

## Trois points d'entrée

| Point d'entrée | Contenu | Cas d'usage |
| -------------- | ------- | ----------- |
| `/sim`  | TypeScript pur — géométrie hex, physique, simulation | Backend, worker, CLI |
| `/core` | Tout ce qui précède + Three.js (shaders, matériaux, builders) | Consommateur Three.js sans Vue |
| `/`     | Tout ce qui précède + composants Vue + TresJS | Application Vue 3 / TresJS |

Le sous-paquet `/sim` n'a **aucune dépendance WebGL** : il peut tourner dans Node.js sans `jsdom`. `/core` ajoute Three.js. La racine ajoute Vue + TresJS.

## Installation

```bash
npm install @cedric-pouilleux/stellar-hex three simplex-noise

# Optionnel — uniquement si vous utilisez le surface Vue
npm install vue @tresjs/core
```

`three` et `simplex-noise` sont des `peerDependencies`. Vue et TresJS sont **optionnels** : sans eux, vous pouvez consommer `/core` ou `/sim` sans avertissement.

## Hello, planète

Ce snippet construit une planète rocheuse déterministe en moins de 10 lignes — sans WebGL.

```ts
import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 6) // rayon=1, subdivisions=6
const sim = initBodySimulation(tiles, {
  name:                'demo-body',
  type:                'planetary',
  surfaceLook:         'terrain',
  radius:               1,
  rotationSpeed:        0.005,
  axialTilt:            0.41,
  atmosphereThickness:  0.5,
})

console.log(sim.tileStates.size)        // nb de tuiles hexagonales
console.log(sim.seaLevelElevation)      // bande d'élévation du niveau de la mer
console.log(sim.hasLiquidSurface)       // true si un liquide (océan / lave) couvre des tuiles
console.log(sim.liquidCoverage)         // fraction de tuiles immergées (0–1)
```

Le résultat est entièrement sérialisable : vous pouvez le générer côté serveur et l'expédier au client tel quel.

## Pourquoi cette lib (et pas Three.js « tout court ») ?

`stellar-hex` part d'un postulat simple : **un corps stellaire est composé de géométrie + état physique + apparence**, et ces trois préoccupations sont orthogonales. La lib industrialise les trois, et **s'arrête là**. Tout ce qui concerne le gameplay (orbites, factions, ressources, climat) reste dans votre code.

Ce que vous gagnez :

- **Déterminisme** — un seed (`name`) reproduit byte-à-byte la même planète, du serveur au client.
- **Headless-ready** — la sim tourne sans WebGL (Node, worker, CI).
- **Type safety** — `BodyConfig` est une union discriminée, le compilateur rejette à la compile les configs invalides (`spectralType` sur une planète, `metallicBands` sur une étoile).
- **Pipeline visuel cohérent** — palette, atmo, anneaux, ombres analytiques, hover unifié — tout est branché par défaut.

Ce que vous perdez (et c'est volontaire) :

- **Pas de mécanique orbitale** — vous écrivez `body.group.position` chaque frame.
- **Pas de chimie** — `liquidState`, `liquidColor`, `bandColors` sont des **états résolus** que votre catalogue calcule.
- **Pas de pause/replay built-in** — vous gérez le `dt` que vous passez à `body.tick()`.
- **Pas de catalogue de ressources** — vous projetez le vôtre via les hooks de paint.

Si vous voulez juste afficher une sphère texturée dans Three.js, `THREE.SphereGeometry` + `MeshStandardMaterial` suffit. `stellar-hex` justifie son coût quand vous voulez : un système solaire procédural reproductible, des tuiles cliquables avec gameplay, une intégration headless serveur, des shaders procéduraux unifiés sur quatre types de corps.

Le guide [Intégrer du gameplay](./gameplay-integration) détaille comment brancher votre catalogue par-dessus.

## Pour aller plus loin

- [Concepts fondamentaux](./core-concepts) — `BodyConfig`, déterminisme, sim vs render
- [Three.js (vanille)](./threejs-integration) — brancher la simulation sur une scène
- [Vue 3 + TresJS](./vue-integration) — composants `<Body>`, `<BodyRings>`
- [Composants de scène](./scene-components) — `<BodyController>`, `<TileCenterProjector>`, `<ShadowUpdater>` standalone
- [Variation visuelle](./variation) — `BodyVariation` et le partage physics/visual
- [Intégrer du gameplay](./gameplay-integration) — paint, distribution, persistance
- [Headless / serveur](./headless-simulation) — workers, CLI, batch
