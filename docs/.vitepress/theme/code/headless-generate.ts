/**
 * Snippet — generate a deterministic body simulation server-side.
 * No Three.js, no DOM. Run in Node, in a worker, or as a CLI step.
 */
export const headlessGenerateCode = `import {
  generateHexasphere,
  initBodySimulation,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 6)
const sim = initBodySimulation(tiles, {
  name:           'Worker-Body-42',
  type:           'rocky',
  radius:          1,
  rotationSpeed:   0.005,
  axialTilt:       0.41,
})

// Everything below is JSON-serialisable.
const snapshot = {
  config: sim.config,
  seaLevelElevation: sim.seaLevelElevation,
  liquidCoverage:    sim.liquidCoverage,
  hasLiquidSurface:  sim.hasLiquidSurface,
  tileCount:         sim.tileStates.size,
}

console.log(JSON.stringify(snapshot, null, 2))
`
