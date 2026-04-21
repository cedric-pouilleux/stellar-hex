export const starThreeCode = `\
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js'
import {
  useBody,
  DEFAULT_TILE_SIZE,
  godRaysFromStar,
} from '@cedric-pouilleux/stellar-hex/core'

const scene    = new THREE.Scene()
const camera   = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true })
camera.position.set(0, 0, 4)

const body = useBody(
  {
    type:           'star',
    name:           'Sol',
    radius:         1,
    temperatureMin: 5000,
    temperatureMax: 5778,
    spectralType:   'G',
    rotationSpeed:  0.002,
    axialTilt:      0,
  },
  DEFAULT_TILE_SIZE,
)
scene.add(body.group)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const godRays = godRaysFromStar(body.group, camera, renderer)
composer.addPass(godRays.pass)

// in animation loop:
body.tick(dt)
godRays.update()
composer.render()
`
