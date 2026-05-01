# Performance

Ce guide rassemble les leviers concrets pour tenir 60 fps avec plusieurs corps en scène.

## 1. Choisir la bonne `tileSize`

`tileSize` (deuxième argument de `useBody`) détermine **la subdivision de l'hexasphère** via `tileSizeToSubdivisions(radius, tileSize)`. Le coût mesh croît en `1 / tileSize²`.

| `tileSize` | Tuiles approximatives (rayon=1) | Usage typique |
| ---------- | ------------------------------- | ------------- |
| `0.20`     | ~310                            | Thumbnail, prévisualisation |
| `0.10`     | ~1 250                          | Vue système solaire (multi-corps) |
| `0.05`     | ~5 000                          | Vue planétaire (defaut) |
| `0.025`    | ~20 000                         | Inspection rapprochée |

`DEFAULT_TILE_SIZE = 0.05` est un bon compromis pour un corps unique en plein écran.

::: warning Tile-ref ≠ silhouette pour les planètes à atmo épaisse
Pour les planètes, le tile count n'est pas calculé sur `radius` mais sur `radius × (1 - atmosphereThickness)` (cf. [useBody.ts:78](render/body/useBody.ts)). Une planète `radius = 1` à `atmosphereThickness = 0.6` aura ~40 % du tile count d'une planète sèche de même `radius`. Raison : sol et atmo doivent garder le même footprint apparent par tuile, sinon le sol aurait des tuiles minuscules. Pour les étoiles, le tile-ref vient de la table `STAR_TILE_REF[spectralType]` (un rayon de référence par classe) — toggler la classe spectrale change donc le tile count à `radius` constant.
:::

**Limite basse pratique** : à `tileSize = 0.025` (≈ subdivisions 9 sur radius=1), vous tournez autour de 20 000 tuiles. Descendre plus bas tape vite dans la limite de précision float du raycaster et l'upload du BVH devient sensible (~50 ms). En dessous de `0.015`, vous perdez la stabilité du `mergeVertices` (les hexagones partagent des bords sub-pixel). Si vous voulez une vue rapprochée plus dense, **scalez le `radius` du body** plutôt que de pousser `tileSize` à zéro.

## 2. Mode interactif uniquement quand nécessaire

`useBody` construit par défaut une **smooth sphere** (mesh continu) — bien moins coûteuse que le mesh hexagonal. Le mesh hex (cliquable) n'est construit qu'au premier appel à `body.interactive.activate()` :

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
scene.add(body.group)

// Pour les vues d'ensemble (scrolling système) :
// → ne pas activer le mode interactif → 1 sphère lisse, ~20 vertices

// Pour la vue détaillée :
body.interactive.activate()
// → swap vers le mesh hex, raycast actif
```

Vous pouvez `deactivate()` pour repasser en smooth sphere : le mesh hex reste en mémoire pour réactivation rapide.

## 3. Raycasting accéléré (BVH)

Le raycasting hex utilise [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) automatiquement quand le mode interactif est activé. Concrètement :

- Sans BVH : `O(n)` par ray (1 250 tuiles → ~20 ms par hover sur CPU mobile).
- Avec BVH : `O(log n)` par ray (1 250 tuiles → ~0.1 ms).

Le BVH est construit **une seule fois** à l'activation. Si vous mutez la géométrie (rare — la lib ne le fait pas), reconstruisez-le via `body.interactive.refresh()`.

## 4. Couches optionnelles : payez ce que vous utilisez

Chaque couche est une draw call supplémentaire :

| Couche | Coût indicatif |
| ------ | -------------- |
| `<BodyRings>`         | 1 disque + alpha test (faible) |
| `buildAtmoShell`      | 1 sphère + uniforms atmo (modéré, géantes gazeuses) |
| `buildLiquidShell`    | 1 coquille hex top-fan + vagues animées sur la face supérieure (modéré, mondes liquides) |
| God rays              | 1 pass post-process (élevé) |

Astuce : sur les vues système (multi-corps loin), désactivez les god rays et basculez les corps en mode shader (sans hex), ce qui supprime à la fois le BVH et l'overlay de tuiles.

## 5. `body.tick(dt)` est le point chaud

Pour `n` corps animés, c'est `n` appels à `body.tick`. Si vous gérez vous-même la pause / replay :

```ts
for (const body of bodies) {
  if (paused) continue
  body.tick(dt * speedMultiplier)
}
```

Évitez d'appeler `tick(0)` — c'est un no-op mais ça itère quand même les uniforms.

## 6. Réutiliser les variations procédurales

`generateBodyVariation(config)` est appelé par `useBody`. Il produit la `RingVariation`, la `BodyVariation` et tout ce qui dérive du seed. C'est **pur et déterministe** — vous pouvez le mettre en cache par `config.name` :

```ts
import { generateBodyVariation } from '@cedric-pouilleux/stellex-js/core'

const cache = new Map<string, ReturnType<typeof generateBodyVariation>>()

function getVariation(config: BodyConfig) {
  let v = cache.get(config.name)
  if (!v) {
    v = generateBodyVariation(config)
    cache.set(config.name, v)
  }
  return v
}
```

Particulièrement utile pour des UI où le `BodyConfig` est régénéré à chaque tick mais où le `name` ne change pas.

## 7. Sharing palettes / matériaux

`BodyMaterial` est une classe — chaque corps en a sa propre instance (uniforms par-corps). Si vous avez 50 astéroïdes identiques en arrière-plan, **partagez** une seule instance et utilisez `THREE.InstancedMesh` :

```ts
const baseBody     = useBody(config, 0.2)
const instanceMesh = new THREE.InstancedMesh(
  baseBody.group.children[0].geometry,
  baseBody.group.children[0].material,
  50,
)
```

Vous perdez le hover par-instance — à arbitrer selon vos besoins.

## 8. Précompute serveur

Si votre back génère le `BodySimulation` côté serveur :

- expédiez le `BodyConfig` complet,
- le client refait l'`initBodySimulation` en local — c'est rapide (quelques ms par corps) mais pas gratuit,
- alternative : sérialisez `tileStates` + `seaLevelElevation` et reconstituez côté client. Vous économisez la noise/percentile mais payez la sérialisation. Pour un corps standard, c'est rarement gagnant.

## 9. Disposer rigoureusement

Chaque `useBody` alloue : 1+ géométries hex, 1+ matériaux, 1+ textures de palette, 1 BVH (si interactif). Sans `dispose()`, ça **fuit**. Avec `<Body>`, c'est automatique au démontage. En vanille :

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
// …
body.dispose()
scene.remove(body.group)
```

## 10. `RenderQuality` — bumper la finesse des sphères

`useBody` accepte une option `quality` qui bump la subdivision **icosphère** de toutes les sphères du body (smooth surface, liquid sphere, atmo shell, corona, core, effect layer). Le mesh hex (qui dérive de `tileSize`) n'est **pas** affecté — c'est un knob purement visuel pour les couches lisses.

```ts
const body = useBody(config, DEFAULT_TILE_SIZE, { quality: { sphereDetail: 'high' } })
```

| Preset | Effet | Coût (≈ tris sur les sphères) |
| ------ | ----- | ------------------------------- |
| `'standard'` (défaut) | Aucun bump — niveau historique | référence |
| `'high'` | +1 subdivision (~×4 tris) | × 4 |
| `'ultra'` | +2 subdivisions (~×16 tris) | × 16 |

Le plafond dur est `MAX_SPHERE_DETAIL = 7` (≈ 163 842 vertices après `mergeVertices`). `'ultra'` clamp à ce plafond — pousser plus loin (8 ≈ 655 k vertices) tue la GPU sans gain visuel correspondant.

Le type [`SphereDetailQuality`](/api/core/type-aliases/SphereDetailQuality) (`'standard' | 'high' | 'ultra'`) est exposé si vous voulez binder un sélecteur d'UI dessus. Pour résoudre le niveau effectif d'icosphère depuis un preset (panneau debug, builder custom), [`resolveSphereDetail(baseDetail, quality?)`](/api/core/functions/resolveSphereDetail) applique le bump et clamp à `MAX_SPHERE_DETAIL` :

```ts
import { resolveSphereDetail, MAX_SPHERE_DETAIL } from '@cedric-pouilleux/stellex-js/core'

const level = resolveSphereDetail(4, { sphereDetail: 'ultra' })
// 4 + 2, clampé à MAX_SPHERE_DETAIL
```

Quand l'utiliser :

- **`'high'` ou `'ultra'`** : vue planétaire close-up + atmo épaisse (le shell atmo bénéficie particulièrement de la densité — moins de banding sur les gradients).
- **`'standard'`** : tout le reste, particulièrement les vues système (multi-corps).

## 11. Profiler

- **Spector.js** pour inspecter les draw calls.
- **DevTools Performance** + flamegraph sur `body.tick`.
- L'option `renderer.info` de Three.js donne le compte de triangles / draw calls / textures.
