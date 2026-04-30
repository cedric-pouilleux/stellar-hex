<script setup>
import OceanDemo    from '../../.vitepress/theme/demos/OceanDemo.vue'
import OceanDemoRaw from '../../.vitepress/theme/demos/OceanDemo.vue?raw'
import OceanVueRaw  from '../../.vitepress/theme/demos/OceanVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: OceanDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: OceanVueRaw,  lang: 'vue' },
]
</script>

# Océan

Une planète rocheuse avec `liquidState: 'liquid'` reçoit automatiquement une **sphère liquide animée** ancrée au niveau de la mer. Le slider modifie la couverture en runtime via `body.liquid.setSeaLevel`.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <OceanDemo />
  </DemoBlock>
</ClientOnly>

## Couverture initiale vs runtime

Au build, `liquidCoverage` (0–1) est résolu en bande entière dans la simulation :

```ts
const body = useBody({
  // ...
  liquidState:    'liquid',  // 'liquid' | 'frozen' | 'none' — déclare la présence
  liquidCoverage: 0.55,      // 55 % des tuiles seront sous l'eau
  liquidColor:    '#175da1', // teinte opaque (la chimie reste caller-owned)
}, DEFAULT_TILE_SIZE)
```

La nature de la substance (eau, méthane…) n'est jamais exposée à la lib — vous gardez ce mapping dans votre catalogue applicatif et passez seulement la couleur résolue.

Au runtime, vous bougez le niveau via :

```ts
const core    = body.getCoreRadius()
const surface = body.getSurfaceRadius()

// `radius01` ∈ [0, 1] mappé entre noyau (0) et surface (1)
body.liquid.setSeaLevel(core + (surface - core) * radius01)
```

`setSeaLevel(worldRadius)` accepte un **rayon monde** : combinez-le avec `body.getCoreRadius()` / `body.getSurfaceRadius()` pour rester dans la bande de relief. Une valeur ≤ rayon du noyau cache automatiquement le shell liquide.

## Vagues animées

La sphère liquide utilise `liquidWaves.glsl` — un FBM dérivé de la position monde et du temps. Trois uniforms pilotent le rendu :

| Uniform | Rôle |
| ------- | ---- |
| `uTime`        | Temps en secondes (incrémenté par `body.tick`) |
| `uWaveScale`   | Échelle XY des vagues |
| `uWaveAmount`  | Amplitude (transparence + relief) |

Tous trois ont des défauts raisonnables. Pour personnaliser, accédez au matériau via `(body as any).liquidMaterial?.uniforms`.

## Pourquoi un shell séparé ?

Modélisée comme une **sphère distincte** plutôt qu'une bande de tuiles, l'océan :

- garde une surface lisse même quand le mesh hex est actif,
- supporte des vagues animées indépendantes du terrain,
- peut être rendu en alpha-blend avec un shader de Fresnel.

Pour une glace solide qui suit le relief tuile par tuile, déclarez `liquidState: 'frozen'` et empilez vous-même un cap hex via `buildSolidShell` — voir la page dédiée [Surface gelée](/examples/liquids/frozen) pour le pattern complet.
