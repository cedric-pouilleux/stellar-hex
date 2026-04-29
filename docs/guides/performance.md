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
import { generateBodyVariation } from '@cedric-pouilleux/stellar-hex/core'

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

## 10. Profiler

- **Spector.js** pour inspecter les draw calls.
- **DevTools Performance** + flamegraph sur `body.tick`.
- L'option `renderer.info` de Three.js donne le compte de triangles / draw calls / textures.
