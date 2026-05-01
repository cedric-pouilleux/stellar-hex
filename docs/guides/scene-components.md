# Composants de scène

`<Body>` est le composant Vue le plus haut niveau, mais la lib expose **trois composants utilitaires** que vous pouvez monter indépendamment dès que vous avez besoin d'un contrôle plus fin que ce que `<Body>` propose. Tous sont **renderless** (pas de DOM) — ils s'inscrivent dans la `useLoop` de TresJS pour pousser de l'état dans la scène à chaque frame.

| Composant | Rôle | Source |
| --------- | ---- | ------ |
| `<BodyController>` | Animation interne (rotation propre + `axialTilt` + `dragQuat`) et `pose.position` | [scene/BodyController.vue](https://github.com/cedric-pouilleux/stellex-js/blob/main/scene/BodyController.vue) |
| `<TileCenterProjector>` | Projection 3D → écran (CSS px) du centre d'une tuile survolée | [scene/TileCenterProjector.vue](https://github.com/cedric-pouilleux/stellex-js/blob/main/scene/TileCenterProjector.vue) |
| `<ShadowUpdater>` | Sync de la position monde du caster d'ombre dans l'uniform `uShadowPos` du parent | [scene/ShadowUpdater.vue](https://github.com/cedric-pouilleux/stellex-js/blob/main/scene/ShadowUpdater.vue) |

`<Body>` les mount automatiquement aux bons moments — vous n'avez à les manipuler directement que quand vous sortez de ce périmètre (HUD, multi-corps custom, scènes scriptées).

## `<BodyController>`

L'accumulateur qui transforme `rotationSpeed` + `axialTilt` en quaternion, plus l'application optionnelle d'une `pose.position` autoritaire et d'un `dragQuat` utilisateur.

### Pourquoi un composant dédié ?

`<Body>` mount déjà un `<BodyController>` interne. Vous ne le mountez vous-même que dans deux cas :

- **Vous gérez le mesh du corps en dehors de `<Body>`** (par exemple un `<primitive>` directement, parce que vous voulez injecter votre propre wrapper de scène).
- **Vous voulez une animation pilotée par une autre source que la render loop** — replay, scrub, tick serveur. Dans ce cas, vous court-circuitez `<BodyController>` et utilisez directement `createBodyMotion`.

### Props

| Prop | Type | Rôle |
| ---- | ---- | ---- |
| `group` | `THREE.Group` | Le groupe à animer (typiquement `body.group`) |
| `config` | `BodyConfig` | Source de `rotationSpeed` + `axialTilt` |
| `pose` | `{ position?: THREE.Vector3 } \| null` | Position monde autoritaire (copiée chaque frame) |
| `dragQuat` | `THREE.Quaternion \| null` | Quaternion **pré-multiplié** sur l'orientation auto-spin chaque frame |
| `previewMode` | `boolean` | Si `true`, met `axialTilt` à zéro (corps droit) |

### Pourquoi position et pas rotation autoritaire ?

La doctrine est explicite ([scene/BodyController.vue](https://github.com/cedric-pouilleux/stellex-js/blob/main/scene/BodyController.vue)) : la rotation est **toujours cosmétique** dans cette lib, parce qu'aucun gameplay ne s'appuie sur la rotation propre d'un corps. Pousser un quaternion serveur serait un footgun : la lib n'a pas de stratégie d'interpolation, ce qui rendrait le rendu saccadé sous jitter réseau.

La position, elle, est piloté par le caller — orbites, formations, scripted paths, snapshots serveur. La lib est volontairement neutre sur où le corps doit être, pas sur où il regarde.

### Exemple — `<BodyController>` standalone

```vue
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, BodyController, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellex-js'
import { ref } from 'vue'
import * as THREE from 'three'

const body = useBody(config, DEFAULT_TILE_SIZE)
const dragQuat = ref<THREE.Quaternion | null>(null)
</script>

<template>
  <TresCanvas>
    <primitive :object="body.group" />
    <BodyController
      :group="body.group"
      :config="body.config"
      :drag-quat="dragQuat"
    />
  </TresCanvas>
</template>
```

## `<TileCenterProjector>`

Projette le **centre de la tuile survolée** depuis l'espace local de la planète vers une position CSS pixel à l'écran. Idéal pour ancrer un tooltip HTML (info sur la tuile) qui suit la rotation de la planète sans flicker.

### Pourquoi un composant dédié ?

La projection 3D → écran tourne à chaque frame (la planète tourne, le HTML doit suivre). Externaliser ça dans un composant TresJS :

- évite de polluer votre composant parent avec la logique de projection,
- bénéficie automatiquement de la `useTresContext` (caméra et renderer),
- découple l'affichage HTML de la donnée brute (le `tileId` reste sur l'API hover).

### Le `HoverChannel` — pourquoi c'est externe

Chaque body porte son propre `HoverChannel` ([render/state/hoverState.ts](https://github.com/cedric-pouilleux/stellex-js/blob/main/render/state/hoverState.ts)) que `useBody` crée par défaut. Le channel publie deux refs : la position locale du centre de la tuile + le groupe parent dont la `matrixWorld` la transforme en monde.

Cette séparation permet :

- **Multi-corps avec tooltips concurrents** — chaque body a son channel, chaque projector écoute le sien, plusieurs tooltips peuvent vivre en même temps.
- **Tooltip global unique** — vous créez un `createHoverChannel()` à la main et le passez à *tous* les `useBody({ hoverChannel })`, garantissant qu'un seul slot de hover existe à la fois (UX type popover).

### Props et événements

| Prop | Type | Rôle |
| ---- | ---- | ---- |
| `channel` | `HoverChannel` | Le canal publié par un `body.hoverChannel` |
| `@update-position` | `{ x, y } \| null` | Émis chaque frame avec la position CSS px ou `null` si rien n'est survolé / si la tuile passe derrière la caméra |

### Exemple complet — tooltip qui suit une tuile

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, Body, TileCenterProjector, DEFAULT_TILE_SIZE } from '@cedric-pouilleux/stellex-js'

const body = useBody(config, DEFAULT_TILE_SIZE)
const tooltipPos = ref<{ x: number; y: number } | null>(null)
const hoveredTileId = ref<number | null>(null)

body.hover.onChange(id => { hoveredTileId.value = id })
</script>

<template>
  <TresCanvas>
    <Body :body="body" :interactive="true" :hovered-tile-id="hoveredTileId" />
    <TileCenterProjector
      :channel="body.hoverChannel"
      @update-position="p => tooltipPos = p"
    />
  </TresCanvas>

  <div
    v-if="tooltipPos && hoveredTileId !== null"
    class="tooltip"
    :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
  >
    Tile #{{ hoveredTileId }}
  </div>
</template>
```

::: tip Garde « derrière caméra »
Le projector émet `null` quand la tuile passe derrière la caméra (`ndc.z > 1`). Pas besoin de tester côté caller — il suffit de masquer le tooltip si `tooltipPos` est nul.
:::

## `<ShadowUpdater>`

Pousse la position monde d'un corps caster vers l'uniform `uShadowPos` d'un autre corps (le parent ombré). Permet aux satellites de projeter une ombre dynamique sur la planète qu'ils orbitent.

### Pourquoi pas du shadow mapping standard ?

Le shadow mapping Three.js coûte une render target par light + un pass de depth. La lib propose une **ombre analytique** : le shader du corps parent reçoit la position du caster et calcule une atténuation sphère-sphère par fragment. Avantages :

- coût quasi nul (un uniform `vec3` + une fonction trigonométrique par fragment),
- s'intègre dans la chaîne `BodyMaterial` standard,
- pas de réglage shadow map (texelSize, bias, blur).

Limites :

- une seule ombre dynamique à la fois (un seul `uShadowPos`),
- pas d'ombres entre satellites — uniquement satellite → planète parent.

### Usage

`<Body>` mount automatiquement `<ShadowUpdater>` quand vous lui passez `:show-shadow="true"` + `:parent-body="parent"`. Pour une scène custom où vous gérez vous-même les meshes :

```vue
<script setup lang="ts">
import { ShadowUpdater } from '@cedric-pouilleux/stellex-js'
const moon  = useBody(moonConfig,  DEFAULT_TILE_SIZE)
const earth = useBody(earthConfig, DEFAULT_TILE_SIZE)
</script>

<template>
  <primitive :object="moon.group" />
  <primitive :object="earth.group" />

  <ShadowUpdater
    :caster-group="moon.group"
    :pos-uniform="earth.shadowUniforms.pos"
  />
</template>
```

`body.shadowUniforms.pos` est un `{ value: THREE.Vector3 }` (le ref attendu par les shaders Three.js). La lib alloue le wrapper, vous pousez juste la position.

## Animation headless (replay / scrub)

`<BodyController>` consomme implicitement la `useLoop` TresJS. Pour un scénario **headless ou avec un autre clock** (replay UI, server tick), passez par `createBodyMotion` directement :

```ts
import { createBodyMotion } from '@cedric-pouilleux/stellex-js/core'

const motion = createBodyMotion({
  rotationSpeed: config.rotationSpeed,
  axialTilt:     config.axialTilt,
})

// Tick depuis votre source autoritaire (replay timeline, server snapshot, …)
function onReplayTick(dt: number) {
  motion.tick(dt)
  motion.applyTo(body.group)
}

// Scrub à un instant t arbitraire — écrasez l'angle accumulé directement
motion.spinAngle = config.rotationSpeed * timelineSeconds
motion.applyTo(body.group)
```

`computeBodyQuaternion(spinAngle, axialTilt, out)` est la primitive pure (sans état) qu'utilise `createBodyMotion` — utile si vous avez votre propre accumulateur et n'avez besoin que du calcul de quaternion.

## Voir aussi

- [Vue 3 + TresJS](/guides/vue-integration) — `<Body>` complet et props réactives
- [Curseur de survol](/guides/hover-cursor) — l'API `body.hover` consommée par `<TileCenterProjector>`
- [API : `BodyMotionHandle`](/api/core/interfaces/BodyMotionHandle)
- [API : `HoverChannel`](/api/core/interfaces/HoverChannel)
