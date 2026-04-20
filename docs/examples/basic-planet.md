# Basic Planet

Minimal Three.js scene rendering a rocky planet with ocean mask and
procedural biomes. Copy-paste ready.

```ts
import * as THREE from 'three'
import {
  generateHexasphere,
  initBodySimulation,
  buildPlanetMesh,
} from '@cedric-pouilleux/stellar-hex/core'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene  = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
)
camera.position.set(0, 0, 3)

scene.add(new THREE.AmbientLight(0xffffff, 0.25))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 2, 2)
scene.add(sun)

const tiles = generateHexasphere(6)
const sim   = initBodySimulation(tiles, {
  name:        'Aqua',
  type:        'rocky',
  radius:      1,
  temperature: 288,
})

const { mesh } = buildPlanetMesh({ tiles, sim })
scene.add(mesh)

renderer.setAnimationLoop(() => {
  mesh.rotation.y += 0.001
  renderer.render(scene, camera)
})
```
