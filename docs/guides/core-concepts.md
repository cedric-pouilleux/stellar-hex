# Concepts fondamentaux

Cette page condense les invariants à connaître **avant** de toucher à un composant ou un shader.

## 1. La séparation `sim` / `core` / `vue`

```
sim/         ← logique pure : hex, FBM, élévations, niveau de la mer
   ↓
core/        ← Three.js : matériaux, builders mesh, raycast, palettes
   ↓
index.ts/    ← Vue + TresJS : composants <Body>, <BodyRings>, <BodyController>…
```

Chaque couche dépend uniquement de la précédente. Concrètement :

- Vous pouvez générer un `BodySimulation` côté serveur, sérialiser les tuiles en JSON, les renvoyer au client, et **rebuild la même planète** en réinjectant le même `BodyConfig` (le seed est suffisant).
- `core` est utilisable sans Vue (Pixi, R3F, vanilla Three.js).
- La racine est strictement additive : tout ce qui est dans `core` est aussi exporté à la racine.

## 2. `BodyConfig` est composé de quatre profils

Il n'existe pas une « grosse interface plate ». [`BodyConfig`](/api/sim/type-aliases/BodyConfig) est l'intersection de quatre sous-profils :

| Sous-profil | Contenu | Quand l'utiliser |
| ----------- | ------- | ---------------- |
| `BodyIdentity` | `name`, `type` | Tous les sous-systèmes en ont besoin |
| `BodyPhysics`  | masse, rayon, vitesse de rotation, atmosphère, liquide | Sim + render |
| `BodyNoiseProfile` | `noiseScale`, `noiseOctaves`, `noisePersistence`, `noiseRidge`, … | FBM personnalisé |
| `BodyVisualProfile` | couleurs liquide, palettes métalliques/gaz, fissures, lave, anneaux | Render uniquement |

Les fonctions de signature étroite (`resolveStarData`, `buildStarPalette`, …) typent leur paramètre contre le profil minimal qu'elles consomment, pas contre `BodyConfig` entier.

## 3. Le seed est entièrement déterminé par `name`

Toutes les sources d'aléatoire (FBM, distribution des cratères, variation des anneaux, distribution des bandes gaz) passent par un PRNG seedé à partir du **nom** du corps. Conséquence :

- Deux corps avec le même `name` produisent **exactement** les mêmes tuiles, le même niveau de la mer, les mêmes anneaux.
- Vous pouvez encoder un état complet dans une URL en sérialisant uniquement le `BodyConfig` — le rendu est rejouable.
- **Aucun appel à `Math.random()` nu** dans la lib. Si vous étendez le code, utilisez `prng(name)` (cf. `internal/prng.ts`).

## 4. Le pipeline de rendu

Pour un corps non-stellaire, `useBody(config, tileSize)` enchaîne :

1. **Subdivision** — `generateHexasphere(radius, subdivisions)` → tuiles 3D.
2. **Simulation** — `initBodySimulation(tiles, config)` → élévations quantifiées, niveau de la mer, couverture liquide.
3. **Palette** — `choosePalette(config)` route vers le bon générateur (`generateTerrainPalette`, `buildGasPalette`, `buildMetallicPalette`, `buildStarPalette`).
4. **Mesh sol** — `buildLayeredInteractiveMesh` (rocheuse/métallique en mode hex) ou `BodyMaterial` sur sphère lisse (gaz/étoile, ou rocheuse en mode shader).
5. **Couches additionnelles** — anneaux, sphère liquide, atmo / aura, overlays de tuiles sont **opt-in** via `<BodyRings>`, `buildAtmoShell`, `buildLiquidSphere`.

Le tout retourne un [`Body`](/api/core/type-aliases/Body) — une **union discriminée** `PlanetBody | StarBody` :

- `body.kind === 'planet'` (rocheuses, gazeuses, métalliques) — porte `liquid`, `view`, `atmoShell`, `liquidCorona` et la version étendue de `tiles` avec les mutations sol-côté (`updateTileSolHeight`, `applyTileOverlay`, `paintAtmoShell`, …).
- `body.kind === 'star'` — porte uniquement les primitives communes (`group`, `sim`, `palette`, `interactive`, `hover`, `tiles` minimal). Les namespaces planet-only sont **absents** sur le type, le compilateur les rejette si on les touche sans narrowing.

Pattern caller :

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
if (body.kind === 'planet') {
  body.liquid.setSeaLevel(1.0)
  body.view.set('atmosphere')
}
```

## 5. Les responsabilités du *caller*

La lib s'arrête volontairement avant trois préoccupations :

- **L'orbite** — pas de mécanique orbitale interne. Vous écrivez la position du `body.group` chaque frame.
- **La présence des couches optionnelles** — anneaux, atmo opaque, halo, sphère liquide ne sont jamais générés implicitement. Vous activez chaque couche via les flags du `BodyConfig` (`hasRings`, `liquidState`, `atmosphereThickness`…) ou en montant directement `<BodyRings>`.
- **La chimie et les phases** — `liquidState` est le seul flag de présence ; `liquidColor`, `bandColors`, `metallicBands`, `lavaColor` doivent être fournis par votre catalogue. La lib ne dérive jamais une couleur depuis un nom de substance ni une phase depuis une température. Le `playground/src/lib/` est une implémentation de référence.

Cette discipline garde la lib **agnostique du jeu** : un simulateur de système solaire éducatif et un Stellaris-like consomment la même API sans qu'elle prenne parti.

## 6. Le système de tuiles

Les élévations sont **quantifiées en bandes entières** :

- `elevation ∈ [0, N-1]` où `N = resolveTerrainLevelCount(radius, coreRatio)`.
- `seaLevelElevation` est une bande, pas un float.
- `resolveTileLevel(seaLevel, elevation)` retourne un index **signé relatif** à la mer : `0` = waterline, `-1` = un cran sous l'eau, `+1` = un cran au-dessus.

C'est cette quantification qui permet de raycaster une tuile et de connaître son altitude **sans** échantillonner le bruit.

## 7. Cycle de vie des handles

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
scene.add(body.group)

// chaque frame :
body.tick(dt)              // avance la rotation + uniforms shader

// au démontage :
body.dispose()             // libère GPU, materials, geometries
```

Oublier `dispose()` lors d'un swap de scène (HMR, route Vue, etc.) **fuit** des buffers GPU. Avec `<Body>`, le démontage du composant appelle `dispose()` automatiquement.
