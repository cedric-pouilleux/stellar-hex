<script setup>
import RingShadowsDemo    from '../../.vitepress/theme/demos/RingShadowsDemo.vue'
import RingShadowsDemoRaw from '../../.vitepress/theme/demos/RingShadowsDemo.vue?raw'
import RingShadowsVueRaw  from '../../.vitepress/theme/demos/RingShadowsVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: RingShadowsDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: RingShadowsVueRaw,  lang: 'vue' },
]
</script>

# Ombres planète ↔ anneaux

Deux ombres distinctes sont en jeu :

- **Planète → anneau** : le shader d'anneau (`buildBodyRings`) rayonne du fragment vers le soleil et atténue si la planète bouche le rayon. **Auto-câblé** : `<BodyRings>` (et `buildBodyRings` en vanille) auto-discover la lumière dominante via `findDominantLightWorldPos` chaque frame, ou utilise une `sunLight` explicite si le caller en passe une.
- **Anneau → planète** : le shader planète reçoit un patch GLSL via `injectRingShadow` (auto-appelé par `useBody` quand `hasRings: true`). Il rayonne du fragment vers le soleil et échantillonne le profil radial de l'anneau si le rayon le traverse. **Le caller doit pousser la position du soleil** dans `uRingSunWorldPos` — la lib n'a pas de hook auto pour cet uniform.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <RingShadowsDemo />
  </DemoBlock>
</ClientOnly>

## Câbler `uRingSunWorldPos`

Pour une scène statique (lumière fixe), un seul push à l'init suffit :

```ts
const planetMat = (body as any).planetMaterial?.material as THREE.ShaderMaterial
if (planetMat?.uniforms.uRingSunWorldPos) {
  // Light directionnelle → projeter le vecteur loin pour simuler une source à l'infini.
  planetMat.uniforms.uRingSunWorldPos.value
    .copy(sun.position).normalize().multiplyScalar(1e4)
}
```

Pour une scène où le soleil bouge (orbite, jour/nuit), refresh chaque frame :

```ts
import { findDominantLightWorldPos, findSceneRoot } from '@cedric-pouilleux/stellar-hex/core'

// dans la boucle :
findDominantLightWorldPos(
  findSceneRoot(body.group),
  planetMat.uniforms.uRingSunWorldPos.value,
)
```

::: tip Pourquoi pas auto ?
L'auto-discovery est volontairement absente côté planète : sur une scène multi-corps avec plusieurs étoiles (système binaire, lunes éclairées par leur primaire), le « soleil dominant » n'a pas de sens unique. Le caller décide quelle source projette l'ombre — typiquement la même que celle utilisée par `<BodyRings>`, mais ce n'est pas obligatoire.
:::

## Anatomie du shader

L'ombre anneau→planète est calculée par-pixel dans le fragment du matériau planète :

1. **Rayon** : du fragment courant vers `uRingSunWorldPos`, projeté sur le plan équatorial de la planète (normale `+Y` locale).
2. **Intersection** : si le rayon traverse le disque entre `uRingInnerR` et `uRingOuterR`, on calcule la coordonnée radiale `t ∈ [0, 1]`.
3. **Opacité** : le profil radial de l'anneau (`uRingProfileA/B` — 8 samples) est lerpé pour obtenir la densité macro, puis modulé par un FBM 1D pour la micro-banding.
4. **Atténuation** : `gl_FragColor.rgb *= 1 - shade` où `shade = density × edge × opacity × 0.85`.

L'angle de vue ne joue **pas** : l'ombre est physiquement correcte indépendamment de la caméra.

## Désactiver

L'ombre anneau→planète est intrinsèque au patch shader — pas de flag d'off direct. Pour la couper visuellement, le plus simple est de laisser `uRingSunWorldPos` à `(0, 0, 0)` (l'origine). Le test `_rfDenom > 1e-4` reste vrai mais la distance au soleil devient nulle, donc le rayon ne « voyage » jamais et aucun fragment n'est ombré.
