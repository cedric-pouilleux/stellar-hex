<script setup>
import AtmosphereDemo    from '../../.vitepress/theme/demos/AtmosphereDemo.vue'
import AtmosphereDemoRaw from '../../.vitepress/theme/demos/AtmosphereDemo.vue?raw'
import AtmosphereVueRaw  from '../../.vitepress/theme/demos/AtmosphereVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: AtmosphereDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: AtmosphereVueRaw,  lang: 'vue' },
]
</script>

# Aspect visuel

Le paramètre `atmosphereThickness` (0–1) contrôle l'épaisseur de la coquille atmosphérique **visuelle** — celle vue en mode shader (smooth sphere). Plus la valeur monte, plus le shader adoucit le relief, ajoute la diffusion Rayleigh et étend la couche de halo derrière le terminateur.

Pour la version **jouable** (bandes hex atmo cliquables), voir [Atmosphère jouable](/examples/atmosphere/playable).

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <AtmosphereDemo />
  </DemoBlock>
</ClientOnly>

## Comment ça marche

```ts
const body = useBody({
  // ...
  atmosphereThickness: 0.6, // 0 = aucune, 1 = très épaisse
}, DEFAULT_TILE_SIZE)
```

L'épaisseur est résolue **au build** : changer la valeur en runtime nécessite de reconstruire le corps (la démo Three.js ci-dessus le fait via un `dispose()` puis `useBody()`). Pour une animation atmo (jour/nuit, météo), passez plutôt par un shader override sur les uniforms standards (`uAtmoDensity`, `uAtmoColor`).

## Couleur du halo

La lib est agnostique du climat — elle ne dérive jamais une couleur d'atmosphère depuis une température. Quand aucun override n'est fourni, le halo prend une teinte neutre (bleu pâle universel). Pour un look climatique, le caller calcule la couleur côté jeu et la pousse via :

```ts
import { buildAtmoShell } from '@cedric-pouilleux/stellar-hex/core'

const shell = buildAtmoShell({
  config,
  radius:  config.radius,
  opacity: 0.6,
  tint:    deriveAtmoTint(localClimateModel),  // votre helper caller
  tiles:   sim.tiles,
  params:  { /* … */ },
})
```

Le playground fournit une implémentation de référence (`deriveTemperatureAnchors` dans `playground/src/lib/temperaturePalette.ts`) qui mappe une plage de température sur des couleurs.

## Paramètres clés

| Prop | Plage | Effet |
| ---- | ----- | ----- |
| `atmosphereThickness` | `0`–`1` | Épaisseur globale du shell |
| `atmosphereOpacity`   | `0`–`1` | Opacité du halo en mode shader |
| `bandColors`          | 4 stops | Palette 4 couleurs (géantes gazeuses) |
| `tint` (option de `buildAtmoShell`) | hex string | Couleur résolue caller-side du halo |
