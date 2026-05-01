export const gasGiantThreeCode = `\
import * as THREE from 'three'
import {
  useBody,
  DEFAULT_TILE_SIZE,
  buildBodyRings,
} from '@cedric-pouilleux/stellexjs/core'

const scene = new THREE.Scene()
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(5, 3, 3)
scene.add(sun)

const body = useBody(
  {
    type:           'planetary', surfaceLook: 'bands',
    name:           'Jovian',
    radius:         2,
    rotationSpeed:  0.003,
    axialTilt:      0.05,
    hasRings:       true,
  },
  DEFAULT_TILE_SIZE,
  // Pipes the same scene light into the body shader's planet→sun direction.
  { sunLight: sun },
)
scene.add(body.group)

// body.variation.rings is auto-generated from the seed when hasRings is true.
let rings: ReturnType<typeof buildBodyRings> | null = null
const planetWorldPos = new THREE.Vector3()

if (body.variation.rings) {
  rings = buildBodyRings({
    radius:         body.config.radius,
    rotationSpeed:  body.config.rotationSpeed,
    variation:      body.variation.rings,
    planetWorldPos,
    sunLight:       sun,
  })
  // Attach the carrier (not the mesh) so the rings inherit tilt + spin.
  body.group.add(rings.carrier)
}

// Animation loop:
function tick(dt: number) {
  body.tick(dt)
  body.group.getWorldPosition(planetWorldPos)
  rings?.tick(dt)
}
`
