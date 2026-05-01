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
// Source de lumière unique : la même PointLight illumine la scène (cœur
// molten, anneaux) ET pilote la direction soleil → planète dans le shader
// de chaque corps via l'option `sunLight`.
const sun = new THREE.PointLight(0xfff1cc, 4.5, 0, 0)
sun.position.set(0, 0, 0)
scene.add(sun)

const planets = [
  { body: useBody(rockyConfig, DEFAULT_TILE_SIZE, { sunLight: sun }), orbitRadius: 4.5, orbitSpeed: 0.30, phase: 0 },
  { body: useBody(metalConfig, DEFAULT_TILE_SIZE, { sunLight: sun }), orbitRadius: 7.0, orbitSpeed: 0.18, phase: 1.5 },
  { body: useBody(gasConfig,   DEFAULT_TILE_SIZE, { sunLight: sun }), orbitRadius: 11,  orbitSpeed: 0.10, phase: 3.2 },
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

## Comment l'étoile éclaire les planètes

Le matériau des corps est un `THREE.ShaderMaterial` custom — il **n'écoute pas** les lumières de scène standard (pas de calcul `MeshStandardMaterial`). À la place, chaque corps maintient son propre uniform `uLightDir`.

Pour pondre cette direction sans dupliquer la source de vérité, `useBody` accepte une option `sunLight: THREE.PointLight | THREE.DirectionalLight`. À chaque `body.tick(dt)`, la lib lit `sunLight.getWorldPosition()`, calcule le vecteur normalisé planète → soleil, et met à jour le shader (corps + atmosphère + anneaux). **Une seule** lumière scène pilote toute la scène — pas de `Vector3` séparé à synchroniser.

L'étoile, elle, n'a pas besoin d'être éclairée : son shader est **émissif** (auto-lumineux). On peut donc placer la `PointLight` au centre de la sphère étoile sans risque — le shader émissif ignore la scène lights, et les corps qui l'écoutent (via `sunLight`) lisent juste sa position.

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
- passez les corps non-focus en mode `'shader'` (`body.view.set('shader')`) — pas de mesh hex, pas de BVH (cf. [Mode jouable](/examples/hex-tiles/playable-mode#trois-modes-de-vue)),
- regroupez les corps identiques en `THREE.InstancedMesh` (cf. [Performance](/guides/performance)).

## Raycasting multi-corps

Pour détecter quel corps l'utilisateur survole dans une scène avec plusieurs planètes, la lib expose `raycastBodies` — un raycast filtré qui élimine automatiquement les hits derrière le corps focus :

```ts
import { raycastBodies, findBodyIndex } from '@cedric-pouilleux/stellexjs/core'

const raycaster = new THREE.Raycaster()
raycaster.setFromCamera(pointer, camera)

const bodies = planets.map(p => ({ group: p.body.group, config: p.body.config }))
const hit    = raycastBodies(raycaster, bodies, { focusedIndex })

if (hit) {
  console.log(`Survol du corps #${hit.bodyIndex}`)
}
```

Filtres appliqués :

- **Distance > rayon du body** → écarté (évite les false hits sur les bords du mesh).
- **Body focus** → écarté en candidat **et** utilisé comme occluder sphère — un hit sur un satellite caché derrière le focus est ignoré.

`findBodyIndex(obj, bodies)` remonte le scene graph pour identifier le body owner d'un objet arbitraire — utile quand vous gérez votre propre raycast et voulez juste résoudre l'index.
