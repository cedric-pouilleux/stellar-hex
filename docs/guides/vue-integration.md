# Intégration Vue 3 + TresJS

La racine `@cedric-pouilleux/stellar-hex` ajoute des **composants Vue** par-dessus `/core`. Elle suppose `vue@^3.5` et `@tresjs/core@^5.8` installés dans votre projet.

## Composants exportés

| Composant | Rôle |
| --------- | ---- |
| `<Body>`                | Wrapper complet (mesh + atmo + anneaux + ombres) |
| `<BodyController>`      | Animation interne (rotation, drag, pose externe) |
| `<BodyRings>`           | Disque d'anneaux planétaires |
| `<ShadowUpdater>`       | Mise à jour des uniforms d'ombres entre corps |
| `<TileCenterProjector>` | Projecteur du centre d'une tuile |

## Usage minimal — `<Body>` dans TresJS

Le composant `<Body>` consomme un handle `useBody()` et pilote rotation, nuages, anneaux et hover via des **props réactives**.

```vue
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import {
  Body,
  useBody,
  DEFAULT_TILE_SIZE,
} from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

const config: BodyConfig = {
  name:                'Home',
  type:                'planetary',
  surfaceLook:         'terrain',
  radius:               1,
  rotationSpeed:        0.01,
  axialTilt:            0.41,
  atmosphereThickness:  0.5,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas clear-color="#08080f">
    <TresPerspectiveCamera :position="[0, 0, 4]" />
    <TresAmbientLight :intensity="0.4" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2.5" />
    <Body :body="body" />
  </TresCanvas>
</template>
```

C'est tout. La rotation, l'orientation par défaut, les uniforms temporels et le cleanup au démontage sont automatiques.

## Pourquoi gérer le handle soi-même ?

`useBody()` est la **factory** — il alloue les buffers GPU, les shaders et l'état de simulation. `<Body>` est juste le **pont Vue/TresJS** qui mount tout ça dans le graphe de scène.

Garder le handle dans le scope du composant donne accès aux setters namespacés depuis n'importe où :

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)

// Primitives communes (planètes ET étoiles)
body.interactive.activate()
body.hover.setBoardTile({ layer: 'sol', tileId: 42 })
const tiles = body.sim.tileStates // Map<id, TileState>

// Namespaces planet-only — narrow le union avant d'y toucher
if (body.kind === 'planet') {
  body.liquid.setSeaLevel(1.05)
  body.view.set('atmosphere')
}
```

`Body` est une **union discriminée** `PlanetBody | StarBody` (cf. [Concepts fondamentaux §4](/guides/core-concepts#_4-le-pipeline-de-rendu)). Les namespaces `liquid`, `view`, `atmoShell` sont absents sur les étoiles — TS rejette les accès sans narrowing en mode strict.

La simulation vit sur `body.sim` — vous pouvez piloter une UI overlay depuis la même source de vérité que le mesh.

## Props utiles de `<Body>`

| Prop | Type | Rôle |
| ---- | ---- | ---- |
| `body`           | `RenderableBody` | Handle retourné par `useBody` (obligatoire) |
| `previewMode`    | `boolean` | Annule le `axialTilt` (corps droit) — utile en thumbnail |
| `pose`           | `{ quaternion?, position? }` | Pose autoritaire (override l'animation interne) |
| `dragQuat`       | `THREE.Quaternion` | Quaternion de drag pré-multiplié chaque frame |
| `showShadow`     | `boolean` | Mount `<ShadowUpdater>` (corps satellite ombrant son parent) |
| `parentBody`     | `RenderableBody \| null` | Parent pour le calcul d'ombres |
| `hoveredTileId`  | `number \| null` | État de tuile survolée (contrôlé) |
| `bodyHover`      | `boolean` | Ring de hover au niveau du corps |
| `interactive`    | `boolean` | Active le mesh hex (raycast + tile colors) |
| `sunLight`       | `THREE.PointLight \| THREE.DirectionalLight \| null` | Source de lumière forwardée à `<BodyRings>`. Omis → auto-discovery scène. |

::: tip Pause et vitesse
La pause et le multiplicateur de vitesse ne sont **pas** des props de `<Body>`. C'est au caller de scaler le `dt` qu'il passe à `body.tick()` — pour mettre en pause, il suffit de ne pas appeler `tick`.
:::

## Cycle de vie

`<Body>` libère les ressources GPU automatiquement quand il est démonté. Si vous gérez le handle hors composant, appelez **explicitement** `body.dispose()` :

```ts
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => body.dispose())
```

## Pose autoritaire vs animation interne

`<Body>` fonctionne en deux modes mutuellement exclusifs :

- **Animation interne** (par défaut) — `BodyController` calcule la quaternion à partir de `rotationSpeed` + `axialTilt`.
- **Pose autoritaire** — vous passez `pose`, `<Body>` l'applique verbatim et **désactive** l'anim interne. Typique pour : tick serveur, replay, UI de scrubbing.

Les positions monde **ne sont jamais** dérivées par la lib — c'est au caller (orbites, formations, drag, etc.).

Pour un contrôle plus fin (animation pilotée par un clock non-render-loop, replay scrub piloté à la main), passez par `createBodyMotion` directement — cf. [Composants de scène — animation headless](/guides/scene-components#animation-headless-replay--scrub).
