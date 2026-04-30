<script setup>
import MultiLightDemo    from '../../.vitepress/theme/demos/MultiLightDemo.vue'
import MultiLightDemoRaw from '../../.vitepress/theme/demos/MultiLightDemo.vue?raw'
import MultiLightVueRaw  from '../../.vitepress/theme/demos/MultiLightVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: MultiLightDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: MultiLightVueRaw,  lang: 'vue' },
]
</script>

# Sources lumineuses multiples

Les matériaux planète, étoile, atmo et anneau utilisent des `ShaderMaterial` custom — ils **n'écoutent pas** les lumières scène standard de Three.js. Pour piloter la direction soleil → planète, on passe une lumière explicite via l'option `sunLight` :

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <MultiLightDemo />
  </DemoBlock>
</ClientOnly>

## Câblage à une lumière dominante

```ts
const warmSun = new THREE.DirectionalLight(0xffaa55, 2.0)
warmSun.position.set(-4, 1, 4)
scene.add(warmSun)

const coolSun = new THREE.DirectionalLight(0x55aaff, 1.5)
coolSun.position.set(4, 1, -2)
scene.add(coolSun)

// Une seule lumière pilote le shader du corps. Les autres restent
// disponibles pour vos meshes annexes (markers, props, glow décoratifs).
const body = useBody(config, DEFAULT_TILE_SIZE, { sunLight: warmSun })
scene.add(body.group)
```

Le shader interne ne supporte qu'une direction lumière à la fois. Pour la varier dans le temps (jour/nuit, transit), il suffit de bouger la `DirectionalLight` ou la `PointLight` passée — `body.tick(dt)` lit sa position monde chaque frame.

## God rays & ring shadows

Les couches scénographiques (god rays, ring shadows auto-câblées) suivent automatiquement la **lumière dominante** sous le scene root :

- `findDominantLightWorldPos(scene, out)` retourne la position monde de la `PointLight` ou `DirectionalLight` la plus intense.
- Les `<BodyRings>` (et `buildBodyRings` en vanille) auto-discover cette source si vous ne leur passez pas de `sunLight` explicite.

Pour un système binaire, alimentez chaque sous-système avec sa propre `sunLight` explicite ; le scan auto ne sait pas répartir entre deux étoiles concurrentes.

## Avec Vue / TresJS

```vue
<script setup lang="ts">
const warmSun = new THREE.DirectionalLight(0xffaa55, 2.0)
warmSun.position.set(-4, 1, 4)

const body = useBody(config, DEFAULT_TILE_SIZE, { sunLight: warmSun })
</script>

<template>
  <primitive :object="warmSun" />
  <TresDirectionalLight :position="[4, 1, -2]" :intensity="1.5" :color="'#55aaff'" />
  <Body :body="body" :sun-light="warmSun" />
</template>
```

L'instance `warmSun` est partagée : montée dans la scène via `<primitive>` ET passée à `useBody({ sunLight })` + `<Body :sun-light>` pour piloter le shader et les anneaux. Une seule source de vérité, pas de `Vector3` à synchroniser.
