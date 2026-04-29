# Curseur de survol

La lib expose un **curseur unifié** déclenché par le survol d'une tuile, identique sur les trois layers (`sol` / `liquid` / `atmo`). Le caller raycast, la lib gère les visuels — quatre primitives indépendamment paramétrables, switchables à la volée par presets nommés.

## Les quatre primitives

| Primitive | Layers | Effet |
| --------- | ------ | ----- |
| `ring`      | sol / liquid / atmo | Contour fin tracé sur le **sommet visible** de la tuile (cap sol, waterline, cap atmo) |
| `floorRing` | liquid uniquement   | Jumeau du ring tracé sur le **fond marin** sous la tuile océan — révèle la tuile sol underneath |
| `emissive`  | sol / liquid / atmo | `THREE.PointLight` au mid-prism — éclaire les voisins via PBR |
| `column`    | liquid uniquement   | Prisme opaque émissif entre seabed et waterline — visualise le volume sous-marin |

Chaque primitive peut être désactivée (`false`) ou paramétrée (couleur, taille, opacité, intensité). Les valeurs par défaut donnent un curseur blanc neutre fonctionnel sans config.

## Initialisation — un seul style

```ts
const body = useBody(config, DEFAULT_TILE_SIZE, {
  hoverCursor: {
    ring:      { color: 0xffffff, size: 1, opacity: 1 },
    floorRing: { color: 0x9ad9ff, opacity: 0.7 },
    emissive:  { color: 0xffffff, intensity: 1.5, size: 0.6 },
    column:    { color: 0xffffff },
  },
})
```

Une primitive omise tombe sur ses défauts ; mise à `false`, elle n'est pas allouée GPU et ne peut pas être réactivée à chaud.

## Initialisation — presets multiples

Pour gérer plusieurs intentions de gameplay (attaque, construction, inspection…), enregistre un dictionnaire de presets nommés. La lib alloue automatiquement l'**union** des primitives utilisées par n'importe quel preset, donc tu peux switcher entre eux à volonté.

```ts
const body = useBody(config, DEFAULT_TILE_SIZE, {
  hoverCursors: {
    default: {
      ring:      { color: 0xffffff },
      floorRing: { color: 0x9ad9ff, opacity: 0.7 },
      emissive:  { color: 0xffffff, intensity: 1.5 },
    },
    attack: {
      ring:     { color: 0xff2244 },
      emissive: { color: 0xff4400, intensity: 3 },
    },
    build: {
      ring:    { color: 0x00ff88 },
      column:  { color: 0x00ff88 },
    },
    inspect: {
      ring:      { color: 0xffaa00, size: 1.4 },
      floorRing: { color: 0xffaa00 },
      emissive:  false,
    },
  },
  defaultCursor: 'default', // optionnel — sinon prend la première clé
})

// Switch côté gameplay
body.hover.useCursor('attack')
body.hover.useCursor('build')
```

::: tip Allocation par union
Le `column` est alloué uniquement parce que le preset `build` le mentionne. Si **aucun** preset ne le déclare, il ne sera jamais constructible — `useCursor` d'un preset qui le veut serait silencieusement no-op sur cette primitive. **Règle** : déclare au moins un preset utilisant chaque primitive que tu prévois d'activer.
:::

## Boucle de hover (3 lignes)

```ts
function tickFrame() {
  raycaster.setFromCamera(pointer, camera)
  body.hover.setBoardTile(body.interactive.queryHover(raycaster))
  renderer.render(scene, camera)
}
```

`queryHover` raycast les boards visibles, retourne `{ layer, tileId } | null`. `setBoardTile` route vers le bon dispatcher visuel : sur sol → `ring + emissive`, sur liquid → `ring + floorRing + emissive + column`, sur atmo → `ring + emissive`, sur `null` → tout clear.

## Mutation live sans rebuild

```ts
// Tu peux changer n'importe quel paramètre à chaud
body.hover.updateCursor({
  ring:    { color: 0xffaa00 },     // cap → orange
  column:  false,                    // disable underwater prism
  emissive:{ intensity: 3 },        // boost beacon
})
```

Couleurs / opacités / intensités s'appliquent immédiatement. Les changements de taille (ring, distance emissive) se rejouent au prochain `setBoardTile` ou via `cursor.refresh()` interne.

## Listener sol

```ts
const off = body.hover.onChange(tileId => {
  if (tileId !== null) showTooltip(tileId)
  else hideTooltip()
})
// ...
off()  // unsubscribe
```

Émet uniquement les changements de tuile **sol** (atmo / liquid envoient `null` pour ne pas confondre les consumers du listener).

## Cycle de vie

| Action | API |
| ------ | --- |
| Construction + config | `useBody(cfg, tileSize, { hoverCursor }` ou `{ hoverCursors, defaultCursor }` `)` |
| Détection             | `body.interactive.queryHover(raycaster)` → `BoardTileRef \| null` |
| Visual dispatch       | `body.hover.setBoardTile(ref)` |
| Switch preset         | `body.hover.useCursor(name)` |
| Tuning live           | `body.hover.updateCursor(partial)` |
| Listener sol          | `body.hover.onChange(cb)` |
| Cleanup               | `body.dispose()` (cursor + GPU resources libérés) |

## Caveat sur les primitives `false`

Une primitive construite avec `false` (ou absente de tous les presets) **n'a pas de ressource GPU**. Pas de mesh ring, pas de point light, pas de matériau column. La conséquence pratique :

```ts
// ❌ Mauvaise approche
useBody(cfg, tileSize, { hoverCursor: { column: false } })
body.hover.updateCursor({ column: { color: 0xffffff } }) // ← no-op
```

```ts
// ✅ Bonne approche : construis ce que tu veux pouvoir toggler
useBody(cfg, tileSize, {
  hoverCursor: { column: { color: 0xffffff } },
})
body.hover.updateCursor({ column: false })                // hide
body.hover.updateCursor({ column: { color: 0xff0000 } }) // re-show in red
```

Pareil pour les presets : si tu veux qu'un preset puisse activer la column, il faut qu'au moins un autre preset (ou ce preset lui-même) la déclare.

## Performance

- Ring + floorRing : meshes pre-alloués, mise à jour `Float32BufferAttribute` en place — pas de réallocation par hover.
- Emissive : `THREE.PointLight` unique repositionné — pas de shadow casting (irrelevant ici).
- Column : mesh + matériau créés / disposés à chaque hover liquid. Coût ~0.2 ms par swap, négligeable au taux de hover utilisateur.

Aucune des primitives n'impacte le rendu shader ou le pipeline post-process — elles vivent dans `body.group` et suivent la rotation / l'axial tilt naturellement.

## Voir aussi

- [Mode jouable](/examples/hex-tiles/playable-mode) — exemple complet avec interactions
- [Visualiseur interactif](/examples/hex-tiles/interactive-viewer) — pattern raycast minimal
- [API : `BodyHover`](/api/core/interfaces/BodyHover)
- [API : `HoverCursorConfig`](/api/core/interfaces/HoverCursorConfig)
