# Three.js Basics

This guide wires a `BodySimulation` into a `THREE.Scene` without any Vue
dependency. Everything here imports from `/core`.

## Scaffold

```ts
import * as THREE from 'three'
import {
  generateHexasphere,
  initBodySimulation,
  buildPlanetMesh,      // from /core
  BodyMaterial,
} from '@cedric-pouilleux/stellar-hex/core'

const scene    = new THREE.Scene()
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
```

## Generate a planet

```ts
const tiles = generateHexasphere(6)
const sim   = initBodySimulation(tiles, {
  name:        'Demo',
  type:        'rocky',
  radius:      1,
  temperature: 275,
})

// buildPlanetMesh builds a textured THREE.Mesh from tiles + sim state
const { mesh } = buildPlanetMesh({ tiles, sim })
scene.add(mesh)
```

## Animation loop

```ts
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime()
  // If your mesh uses BodyMaterial, tick its time uniform:
  // material.tick(t)
  renderer.render(scene, camera)
})
```

> **Tip** — for a gas giant, swap `type: 'rocky'` for `type: 'gaseous'` and
> use `buildGaseousSystem()` instead of `buildPlanetMesh()`.
