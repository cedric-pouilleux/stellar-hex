<script setup>
import { gasGiantThreeCode } from '../../.vitepress/theme/code/gas-giant-three'
import GasGiantVue from '../../.vitepress/theme/demos/GasGiantVue.vue'
import GasGiantVueRaw from '../../.vitepress/theme/demos/GasGiantVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: gasGiantThreeCode, lang: 'ts'  },
  { label: 'Vue',      code: GasGiantVueRaw,    lang: 'vue' },
]
</script>

# Anneaux simples

Les anneaux sont **opt-in** : la lib n'en génère que si `config.hasRings === true`. Une fois le flag posé, `body.variation.rings` est calculé déterministement depuis le seed (archétype, profil, couleurs, opacité). `<Body>` mount automatiquement `<BodyRings>` ; en vanille Three.js, vous appelez `buildBodyRings`.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <GasGiantVue />
  </DemoBlock>
</ClientOnly>

## Activer un anneau

```ts
const body = useBody({
  type:           'gaseous',
  name:           'Jovian',
  radius:          1.4,
  rotationSpeed:   0.003,
  axialTilt:       0.18,
  hasRings:        true, // requis — sans ce flag, `body.variation.rings` est null
}, DEFAULT_TILE_SIZE)
```

## En vanille Three.js

```ts
import * as THREE from 'three'
import { buildBodyRings } from '@cedric-pouilleux/stellar-hex/core'

if (body.variation.rings) {
  // Le builder lit ce vecteur PAR RÉFÉRENCE chaque frame pour projeter
  // l'ombre — refresh-le dans la boucle, ne le recrée pas.
  const planetWorldPos = new THREE.Vector3()

  const rings = buildBodyRings({
    radius:         body.config.radius,
    rotationSpeed:  body.config.rotationSpeed,
    variation:      body.variation.rings,
    planetWorldPos,
  })

  // Attacher le `carrier` (groupe parent) — PAS `rings.mesh` directement.
  // Le carrier hérite du tilt, spin et drag du planet group.
  body.group.add(rings.carrier)

  // dans la boucle :
  body.group.getWorldPosition(planetWorldPos)
  rings.tick(dt)
}
```

::: warning Deux pièges classiques
- **Attachez `rings.carrier`**, pas `rings.mesh` — le carrier porte la base orientation (axe Y → plan équatorial) et la rotation propre de l'anneau.
- **`planetWorldPos` est obligatoire** et doit être *mutable* (pas un nouvel objet à chaque frame) — le shader le lit par référence.
:::

## Que contient `body.variation.rings` ?

Une [`RingVariation`](/api/core/interfaces/RingVariation) — résolution complète de l'anneau, déterministe :

| Champ | Rôle |
| ----- | ---- |
| `archetype`       | Forme générale (`broad`, `dusty`, `narrow`, `shepherd`…) |
| `innerRatio` / `outerRatio` | Bord intérieur / extérieur en multiples du rayon |
| `colorInner` / `colorOuter` | Gradient radial |
| `profile`         | 8 samples d'opacité radiale |
| `bandFreq` / `bandContrast` | Micro-bandes |
| `dustiness`       | Mélange vers un halo diffus |
| `keplerShear`     | Rotation différentielle (anneaux qui « tournent à leur propre vitesse ») |
| `noiseSeed`       | Seed du shader de bruit |

Vous pouvez **muter** ces champs avant de passer la variation à `buildBodyRings` pour customiser sans toucher à la palette.
