export const gasGiantThreeCode = `\
import * as THREE from 'three'
import {
  useBody,
  DEFAULT_TILE_SIZE,
  buildBodyRings,
} from '@cedric-pouilleux/stellar-hex/core'

const scene = new THREE.Scene()
scene.add(new THREE.AmbientLight(0xffffff, 0.3))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(5, 3, 3)
scene.add(sun)

const body = useBody(
  {
    type:           'gaseous',
    name:           'Jovian',
    radius:         2,
    temperatureMin: 90,
    temperatureMax: 130,
    rotationSpeed:  0.003,
    axialTilt:      0.05,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)

// body.variation.rings is auto-generated from the seed
if (body.variation.rings) {
  buildBodyRings({
    group:         body.group,
    radius:        body.config.radius,
    rotationSpeed: body.config.rotationSpeed,
    variation:     body.variation.rings,
  })
}
`
