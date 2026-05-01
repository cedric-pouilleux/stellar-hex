<script setup>
import StarGodraysDemo    from '../../.vitepress/theme/demos/StarGodraysDemo.vue'
import StarGodraysDemoRaw from '../../.vitepress/theme/demos/StarGodraysDemo.vue?raw'
import StarGodraysVueRaw  from '../../.vitepress/theme/demos/StarGodraysVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: StarGodraysDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: StarGodraysVueRaw,  lang: 'vue' },
]
</script>

# God rays stellaires

`GodRaysShader` est un pass post-process screen-space (Crepuscular Rays) à brancher sur un `EffectComposer`. Les paramètres optimaux sont calculés depuis la classe spectrale via `godRaysFromStar`.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <StarGodraysDemo />
  </DemoBlock>
</ClientOnly>

## Branchement EffectComposer

```ts
import * as THREE from 'three'
import { GodRaysShader, godRaysFromStar } from '@cedric-pouilleux/stellex-js/core'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass }     from 'three/examples/jsm/postprocessing/ShaderPass.js'

// Render target dédié pour le mask — jamais touché par le composer,
// donc pas de feedback loop GL entre lecture et écriture.
const maskTarget = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
  depthBuffer:   false,
  stencilBuffer: false,
})

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const params  = godRaysFromStar({ spectralType: 'G' })
const godRays = new ShaderPass(GodRaysShader)
godRays.uniforms.uExposure.value = params.exposure
godRays.uniforms.uDecay.value    = params.decay
godRays.uniforms.uDensity.value  = params.density
godRays.uniforms.uWeight.value   = params.weight
godRays.uniforms.uEnabled.value  = 1.0
godRays.uniforms.tMask.value     = maskTarget.texture
composer.addPass(godRays)
```

Chaque frame, rendez d'abord l'étoile dans le mask, puis lancez le composer :

```ts
const screen = star.group.position.clone().project(camera)
godRays.uniforms.uSunUV.value.set(
  (screen.x + 1) / 2,
  (screen.y + 1) / 2,
)
godRays.uniforms.uEnabled.value = screen.z < 1 ? 1 : 0

// 1. Mask : la scène ne contient que l'étoile, on rend tel quel.
renderer.setRenderTarget(maskTarget)
renderer.clear()
renderer.render(scene, camera)
renderer.setRenderTarget(null)

// 2. Composer (RenderPass → GodRays → Copy).
composer.render()
```

::: tip Pourquoi un `tMask` séparé ?
Le shader seed les rayons depuis ce mask exclusivement. Une scène réaliste contient aussi des planètes, des highlights et des anneaux brillants — il faut alors rendre l'étoile **isolée** (via `THREE.Layers`) dans le mask target pour éviter que ces pixels polluent les rayons. **Ne pas réutiliser** une cible interne du composer (`composer.renderTarget1.texture`) comme mask : le ping-pong entre passes provoquerait une feedback loop GL.
:::

## Paramètres calibrés par type spectral

`godRaysFromStar(starConfig)` calcule les 4 uniforms en fonction de la **luminosité** et du **rayon** de l'étoile :

| Spectral | exposure | decay | density | weight |
| -------- | -------- | ----- | ------- | ------ |
| O (très chaude) | élevé    | élevé  | élevé  | élevé  |
| G (Soleil)      | ~0.44    | ~0.94  | ~0.70  | ~0.36  |
| M (rouge naine) | faible   | faible | faible | faible |

La compensation par taille visuelle évite que les étoiles « grossies » à l'écran (rendering ×3) saturent le mask de seed pixels.

## Avec Vue / TresJS

TresJS n'a pas de pass post-process built-in. Trois options :

1. **Mounter l'EffectComposer manuellement** dans un composable `onMounted` — voir le code Vue de la démo (qui n'inclut pas le post-process pour rester simple).
2. **Utiliser `@tresjs/cientos` `<Postpro>`** (si dispo dans votre version).
3. **Passer en mode pure Three.js** pour le rendu et n'utiliser TresJS que pour la déclaration de scène.
