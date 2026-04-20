# Interactive Tiles

Hover / click individual hex tiles using `raycastBodies` and the overlay
mesh helper.

```ts
import * as THREE from 'three'
import {
  raycastBodies,
  createTileOverlayMesh,
} from '@cedric-pouilleux/stellar-hex/core'

const overlay = createTileOverlayMesh({
  tiles,                  // from generateHexasphere
  color: '#ffe066',
  opacity: 0.35,
})
scene.add(overlay.mesh)

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth)  * 2 - 1
  pointer.y = -(e.clientY / innerHeight) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const hit = raycastBodies(raycaster, [{ mesh, tiles }])
  if (hit) overlay.highlight([hit.tileId])
  else     overlay.highlight([])
})
```

See [`RaycastHit`](/api/) and [`TileOverlayMesh`](/api/) for the full
surface — including multi-tile highlighting and custom colours.
