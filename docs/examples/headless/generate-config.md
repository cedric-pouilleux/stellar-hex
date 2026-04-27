<script setup>
import { headlessGenerateCode } from '../../.vitepress/theme/code/headless-generate'

const tabs = [
  { label: 'Three.js', code: headlessGenerateCode, lang: 'ts' },
  { label: 'Vue',      code: headlessGenerateCode, lang: 'ts' },
]
</script>

# Génération depuis un seed

Côté serveur ou worker, la couche `/sim` ne dépend ni de Three.js ni du DOM. Vous pouvez calculer une planète complète et expédier l'état au client.

<DemoBlock :tabs="tabs">
  <div class="no-demo">
    Snippet headless — exécutez-le dans Node.js ou un Web Worker.
  </div>
</DemoBlock>

## Anatomie du résultat

`initBodySimulation(tiles, config)` retourne :

| Champ                | Type                 | Description |
| -------------------- | -------------------- | ----------- |
| `tileStates`         | `Map<id, TileState>` | `{ tileId, elevation }` — bande entière `[0, N-1]`, rien d'autre |
| `seaLevelElevation`  | `number`             | bande (fractionnaire) du niveau de la mer (`-1` si pas de liquide) |
| `seaLevelNoise`      | `number`             | seuil simplex équivalent — utile pour shaders qui resamplent le bruit |
| `liquidCoverage`     | `number`             | fraction effective de tuiles sous l'eau |
| `hasLiquidSurface`   | `boolean`            | `true` si `liquidState !== 'none'` (substance caller-owned) |
| `elevationAt(x,y,z)` | `function`           | bande entière en n'importe quel point monde |
| `bandToNoiseThreshold` | `function`         | inverse de la quantification, pour pousser un sea level dans un shader |
| `tiles`              | `Tile[]`             | rappel des tuiles 3D |
| `config`             | `BodyConfig`         | rappel du config initial |

Tout est sérialisable en JSON sans nettoyage spécial.

## Pipeline serveur → client

```
[ Node.js ]
  initBodySimulation(tiles, config)
       ↓
  JSON.stringify({ config })
       ↓ HTTP / WS
[ Browser ]
  useBody(config, DEFAULT_TILE_SIZE)  // re-derive locally — same seed
```

La sortie de `useBody` côté client **est identique** à la `sim` du serveur : `body.sim.tileStates` ≡ `serverSim.tileStates`. Le seed est suffisant.

## Pourquoi ne pas envoyer `tileStates` direct ?

Vous pouvez. Cas où c'est gagnant :

- la sim côté client est budgétairement bloquée (mobile bas-de-gamme, fenêtre de onboarding lourde),
- vous avez d'autres sources qui mutent `tileStates` côté serveur (excavation, ressources) — il faut alors expédier ces deltas.

Cas où c'est perdant :

- `tileStates` est volumineux (~5 000 entrées sur un corps standard),
- la latence réseau dépasse le coût `initBodySimulation` (~quelques ms).

Pour la majorité des projets, **expédier le `BodyConfig` suffit**.
