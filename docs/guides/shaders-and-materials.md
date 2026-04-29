# Shaders & matériaux

La lib expose **un seul matériau procédural** par type de corps via la classe [`BodyMaterial`](/api/core/classes/BodyMaterial). Quatre fragment shaders (rocky, metallic, gas, star) partagent un vertex shader commun et un système de paramètres unifié.

## Vue d'ensemble

```ts
import {
  BodyMaterial,
  BODY_PARAMS,
  getDefaultParams,
  SHADER_RANGES,
} from '@cedric-pouilleux/stellar-hex/core'

const params   = getDefaultParams('rocky')
const material = new BodyMaterial({ type: 'rocky', params })
```

| Symbole | Rôle |
| ------- | ---- |
| `BodyMaterial`     | Classe — wrap un `THREE.ShaderMaterial` typé par type de corps |
| `BODY_PARAMS`      | Schéma des paramètres par type (`type`, `min/max/step`, `default`, `optionCount`) — sans labels d'affichage |
| `getDefaultParams` | Renvoie les valeurs par défaut pour un type donné |
| `SHADER_RANGES`    | Bornes min/max/step des sliders |
| `GodRaysShader`    | Pass post-processing god rays |

> **Display labels & UI groups.** La lib n'embarque pas de labels d'affichage ni de regroupement par section — i18n et organisation UI sont à la charge du caller. Le playground maintient un dictionnaire local `paramLabels.ts` (labels anglais + groupes + libellés des `select`) que tu peux reprendre comme référence.

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

## Construire une UI à partir du schéma

`BODY_PARAMS[type]` liste tous les paramètres consommés avec leur type, leurs bornes et leur valeur par défaut. Les labels affichés et le groupement par section sont à toi — le playground maintient un dictionnaire local pour son propre panneau.

```ts
import { BODY_PARAMS, SHADER_RANGES } from '@cedric-pouilleux/stellar-hex/core'

// Caller-side label dictionary — adapt to your i18n / UX.
const LABELS: Record<string, string> = {
  roughness:   'Roughness',
  crackAmount: 'Cracks',
  // …
}

for (const [key, def] of Object.entries(BODY_PARAMS.rocky)) {
  const label = LABELS[key] ?? key
  // def.type, def.default, def.min, def.max, def.step, def.optionCount…
}
```

`playground/src/components/ShaderControls.vue` + `playground/src/lib/paramLabels.ts` montrent un exemple complet de panneau auto-généré à partir du schéma.

## Variations & identité visuelle par planète

La lib expose plusieurs leviers de variabilité automatique (déterministes du `name` du body) ou pilotables via le panneau shader.

### Relief terrain — archetypes (rocky, metallic)

`terrainArchetype` (entier 0–3) sélectionne la forme du FBm utilisé pour le relief :

| Index | Archétype | Effet |
| ----- | --------- | ----- |
| `0` | Lisse (FBM) | Bosses douces classiques (défaut) |
| `1` | Crêtes (Ridged) | Arêtes nettes, chaînes de montagnes |
| `2` | Dunes (Billow) | Mounds arrondis, dunes |
| `3` | Hybride | Plaines en dunes + sommets en crêtes |

L'archetype est consommé **à la fois** par le vertex shader (displacement géométrique) et le fragment (motif coloré), donc la silhouette suit le pattern.

```ts
material.setParams({ terrainArchetype: 1 })  // crêtes
```

En complément, le shader rocky module l'amplitude du domain-warp via `hash1(uSeed)` — chaque planète a une « tortuosité » distincte sans aucune action utilisateur.

### Atmosphère — halo et nuages (rocky, metallic)

Le bloc **Atmosphère** centralise tout ce qui pilote l'atmo shell live (sans rebuild) :

| Param | Effet |
| ----- | ----- |
| `atmoTint` | Couleur du halo — Mars rouille, Vénus jaune, Pluton bleu glacé |
| `atmoOpacity` | Opacité globale du halo |
| `atmoColorMix` | Mix entre tint procédural et couleurs des tuiles peintes |
| `waveAmount` / `waveColor` / `waveScale` / `waveSpeed` | Couche nuages (couverture, teinte, fréquence, vitesse de drift) |
| `cloudPattern` | Preset structurel : `Dispersé` / `Cyclones` / `Voile` |

`cloudPattern` configure simultanément `bandiness`, `turbulence`, `storms` et `bandFreq` de l'atmo shell pour produire des identités atmosphériques distinctes — Terre cycloned, Vénus voilée, etc.

### Tempêtes — vortex (gaseous)

Les géantes gazeuses portent jusqu'à **3 vortex ovales** (taches type Jupiter) dont la position, la taille et le sens de rotation sont dérivés du seed du body. Pilotables via :

| Param | Effet |
| ----- | ----- |
| `stormStrength` | Visibilité globale (`0` = vortex désactivés) |
| `stormColor` | Couleur dédiée des taches (indépendante du palette gaz) |
| `stormSize` | Multiplicateur de rayon (0.3 = mini ovales, 2.5 = grandes bandes) |
| `stormEyeStrength` | Intensité de l'œil sombre central |

Chaque vortex a une structure à 3 zones (couronne extérieure, cœur saturé avec spirale animée, œil sombre) et bende localement les bandes du gaz.

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
