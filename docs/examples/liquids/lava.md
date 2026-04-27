<script setup>
import LavaDemo    from '../../.vitepress/theme/demos/LavaDemo.vue'
import LavaDemoRaw from '../../.vitepress/theme/demos/LavaDemo.vue?raw'
import LavaVueRaw  from '../../.vitepress/theme/demos/LavaVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: LavaDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: LavaVueRaw,  lang: 'vue' },
]
</script>

# Lave

`hasLava: true` active une couche émissive dans les bandes basses du shader rocky. Combiné avec `hasCracks: true`, la lave coule dans le réseau de fractures — typique d'un monde volcanique.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <LavaDemo />
  </DemoBlock>
</ClientOnly>

## Configuration minimale

```ts
const body = useBody({
  type: 'rocky',
  name: 'lava-world',
  // ...
  hasCracks:      true,
  hasLava:        true,
  lavaColor:     '#ff5520', // optionnel — défaut sombre rouge
}, DEFAULT_TILE_SIZE)
```

## Tweak runtime

La lave est exposée comme **paramètres shader** du `BodyMaterial`, donc on peut la pousser sans rebuild :

```ts
const material = (body as any).planetMaterial
material.setParams({
  lavaAmount:   0.7,   // 0–1
  lavaEmissive: 2.0,   // 0–3
  lavaColor:    '#ff7733',
})
```

Cf. [BODY_PARAMS](/api/core/variables/BODY_PARAMS) pour la liste complète des paramètres lave (`lavaScale`, `lavaWidth`, etc.).

## Recommandations chimiques

La lib **n'a pas** de mapping température → couleur de lave. Le caller décide :

| Composition dominante | `lavaColor` typique |
| --------------------- | ------------------ |
| Basaltique (silice basse)  | `#ff4422` |
| Rhyolitique (silice haute) | `#ffaa55` |
| Carbonatitique             | `#ffe699` |
| Ferreuse (planète métal)   | `#cc4422` |

Le playground (`playground/src/lib/metallicCatalog.ts` et `liquidCatalog.ts`) propose des implémentations de référence : un mapping minéraux → couleurs et un dérivateur de teinte fondue à partir d'une plage de température, qui résolvent `lavaColor` en amont avant de le pousser dans le `BodyConfig`.
