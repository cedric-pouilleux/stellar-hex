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

Les matériaux planète, étoile, atmo et anneau réagissent au **shading standard Three.js** : n'importe quel nombre de `DirectionalLight`, `PointLight` ou `AmbientLight` fonctionne sans configuration spéciale.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <MultiLightDemo />
  </DemoBlock>
</ClientOnly>

## Câblage

```ts
scene.add(new THREE.AmbientLight(0x101018, 0.3))

const warmSun = new THREE.DirectionalLight(0xffaa55, 2.0)
warmSun.position.set(-4, 1, 4)
scene.add(warmSun)

const coolSun = new THREE.DirectionalLight(0x55aaff, 1.5)
coolSun.position.set(4, 1, -2)
scene.add(coolSun)

const body = useBody(config, DEFAULT_TILE_SIZE)
scene.add(body.group)
```

Aucune autre étape. Les uniforms `uLightDir` du shader interne sont pilotés par THREE qui agrège toutes les lumières directionnelles.

## Cas particulier des ombres / god rays

Quand vous avez plusieurs sources, les couches « scénographiques » de la lib (god rays, ring shadows) ne suivent **qu'une seule lumière** — la dominante :

- `findDominantLightWorldPos(scene)` retourne la position monde de la lumière la plus intense (point ou directional).
- Les god rays partent de cette position.
- Les ring shadows utilisent cette direction.

Pour orchestrer plusieurs systèmes binaires, créez un EffectComposer + un `GodRaysShader` **par étoile** et compositez le résultat additivement.

## Avec Vue / TresJS

```vue
<TresAmbientLight :color="'#101018'" :intensity="0.3" />
<TresDirectionalLight :position="[-4, 1, 4]"  :intensity="2.0" :color="'#ffaa55'" />
<TresDirectionalLight :position="[4, 1, -2]"  :intensity="1.5" :color="'#55aaff'" />
<Body :body="body" />
```

C'est exactement la déclaration équivalente de la version Three.js — TresJS ne fait que mapper sur les noeuds Three.js sous-jacents.
