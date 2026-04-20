# Gas Giant with Rings

Builds a banded gas giant + a ring disc using a preset archetype.

```ts
import * as THREE from 'three'
import {
  buildGaseousSystem,
  buildBodyRings,
  RING_ARCHETYPES,
} from '@cedric-pouilleux/stellar-hex/core'

const scene = new THREE.Scene()

const { group: gasGroup } = buildGaseousSystem({
  config: {
    name:        'Jovian',
    type:        'gaseous',
    radius:      2,
    temperature: 110,
  },
})
scene.add(gasGroup)

const { mesh: rings } = buildBodyRings({
  innerRadius: 2.4,
  outerRadius: 4.2,
  archetype:   RING_ARCHETYPES[0], // saturn-like
})
rings.rotation.x = Math.PI / 2.6
scene.add(rings)
```

The full list of available ring archetypes is documented on
[`RING_ARCHETYPES`](/api/) in the API reference.
