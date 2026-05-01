# Graphics uniforms

`createGraphicsUniforms()` crée un **bag mutable d'uniforms partagés** par les shaders cloud, liquid et terrain d'un même corps. C'est le levier de réglage **runtime** le plus large de la lib : ~20 valeurs (toggles, bump, foam, fresnel, depth darken, edge blend…) qu'un panneau de contrôle peut écrire à n'importe quel moment, sans rebuild ni recompilation de shader.

`useBody` en alloue un automatiquement par corps. Pour un canal global (panneau de réglages graphiques de l'application), construisez-en **un seul** et passez-le à tous les `useBody`.

## Deux usages

### 1. Par-corps (défaut)

```ts
const mars  = useBody(marsConfig,  DEFAULT_TILE_SIZE)
const venus = useBody(venusConfig, DEFAULT_TILE_SIZE)

// Chaque corps a son propre bag — règlages indépendants.
mars.graphicsUniforms.uCloudOpacity.value  = 0.4
venus.graphicsUniforms.uWaveStrength.value = 1.6
```

### 2. Canal partagé (panneau global)

```ts
import {
  useBody,
  createGraphicsUniforms,
  DEFAULT_TILE_SIZE,
} from '@cedric-pouilleux/stellar-hex/core'

const uniforms = createGraphicsUniforms()

const mars  = useBody(marsConfig,  DEFAULT_TILE_SIZE, { graphicsUniforms: uniforms })
const venus = useBody(venusConfig, DEFAULT_TILE_SIZE, { graphicsUniforms: uniforms })

// Un seul slider, deux bodies impactés.
qualityPanel.on('cloudOpacity', v => uniforms.uCloudOpacity.value = v)
qualityPanel.on('foamThreshold', v => uniforms.uFoamThreshold.value = v)
```

::: tip Pourquoi `{ value: x }` et pas `x` ?
Le bag stocke chaque champ comme `IUniform` Three.js (`{ value }`). Le shader **lit la même référence chaque frame** — il suffit de muter `.value`, jamais besoin de réassigner l'objet ni d'appeler une API de propagation.
:::

## Catalogue complet

### Toggles (0 / 1)

| Uniform | Défaut | Effet |
| ------- | ------ | ----- |
| `uWaterEnabled`       | `1.0` | Master du shader de vagues sur la coquille liquide. `0` désactive bump + tinting. |
| `uTerrainBumpEnabled` | `1.0` | Master du bump-mapping terrain. `0` aplatit l'éclairage hex. |
| `uEdgeBlendEnabled`   | `1.0` | Master du blend de couleur inter-tuiles. `0` produit des hex à bordure dure. |
| `uLiquidVisible`      | `1.0` | Quand `0`, la coquille liquide discard chaque fragment — expose le fond marin. |

### Cloud shell

| Uniform | Défaut | Plage utile | Effet |
| ------- | ------ | ----------- | ----- |
| `uCloudOpacity` | `0.90` | `0..1` | Alpha de la couche nuageuse (multiplié avec la couverture par-vertex). |
| `uCloudSpeed`   | `1.0`  | `0..3` | Multiplicateur de vitesse de drift. |
| `uCloudColor`   | blanc  | `THREE.Color` | Tint global appliqué aux nuages. |

### Liquid shell

| Uniform | Défaut | Plage utile | Effet |
| ------- | ------ | ----------- | ----- |
| `uWaveStrength`     | `1.0`  | `0..3`     | Amplitude du bump des vagues. |
| `uWaveSpeed`        | `2.8`  | `0..6`     | Vitesse d'animation. |
| `uWaveScale`        | `5.0`  | `1..15`    | Fréquence spatiale — petit = houles, grand = clapot serré. |
| `uSpecularIntensity`| `0.9`  | `0..2`     | Intensité du reflet soleil. |
| `uSpecularSharpness`| `80.0` | `8..200`   | Exposant Phong — fort = point spéculaire net, faible = halo diffus. |
| `uFresnelPower`     | `5.0`  | `1..12`    | Exposant fresnel — fort = bord agressivement éclairé. |
| `uLiquidRoughness`  | `0.35` | `0..1`     | Override roughness PBR — `0` = miroir, `1` = mat. |
| `uDepthDarken`      | `0.50` | `0..1`     | Atténuation par-fragment de la profondeur. |
| `uLiquidOpacity`    | `0.88` | `0..1`     | Alpha — override le `material.opacity` (sliders sans rebuild). |
| `uFoamThreshold`    | `1.0`  | `0..1`     | Seuil au-dessus duquel l'écume apparaît. `1` = écume désactivée. |
| `uFoamColor`        | blanc  | `THREE.Color` | Tint de l'écume sur les crêtes. |

### Terrain shader

| Uniform | Défaut | Plage utile | Effet |
| ------- | ------ | ----------- | ----- |
| `uBumpStrength`      | `2.0`  | `0..5`  | Amplitude du bump-mapping terrain. |
| `uEdgeBlendStrength` | `0.25` | `0..1`  | Amplitude du blend de couleur inter-tuiles. |

## Mutation live

Les uniforms peuvent être mutés à tout moment depuis n'importe où — la frame suivante les lit :

```ts
function onPause() {
  body.graphicsUniforms.uWaveSpeed.value = 0      // gel des vagues
  body.graphicsUniforms.uCloudSpeed.value = 0     // gel des nuages
}

function onSlowMotion() {
  body.graphicsUniforms.uWaveSpeed.value = 0.5
  body.graphicsUniforms.uCloudSpeed.value = 0.3
}
```

Pas besoin d'appeler `material.needsUpdate` ni de `tick()` particulier — c'est juste un changement de valeur dans un `IUniform`.

## Vs `BodyMaterial.setParams()`

Deux canaux différents pour deux familles de paramètres :

| Canal | Famille | Exemples |
| ----- | ------- | -------- |
| `graphicsUniforms` | Effets **partagés** entre coquilles (cloud / liquid / terrain) | foam, depth darken, edge blend, wave bump |
| `body.planetMaterial.setParams()` | Paramètres **du shader procédural** par type de corps | `roughness`, `craterCount`, `crackAmount`, `lavaColor`, `terrainArchetype`, `bandSharpness`… |

Règle pratique :
- Si le réglage doit s'appliquer à **plusieurs corps en même temps** ou à **plusieurs coquilles d'un même corps** → `graphicsUniforms`.
- Si le réglage est **spécifique à une famille shader** (`LibBodyType` interne : `rocky` / `gaseous` / `metallic` / `star` — distinct de la taxonomie publique `BodyType` + `surfaceLook`, cf. [API avancée](/guides/advanced-api)) ou décrit l'**identité** du corps → `setParams`.

## Performance

Le bag est **déjà alloué** à `useBody` — il n'y a aucun coût à le récupérer ou à muter ses valeurs. Un seul bag global partagé entre N corps :

- évite N allocations,
- garantit la **cohérence visuelle** sur tout l'écran (un slider = un look),
- reste sans coût (les uniforms sont lus dans la pipeline shader normale).

## Voir aussi

- [Shaders & matériaux](/guides/shaders-and-materials) — l'autre canal (`setParams`)
- [Performance](/guides/performance) — pour le coût des couches optionnelles
- [API : `GraphicsUniforms`](/api/core/interfaces/GraphicsUniforms)
- [API : `createGraphicsUniforms`](/api/core/functions/createGraphicsUniforms)
