<script setup>
import SolarSystemDemo    from '../../.vitepress/theme/demos/SolarSystemDemo.vue'
import SolarSystemDemoRaw from '../../.vitepress/theme/demos/SolarSystemDemo.vue?raw'
import SolarSystemVueRaw  from '../../.vitepress/theme/demos/SolarSystemVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: SolarSystemDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: SolarSystemVueRaw,  lang: 'vue' },
]
</script>

# Système solaire

Trois planètes (rocheuse + métallique + gazeuse) en orbite autour d'une étoile centrale, partageant une seule `PointLight`. La lib **n'a pas** de mécanique orbitale — la position monde des corps est entièrement caller-driven.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <SolarSystemDemo />
  </DemoBlock>
</ClientOnly>

## Pattern d'orbite simple

```ts
const planets = [
  { body: useBody(rockyConfig, DEFAULT_TILE_SIZE), orbitRadius: 4.5, orbitSpeed: 0.30, phase: 0 },
  { body: useBody(metalConfig, DEFAULT_TILE_SIZE), orbitRadius: 7.0, orbitSpeed: 0.18, phase: 1.5 },
  { body: useBody(gasConfig,   DEFAULT_TILE_SIZE), orbitRadius: 11,  orbitSpeed: 0.10, phase: 3.2 },
]
planets.forEach(p => scene.add(p.body.group))

// par frame :
const angle = phase + elapsed * orbitSpeed
p.body.group.position.set(
  Math.cos(angle) * orbitRadius,
  0,
  Math.sin(angle) * orbitRadius,
)
p.body.tick(dt)
```

C'est minimaliste : pas d'ellipse, pas d'inclinaison orbitale, pas de précession. Pour un simulateur sérieux, branchez votre solveur (Kepler, n-body) et écrivez `position` chaque frame.

## Une seule lumière, deux sortes de shading

L'étoile est rendue en **émissive** (auto-éclairée), donc elle n'a pas besoin d'être éclairée. Les planètes sont éclairées par la `PointLight` placée au centre — donc l'étoile **éclaire** mais ne **s'éclaire pas elle-même**.

Si vous mettez la lumière strictement à `(0, 0, 0)` et que l'étoile est rayon `1.2`, la lumière est **à l'intérieur** de la sphère étoile. Le shader émissif ignore la lumière scène, donc tout fonctionne — mais si vous touchez à un autre matériau (ex. corona séparée) qui réagit à la lumière scène, l'effet sera contre-intuitif.

## Avec `<Body>` et `pose`

La version Vue/TresJS utilise `pose.position` pour piloter la position depuis l'extérieur :

```vue
<Body :body="planetBody" :pose="{ position }" />
```

Quand `pose` est passé, `<Body>` désactive son animation interne de position et applique verbatim votre vecteur. Adapté pour : tick serveur, replay, scrubbing UI.

## Performance

Trois corps animés ≈ 3 × `body.tick(dt)` par frame. Pour 50+ corps :

- baissez `tileSize` (ex. `0.15`) sur les corps lointains,
- mettez les corps statiques en pause (`paused: true`) — pas d'appel à `tick`,
- regroupez les corps identiques en `THREE.InstancedMesh` (cf. [Performance](/guides/performance)).
