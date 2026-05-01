# Curseur de survol

La lib expose un **curseur unifié** déclenché par le survol d'une tuile, identique sur les trois layers (`sol` / `liquid` / `atmo`). Le caller raycast, la lib gère les visuels — trois primitives indépendamment paramétrables, switchables à la volée par presets nommés.

## Les trois primitives

| Primitive | Layers | Effet |
| --------- | ------ | ----- |
| `ring`      | sol / liquid / atmo | Contour fin tracé sur le **sommet visible** de la tuile (cap sol, waterline, cap atmo) |
| `floorRing` | liquid uniquement   | Jumeau du ring tracé sur le **fond marin** sous la tuile océan — révèle la tuile sol underneath |
| `emissive`  | liquid / atmo       | `THREE.PointLight` au mid-prism — éclaire les voisins via PBR (désactivé en hover sol pour préserver la lecture du terrain) |

Chaque primitive peut être désactivée (`false`) ou paramétrée (couleur, taille, opacité, intensité). Les valeurs par défaut donnent un curseur blanc neutre fonctionnel sans config.

::: tip Comportements implicites en hover liquide
La lib force la lisibilité du seabed sans que tu aies à le configurer :

- `floorRing` est forcé à `opacity = 0.20` en hover liquide.
- `floorRing` devient **rouge** quand la tuile sol sous-jacente est minée jusqu'au noyau (core window) — alerte visuelle « pas de fond solide ici ».

Le ring du dessus garde la couleur / opacité que tu as configurées.
:::

## Initialisation — un seul style

```ts
const body = useBody(config, DEFAULT_TILE_SIZE, {
  hoverCursor: {
    ring:      { color: 0xffffff, size: 1, opacity: 1 },
    floorRing: { color: 0x9ad9ff },
    emissive:  { color: 0xffffff, intensity: 1.5, size: 0.6 },
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
      ring: { color: 0x00ff88 },
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
Une primitive est allouée GPU si **au moins un** preset la mentionne. Si aucun preset ne la déclare, elle ne sera jamais constructible — `useCursor` d'un preset qui la veut serait silencieusement no-op sur cette primitive. **Règle** : déclare au moins un preset utilisant chaque primitive que tu prévois d'activer.
:::

## Boucle de hover (3 lignes)

```ts
function tickFrame() {
  raycaster.setFromCamera(pointer, camera)
  body.hover.setBoardTile(body.interactive.queryHover(raycaster))
  renderer.render(scene, camera)
}
```

`queryHover` raycast les boards visibles, retourne `{ layer, tileId } | null`. `setBoardTile` route vers le bon dispatcher visuel : sur sol → `ring` (sans emissive), sur liquid → `ring + floorRing + emissive`, sur atmo → `ring + emissive`, sur `null` → tout clear.

## Mutation live sans rebuild

```ts
// Tu peux changer n'importe quel paramètre à chaud
body.hover.updateCursor({
  ring:      { color: 0xffaa00 },   // cap → orange
  floorRing: { color: 0x9ad9ff },   // seabed twin → bleu glacé
  emissive:  { intensity: 3 },      // boost beacon
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

Une primitive construite avec `false` (ou absente de tous les presets) **n'a pas de ressource GPU**. Pas de mesh ring, pas de point light. La conséquence pratique :

```ts
// ❌ Mauvaise approche
useBody(cfg, tileSize, { hoverCursor: { floorRing: false } })
body.hover.updateCursor({ floorRing: { color: 0xffffff } }) // ← no-op
```

```ts
// ✅ Bonne approche : construis ce que tu veux pouvoir toggler
useBody(cfg, tileSize, {
  hoverCursor: { floorRing: { color: 0xffffff } },
})
body.hover.updateCursor({ floorRing: false })               // hide
body.hover.updateCursor({ floorRing: { color: 0xff0000 } }) // re-show in red
```

Pareil pour les presets : si tu veux qu'un preset puisse activer une primitive, il faut qu'au moins un autre preset (ou ce preset lui-même) la déclare.

## Performance

- Ring + floorRing : meshes pre-alloués, mise à jour `Float32BufferAttribute` en place — pas de réallocation par hover.
- Emissive : `THREE.PointLight` unique repositionné — pas de shadow casting (irrelevant ici).

Aucune des primitives n'impacte le rendu shader ou le pipeline post-process — elles vivent dans `body.group` et suivent la rotation / l'axial tilt naturellement.

## HoverChannel

`useBody` alloue un [`HoverChannel`](/api/core/interfaces/HoverChannel) par corps — exposé sur `body.hoverChannel`. Le channel publie deux refs (`hoverLocalPos`, `hoverParentGroup`) lues chaque frame par les projecteurs scène (`<TileCenterProjector>`) pour transformer la position locale de la tuile survolée en pixels écran.

### Channel par-corps (défaut)

```ts
const mars  = useBody(marsConfig,  DEFAULT_TILE_SIZE)
const venus = useBody(venusConfig, DEFAULT_TILE_SIZE)

// Chaque body a son propre channel — deux tooltips peuvent s'afficher en parallèle.
<TileCenterProjector :channel="mars.hoverChannel"  @update-position="..." />
<TileCenterProjector :channel="venus.hoverChannel" @update-position="..." />
```

### Channel global partagé (un seul tooltip à la fois)

Quand l'UX impose **un seul slot de hover** sur l'écran (popover unique dans un HUD, par exemple), construisez un channel et passez-le à tous les `useBody` :

```ts
import {
  useBody,
  createHoverChannel,
  DEFAULT_TILE_SIZE,
} from '@cedric-pouilleux/stellexjs/core'

const channel = createHoverChannel()

const mars  = useBody(marsConfig,  DEFAULT_TILE_SIZE, { hoverChannel: channel })
const venus = useBody(venusConfig, DEFAULT_TILE_SIZE, { hoverChannel: channel })

// Un seul TileCenterProjector écoute le channel partagé — chaque hover sur Mars
// OU Venus écrase le précédent. Un seul tooltip à l'écran.
<TileCenterProjector :channel="channel" @update-position="..." />
```

::: tip Bonne séparation
Le channel ne porte **que** la position — il n'arbitre rien. C'est au caller de décider si plusieurs slots concurrents s'affichent (channels indépendants) ou s'il y en a un seul (channel partagé). La lib n'impose pas de politique.
:::

## Tile overlay highlight

Indépendamment du curseur de hover, la lib expose une primitive plus bas niveau : [`createTileOverlayMesh`](/api/core/functions/createTileOverlayMesh). Elle construit un **mesh ré-utilisable** dont la géométrie est reconstruite à la volée pour couvrir un set arbitraire de tuiles avec un seul draw call mergé. Idéal pour : zones de capture, surbrillance d'influence, sélections multiples, propagation de feu — tout ce qui n'est pas un curseur 1-tuile.

```ts
import {
  createTileOverlayMesh,
  DEFAULT_HOVER,
} from '@cedric-pouilleux/stellexjs/core'

const overlay = createTileOverlayMesh(
  // Resolver tile id → géométrie (centre + niveau de bande)
  (tileId) => body.tiles.sol.tileGeometry(tileId),
  {
    color:         DEFAULT_HOVER.fillColor,    // ou n'importe quelle couleur THREE
    opacity:       DEFAULT_HOVER.fillOpacity,
    blending:      THREE.AdditiveBlending,
    kind:          'fill',                     // 'fill' | 'border' | 'fill-sides' | 'border-sides'
    surfaceOffset: DEFAULT_HOVER.surfaceOffset,
    borderWidth:   DEFAULT_HOVER.borderWidth,
    ringExpand:    DEFAULT_HOVER.ringExpand,
    renderOrder:   2,
  },
)
body.group.add(overlay.mesh)

// Puis à n'importe quel moment :
overlay.setTiles([12, 47, 89, 102])   // recalcule la géométrie pour ces 4 tuiles
overlay.setTiles(null)                 // cache l'overlay
overlay.dispose()                      // libère GPU
```

[`TileOverlayKind`](/api/core/type-aliases/TileOverlayKind) :

| `kind` | Effet |
| ------ | ----- |
| `'fill'`         | Triangle fan sur la face supérieure |
| `'border'`       | Anneau fin inset sur la face supérieure |
| `'fill-sides'`   | Fill du dessus + bandes des murs latéraux |
| `'border-sides'` | Border du dessus + bandes des murs latéraux |

[`DEFAULT_HOVER`](/api/core/variables/DEFAULT_HOVER) (typé [`HoverConfig`](/api/core/type-aliases/HoverConfig)) fournit un préset additif blanc équilibré — pratique pour binder un panneau de réglages sur les bornes existantes.

## Body hover (anneau silhouette)

[`DEFAULT_BODY_HOVER`](/api/core/variables/DEFAULT_BODY_HOVER) typé [`BodyHoverConfig`](/api/core/type-aliases/BodyHoverConfig) configure l'**anneau de hover au niveau du corps** (cercle screen-space autour de la silhouette de la planète, dimensions en pixels stables au zoom). Activé via `body.hover.setBodyHover(true)` ; couleur, opacité, marge et épaisseur sont les seuls leviers — un anneau, point.

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
// L'anneau utilise DEFAULT_BODY_HOVER en interne ; pour overrider, passez
// par votre propre wrapper Vue qui dessine un cercle SVG/canvas par-dessus.
body.hover.setBodyHover(true)
```

## Voir aussi

- [Mode jouable](/examples/hex-tiles/playable-mode) — exemple complet avec interactions
- [Visualiseur interactif](/examples/hex-tiles/interactive-viewer) — pattern raycast minimal
- [Composants de scène — `<TileCenterProjector>`](/guides/scene-components#tilecenterprojector)
- [API : `BodyHover`](/api/core/interfaces/BodyHover)
- [API : `HoverCursorConfig`](/api/core/interfaces/HoverCursorConfig)
- [API : `HoverChannel`](/api/core/interfaces/HoverChannel)
- [API : `TileOverlayMesh`](/api/core/interfaces/TileOverlayMesh)
