<script setup>
import FrozenWorldDemo    from '../../.vitepress/theme/demos/FrozenWorldDemo.vue'
import FrozenWorldDemoRaw from '../../.vitepress/theme/demos/FrozenWorldDemo.vue?raw'
import FrozenWorldVueRaw  from '../../.vitepress/theme/demos/FrozenWorldVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: FrozenWorldDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: FrozenWorldVueRaw,  lang: 'vue' },
]
</script>

# Surface gelée (cap glace)

Quand `liquidState: 'frozen'` est posé sur un `PlanetConfig`, la lib **ne rend pas de shell liquide animé**. C'est volontaire : un océan gelé n'est plus une surface fluide, c'est une nouvelle couche solide minable. Le pattern recommandé est de **stacker un cap hex via `buildSolidShell`** sur les tuiles submergées.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <FrozenWorldDemo />
  </DemoBlock>
</ClientOnly>

## Pourquoi pas un shell liquide congelé ?

Un océan congelé partage très peu de pipeline avec un océan liquide :

| Trait | Liquide | Glace |
| ----- | ------- | ----- |
| Surface | Lisse, vagues animées | Discrète, suit les tuiles hex |
| Mining | N'a pas de sens | C'est l'usage principal |
| Murs | Aucun (sphère continue) | Prismes hex stackés |
| Translucence | Fresnel / caustics | Solide — peut être translucide ou opaque |
| Pipeline | Sphère + shader vagues | Mesh hex merged + matériau standard |

Forcer une transition « liquide → glace » dans le même shell mélangerait deux préoccupations sans rien gagner. La doctrine push-only règle ça simplement : votre modèle de chimie passe `liquidState: 'frozen'`, et vous montez un `buildSolidShell` au-dessus.

## Pattern recommandé

```ts
import * as THREE from 'three'
import {
  useBody,
  buildSolidShell,
  resolveCoreRadiusRatio,
  DEFAULT_TILE_SIZE,
} from '@cedric-pouilleux/stellar-hex/core'

const config: PlanetConfig = {
  type:           'planetary',
  surfaceLook:    'terrain',
  name:           'Europa',
  radius:          1,
  rotationSpeed:   0.005,
  axialTilt:       0.05,
  liquidState:    'frozen',          // ← caller décide depuis son modèle thermique
  liquidCoverage:  0.85,             // 85 % de la surface est sous l'ancien niveau de la mer
  liquidColor:    '#9ad9ff',         // teinte bleue/cyan — h2o solide
}

const body = useBody(config, DEFAULT_TILE_SIZE)

// Récupérer les tuiles submergées et leurs élévations
const sea = body.sim.seaLevelElevation
const baseElevation = new Map<number, number>()
for (const [id, state] of body.sim.tileStates) {
  if (state.elevation < sea) {
    baseElevation.set(id, state.elevation)
  }
}

// Le cap glace recouvre toutes les tuiles immergées, top à la waterline
const coreRatio = resolveCoreRadiusRatio(config)
const ice = buildSolidShell({
  tiles:           body.sim.tiles,
  baseElevation,                            // hauteur du fond marin
  topElevation:    sea,                     // top à la waterline
  palette:         body.palette,            // pour la conversion bande → monde
  bodyRadius:      config.radius,
  coreRadius:      config.radius * coreRatio,
  color:          '#dceeff',                // teinte glace (caller-resolved)
  roughness:       0.85,                    // matte, neigeux
})

body.group.add(ice.group)
```

## API du handle ice cap

`buildSolidShell` retourne un handle [`SolidShellHandle`](/api/core/interfaces/SolidShellHandle) avec une API focalisée sur le **mining** — c'est le seul cas d'usage où une glace de surface mute :

| Méthode | Effet |
| ------- | ----- |
| `lowerTile(id, delta)` | Descend le top de `delta` bandes — quand le top atteint la base, le prisme se collapse |
| `removeTile(id)` | Mine la colonne complète d'une seule tuile |
| `setTopElevation(band)` | Re-pose le top global (slider sea level qui suit) |
| `setOpacity(alpha)` | Translucence — bascule en `transparent` quand `< 1` |
| `setVisible(on)` | Toggle visibility |
| `dispose()` | Libère le GPU — appelez avec `body.dispose()` |

`faceToTileId[i]` permet de raycaster directement contre le cap pour identifier la tuile sous le pointeur — utile si vous voulez un click-handler indépendant du raycast sol de la lib.

## Mining flow

```ts
function mineIce(tileId: number) {
  // Descendre d'un palier
  const newTop = ice.lowerTile(tileId, 1)
  if (newTop === undefined) return // tile inconnue ou déjà collapsée

  // Quand le cap est consommé, exposer la tuile sol underneath
  if (newTop <= baseElevation.get(tileId)!) {
    // La tuile sol redevient visible — sa palette d'origine est restaurée par
    // tileBaseVisual si vous aviez peint une overlay « immergé »
    const base = body.tiles.sol.tileBaseVisual(tileId)
    if (base) body.tiles.sol.writeTileColor(tileId, { r: base.r, g: base.g, b: base.b })
  }
}
```

## Sea-level move

Si votre modèle simule une fonte progressive (= passage `frozen` → `liquid`), trois étapes :

1. `body.dispose()` puis re-mount avec `liquidState: 'liquid'` (la sim re-classifiera les tuiles avec un océan animé), **ou**
2. garder le cap glace, descendre `setTopElevation` pour simuler une banquise qui régresse, **ou**
3. en parallèle, monter un `buildLiquidShell` sur les tuiles que la fonte expose.

Les trois sont des stratégies caller-side ; la lib ne décide rien.

## Multi-substance

Si vous gérez plusieurs substances solides (h2o + ch4 + n2 sur Triton, par exemple), **la doctrine est de blender caller-side** et de pousser une seule couleur dominante :

```ts
// Votre catalogue caller-side
const solidTints = {
  h2o: '#dceeff',
  ch4: '#fff5e0',
  n2:  '#e8e8f5',
}

// Si une tuile contient h2o + ch4 dans des proportions données, vous blendez
// vous-même et passez la couleur résolue
const dominantTint = blendCallerSide({ h2o: 0.7, ch4: 0.3 }, solidTints)
buildSolidShell({ ..., color: dominantTint })
```

Le shell n'a pas de notion de stratification — c'est un cap uniforme. Pour une stratification verticale visible (couches multiples), montez plusieurs `buildSolidShell` empilés (un par phase, avec `baseElevation` / `topElevation` distincts).

## Pourquoi `liquidColor` même en `frozen` ?

`PlanetVisualProfile.liquidColor` reste utile sur les corps gelés : il sert d'**ancre liquid-side** à partir de laquelle vous pouvez dériver la teinte solide (souvent une désaturation + éclaircissement) caller-side. La lib ne le fait pas pour vous, mais c'est le pattern habituel.

## Voir aussi

- [Océan](/examples/liquids/ocean) — pendant `liquidState: 'liquid'`
- [Noyau & coquilles](/examples/core/core-and-shells) — anatomie radial
- [Intégrer du gameplay](/guides/gameplay-integration) — patterns de paint
- [API : `buildSolidShell`](/api/core/functions/buildSolidShell)
- [API : `SolidShellHandle`](/api/core/interfaces/SolidShellHandle)
