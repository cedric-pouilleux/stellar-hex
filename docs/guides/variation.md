# Variation visuelle

`BodyVariation` est l'**identité visuelle** d'un corps — un sac de ~50 valeurs (seeds, multiplicateurs, opacités, couleurs aléatoires) calculées **déterministement** depuis le `BodyConfig.name` et consommées par les shaders. C'est le pendant visuel de `BodyConfig` : là où ce dernier dit *« ce corps a-t-il un océan, des fissures, des anneaux »*, `BodyVariation` dit *« exactement à quoi ils ressemblent »*.

## Pourquoi deux concepts séparés ?

Le commentaire dans [render/body/bodyVariation.ts](render/body/bodyVariation.ts) résume le partage :

> **Physics (`BodyConfig`) sets whether features exist and their maximum values.**
> **Variation sets the exact visual expression within those constraints.**

Concrètement :

| Décision | Lieu | Exemple |
| -------- | ---- | ------- |
| « Ce corps a-t-il des fissures ? » | `BodyConfig` (`hasCracks: true`) | Game logic / catalogue |
| « Avec quelle largeur, quelle échelle, quel mode de blend ? » | `BodyVariation` | Seedé depuis `name` |
| « Quel nuage de bandes (Saturne / Jupiter / ...) ? » | `BodyConfig.bandColors` | Palette caller-resolved |
| « Quelle nuance précise dans le warm/cool, quelle luminance ? » | `BodyVariation.gasColorMix`, `gasLuminance` | Seedé |

Cette séparation garantit que **deux corps avec le même `name` rendent identiquement** sur n'importe quelle machine — c'est le contrat de déterminisme de la lib.

## Génération automatique

`useBody(config, tileSize)` appelle `generateBodyVariation(config)` en interne. Vous n'avez rien à faire pour qu'un corps ait une identité visuelle.

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
console.log(body.variation.gasBandSharpness) // 0.10–0.65, déterministe
```

## Override avant `useBody`

Trois patterns courants pour remplacer une partie de la variation :

### 1. Variation pré-calculée (cache)

`generateBodyVariation` est **pure** — vous pouvez la cacher par `name` (cf. [Performance §6](/guides/performance#_6-r%C3%A9utiliser-les-variations-proc%C3%A9durales)) et la passer en option :

```ts
import { useBody, generateBodyVariation } from '@cedric-pouilleux/stellex-js/core'

const variation = generateBodyVariation(config)
const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
```

### 2. Override partiel (mutate then build)

```ts
const variation = generateBodyVariation(config)

// On force un look « volcanique » indépendant du seed
variation.lavaIntensity = 0.7
variation.lavaColor     = '#ff5520'
variation.crackIntensity = 0.5

const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
```

### 3. Override d'anneau spécifiquement

```ts
import { ARCHETYPE_PROFILES } from '@cedric-pouilleux/stellex-js/core'

const variation = generateBodyVariation(config)
if (variation.rings) {
  variation.rings = {
    ...variation.rings,
    archetype: 'shepherd',
    profile:   ARCHETYPE_PROFILES.shepherd,
  }
}
const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
```

## Le piège « features 0 par défaut »

**Les fissures et la lave partent à `crackIntensity = 0` / `lavaIntensity = 0`.** Pousser uniquement `hasCracks: true` ou `hasLava: true` dans `BodyConfig` **ne suffit pas** à les voir — ce sont des flags d'autorisation, pas d'activation. La doctrine est explicite : la lib n'a pas de modèle qui décide *quand* afficher des fissures (température ? âge ? activité tectonique ?), donc le caller doit pousser une intensité non nulle quand son gameplay le décide.

```ts
// ❌ Ne suffit pas — pas de fissures visibles
useBody({ ..., hasCracks: true }, DEFAULT_TILE_SIZE)

// ✅ Avec intensité poussée par le caller
const variation = generateBodyVariation(config)
variation.crackIntensity = 0.6
useBody(config, DEFAULT_TILE_SIZE, { variation })

// ✅ Ou en runtime sur le matériau
body.planetMaterial.setParams({ crackAmount: 0.6 })
```

Pareil pour la lave (`lavaIntensity` → `lavaAmount` shader).

::: tip Pourquoi cette friction ?
La lib pourrait pousser un `crackIntensity` aléatoire par défaut, mais ça créerait deux problèmes : (1) `hasCracks: true` deviendrait *visuel* alors que c'est censé être un gate de capacité, (2) un caller qui veut un look propre devrait pusher `0` explicitement. Le défaut « éteint » respecte l'invariant *« un corps qui n'opte pas dans une fonctionnalité ne la verra pas »*.
:::

## Catalogue des champs

### Bruit partagé (toutes planètes)

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `noiseSeed` | `[-50..50]³` | Décalage du domaine simplex — change la « personnalité » du relief |
| `noiseFreq` | 0.65–1.55 | Multiplicateur de fréquence sur le bruit du shader |

### Terrain (rocky / metallic)

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `roughnessMod` | 0.6–1.4 | Multiplicateur sur la rugosité PBR |
| `heightMod` | 0.5–1.5 | Multiplicateur sur l'amplitude du relief |
| `craterDensityMod` | 0.3–1.7 | Multiplicateur sur la densité des cratères |
| `craterCountMod` | 0.4–1.6 | Multiplicateur sur le nombre de cratères |
| `waveAmount` | 0.0–1.0 | Couche vagues (indépendant de la physique) |
| `waveScale` | 0.5–2.5 | Échelle XY des vagues |
| `colorMix` | 0–1 | Shift warm/cool des `colorA`/`colorB` |
| `luminance` | 0.8–1.2 | Brillance globale de la palette |

### Fissures (rocky / metallic)

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `crackIntensity` | 0–1 | **Défaut 0** — caller pousse pour activer |
| `crackWidth` | rocky 0.10–0.50 / metal 0.10–0.40 | Largeur |
| `crackScale` | rocky 1.0–4.0 / metal 1.6–5.0 | Échelle spatiale |
| `crackDepth` | 0.5–1.0 | Profondeur visuelle |
| `crackColor` | hex | Sur rocky, recomputé depuis les ancres terrain |
| `crackBlend` | 0–4 (rocky) / 0 ou 4 (metal) | Mode de fusion |

### Lave (rocky / metallic)

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `lavaIntensity` | 0–1 | **Défaut 0** — caller pousse pour activer |
| `lavaEmissive` | 0.8–2.8 | Intensité d'émission |
| `lavaScale` | 0.3–2.5 (rocky) / 0.3–1.0 (metal) | Largeur des canaux |
| `lavaWidth` | 0.02–0.30 | Finesse des filaments |
| `lavaColor` | hex | Défaut neutre `#cc2200`, caller override pour climat |

### Surface métallique

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `metalness` | 0–1 | Métalicité PBR — variation oxydation / pureté de surface |

### Géante gazeuse — bandes

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `gasBandSharpness` | 0.10–0.65 | Netteté des transitions de bandes |
| `gasBandWarp` | 0.05–0.55 | Déformation sinusoïdale |
| `gasJetStream` | 0.10–0.90 | Intensité des courants équatoriaux |
| `gasTurbulence` | 0.10–0.90 | Turbulence générale |
| `gasCloudDetail` | 0.10–0.75 | Détail des masses nuageuses |

### Géante gazeuse — couleurs et nuages

| Champ | Plage | Effet |
| ----- | ----- | ----- |
| `gasColorMix` | 0–1 | Shift warm/cool dans le preset |
| `gasLuminance` | 0.7–1.3 | Brillance globale |
| `gasCloudAmount` | 0.0–0.65 | Opacité de la couche nuageuse haute |
| `gasCloudColor` | hex | Tint nuage (range neutre `#d0b890` → `#f0e0c0`) |

### Anneaux

| Champ | Type | Effet |
| ----- | ---- | ----- |
| `rings` | `RingVariation \| null` | `null` quand `hasRings !== true` ; sinon archétype + profil + couleurs + opacité |

Cf. [Anneaux simples](/examples/rings/basic) et [Archétypes](/examples/rings/archetypes) pour le détail de `RingVariation`.

## Garantie de stabilité de la séquence PRNG

Le générateur tire **toujours les mêmes échantillons dans le même ordre**, même quand `hasRings` est `false` ou quand la stratégie active n'override pas `solVariationRanges`. Cette discipline garantit que :

- ajouter ou retirer `hasRings: true` ne décale **pas** les couleurs / cracks / lave d'un body (les valeurs ring sont toujours tirées),
- le `DEFAULT_LAVA_COLOR` est posé sur les non-métalliques même quand `lavaIntensity = 0` — la séquence reste déterministe.

Si vous étendez `bodyVariation.ts`, **ajoutez vos `rng()` à la fin** : insérer un appel au milieu décalerait toute la suite et casserait la rétro-compatibilité visuelle des bodies déjà nommés.

## Voir aussi

- [Concepts fondamentaux §3 — Le seed est entièrement déterminé par `name`](/guides/core-concepts#_3-le-seed-est-enti%C3%A8rement-d%C3%A9termin%C3%A9-par-name)
- [Performance §6 — Cache de variation](/guides/performance#_6-r%C3%A9utiliser-les-variations-proc%C3%A9durales)
- [API : `BodyVariation`](/api/core/interfaces/BodyVariation)
- [API : `generateBodyVariation`](/api/core/functions/generateBodyVariation)
