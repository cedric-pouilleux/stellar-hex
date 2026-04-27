# Shaders & matériaux

La lib expose **un seul matériau procédural** par type de corps via la classe [`BodyMaterial`](/api/core/classes/BodyMaterial). Quatre fragment shaders (rocky, metallic, gas, star) partagent un vertex shader commun et un système de paramètres unifié.

## Vue d'ensemble

```ts
import {
  BodyMaterial,
  BODY_TYPES,
  BODY_PARAMS,
  BODY_GROUPS,
  getDefaultParams,
  SHADER_RANGES,
} from '@cedric-pouilleux/stellar-hex/core'

const params   = getDefaultParams('rocky')
const material = new BodyMaterial({ type: 'rocky', params })
```

| Symbole | Rôle |
| ------- | ---- |
| `BodyMaterial`     | Classe — wrap un `THREE.ShaderMaterial` typé par type de corps |
| `BODY_TYPES`       | `Array<{ id: LibBodyType, label, icon }>` — catalogue UI des types `'rocky' \| 'gaseous' \| 'metallic' \| 'star'` |
| `BODY_PARAMS`      | Définitions complètes des paramètres par type (label, range, default) |
| `BODY_GROUPS`      | Regroupement UI (Terrain, Couleurs, Fissures, Lave, Couronne, …) |
| `getDefaultParams` | Renvoie les valeurs par défaut pour un type donné |
| `SHADER_RANGES`    | Bornes min/max/step des sliders |
| `GodRaysShader`    | Pass post-processing god rays |

## Pousser des paramètres en temps réel

`BodyMaterial.setParams()` met à jour les **uniforms** sans reconstruire le matériau — adapté à un panneau de contrôle :

```ts
material.setParams({
  roughness:    0.85,
  craterCount:  7,
  crackAmount:  0.7,
  lavaAmount:   0.4,
  lavaColor:   '#ff5520',
})
```

Les types numériques sont convertis en `float`, les chaînes hex (`'#rrggbb'`) sont parsées en `THREE.Color`. Les paramètres inconnus pour le type courant sont **silencieusement ignorés** — vous pouvez maintenir un dictionnaire global et laisser chaque matériau ne consommer que ce qui le concerne.

## Construire une UI à partir des métadonnées

`BODY_PARAMS[type]` liste tous les paramètres consommés, avec assez de méta pour générer un panneau automatiquement :

```ts
import { BODY_PARAMS, BODY_GROUPS, SHADER_RANGES } from '@cedric-pouilleux/stellar-hex/core'

for (const group of BODY_GROUPS.rocky) {
  console.log(group.label) // 'Terrain', 'Couleurs', 'Fissures'…
  for (const key of group.keys) {
    const def   = BODY_PARAMS.rocky[key]
    const range = SHADER_RANGES[key]
    // def.label, def.default, range.min, range.max, range.step…
  }
}
```

C'est exactement ce que fait `playground/src/components/ShaderControls.vue` — vous pouvez l'utiliser comme référence.

## Étoiles : conversion Kelvin → couleur

Pour les corps stellaires, trois utilitaires convertissent une température (en Kelvin) en couleur :

```ts
import { kelvinToRGB, kelvinToThreeColor, kelvinLabel } from '@cedric-pouilleux/stellar-hex/core'

kelvinToRGB(5778)         // { r: 1, g: 0.97, b: 0.92 } — soleil G
kelvinToThreeColor(3500)  // THREE.Color — étoile M (rouge)
kelvinLabel(10000)        // 'B' — classification spectrale
```

Cf. [`SPECTRAL_TABLE`](/api/sim/variables/SPECTRAL_TABLE) pour la table complète O–M.

## God rays (post-processing)

```ts
import { godRaysFromStar, GodRaysShader } from '@cedric-pouilleux/stellar-hex/core'

const pass = godRaysFromStar({
  star,            // mesh étoile
  scene,
  camera,
  renderer,
  // params optionnels : density, weight, decay, exposure
})

// dans la boucle :
pass.render()
```

Voir [God rays stellaires](/examples/lighting/star-godrays) pour un exemple complet avec `EffectComposer`.

## Personnaliser un fragment shader

Si vous avez besoin d'un look custom, `BodyMaterial` accepte un `fragmentOverride` qui remplace le shader par défaut. Vous gardez les uniforms standards (`uTime`, `uLightDir`, `uPalette`, …) ; à vous de définir ce que vous en faites. La liste exhaustive des uniforms exposés est documentée sur [`BodyMaterialOptions`](/api/core/interfaces/BodyMaterialOptions).
