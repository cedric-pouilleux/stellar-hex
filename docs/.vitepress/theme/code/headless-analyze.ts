/**
 * Snippet â€” analyse per-tile state offline (CSV export, biome statsâ€¦).
 */
export const headlessAnalyzeCode = `import {
  generateHexasphere,
  initBodySimulation,
  buildNeighborMap,
  getNeighbors,
} from '@cedric-pouilleux/stellar-hex/sim'

const { tiles } = generateHexasphere(1, 5)
const sim       = initBodySimulation(tiles, {
  name:           'Analyzer',
  type:           'rocky',
  radius:          1,
  rotationSpeed:   0,
  axialTilt:       0,
})

// 1. Distribution per elevation band
const histogram = new Map<number, number>()
for (const [, state] of sim.tileStates) {
  histogram.set(state.elevation, (histogram.get(state.elevation) ?? 0) + 1)
}
console.log('Tiles per band:', [...histogram.entries()].sort((a, b) => a[0] - b[0]))

// 2. Coastline tiles â€” those neighbouring at least one liquid tile
const nMap     = buildNeighborMap(tiles)
const sea      = sim.seaLevelElevation
const coastline = [...sim.tileStates].filter(([id, state]) => {
  if (state.elevation <= sea) return false
  return getNeighbors(id, nMap).some(nid => {
    const n = sim.tileStates.get(nid)
    return n && n.elevation <= sea
  })
})
console.log('Coastline tile count:', coastline.length)

// 3. Largest connected continent (BFS)
const visited = new Set<number>()
let biggest   = 0
for (const [id, state] of sim.tileStates) {
  if (visited.has(id) || state.elevation <= sea) continue
  let size = 0
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    if (visited.has(cur)) continue
    const s = sim.tileStates.get(cur)
    if (!s || s.elevation <= sea) continue
    visited.add(cur)
    size++
    for (const nid of getNeighbors(cur, nMap)) queue.push(nid)
  }
  if (size > biggest) biggest = size
}
console.log('Largest continent (tiles):', biggest)
`
