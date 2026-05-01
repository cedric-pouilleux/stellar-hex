import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { warmupBody, type WarmupPhaseSpec } from './warmupBody'
import type { WarmupProgress } from '../types/bodyHandle.types'

/**
 * Mock renderer recording every `compileAsync` call. The real
 * `WebGLRenderer.compileAsync` is unavailable in the node test
 * environment (no WebGL context); the helper only depends on the
 * method's contract — return a promise, accept `(scene, camera)` —
 * so a structural mock is enough.
 */
interface CompileCall {
  sceneChildren: THREE.Object3D[]
  resolved:      boolean
}

function makeRenderer(opts: { delay?: number; reject?: boolean } = {}) {
  const calls: CompileCall[] = []
  const renderer = {
    compileAsync: async (scene: THREE.Object3D, _camera: THREE.Camera): Promise<unknown> => {
      const call: CompileCall = {
        sceneChildren: [...scene.children],
        resolved:      false,
      }
      calls.push(call)
      if (opts.delay) await new Promise(r => setTimeout(r, opts.delay))
      if (opts.reject) throw new Error('compile rejected')
      call.resolved = true
      return undefined
    },
  } as unknown as THREE.WebGLRenderer
  return { renderer, calls }
}

function makeMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
}

const camera = new THREE.PerspectiveCamera()

describe('warmupBody', () => {
  it('reports collecting → each phase → done with monotonic current/total', async () => {
    const { renderer } = makeRenderer()
    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface',    label: 'Surface',    targets: [makeMesh()] },
      { phase: 'atmosphere', label: 'Atmosphere', targets: [makeMesh()] },
      { phase: 'cursor',     label: 'Cursor',     targets: [makeMesh()] },
    ]
    const reports: WarmupProgress[] = []
    await warmupBody(renderer, camera, phases, { onProgress: p => reports.push({ ...p }) })

    expect(reports.map(r => r.phase)).toEqual([
      'collecting', 'surface', 'atmosphere', 'cursor', 'done',
    ])
    expect(reports[0].current).toBe(0)
    expect(reports.at(-1)!.current).toBe(4)
    expect(reports.at(-1)!.progress).toBe(1)
    // current is monotonic non-decreasing
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i].current).toBeGreaterThanOrEqual(reports[i - 1].current)
    }
    // total is consistent across reports
    const totals = new Set(reports.map(r => r.total))
    expect(totals.size).toBe(1)
    expect(totals.has(4)).toBe(true)
  })

  it('skips phases with empty targets — total reflects only meaningful steps', async () => {
    const { renderer, calls } = makeRenderer()
    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface',    label: 'Surface',    targets: [makeMesh()] },
      { phase: 'atmosphere', label: 'Atmosphere', targets: [] },             // skipped
      { phase: 'cursor',     label: 'Cursor',     targets: [] },             // skipped
    ]
    const reports: WarmupProgress[] = []
    await warmupBody(renderer, camera, phases, { onProgress: p => reports.push({ ...p }) })

    expect(reports.map(r => r.phase)).toEqual(['collecting', 'surface', 'done'])
    expect(reports.at(-1)!.total).toBe(2)
    expect(calls.length).toBe(1)
  })

  it('restores each target to its original parent after compilation', async () => {
    const { renderer } = makeRenderer()
    const originalParent = new THREE.Group()
    const reparented = makeMesh()
    originalParent.add(reparented)

    const detached = makeMesh() // parent === null

    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface', label: 'Surface', targets: [reparented, detached] },
    ]
    await warmupBody(renderer, camera, phases)

    expect(reparented.parent).toBe(originalParent)
    expect(detached.parent).toBeNull()
  })

  it('temporarily mounts targets in a transient scene during compilation', async () => {
    const { renderer, calls } = makeRenderer()
    const mesh = makeMesh()
    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface', label: 'Surface', targets: [mesh] },
    ]
    await warmupBody(renderer, camera, phases)

    expect(calls.length).toBe(1)
    expect(calls[0].sceneChildren).toContain(mesh)
    // After warmup, the mesh has no scene parent (was detached, restored to null).
    expect(mesh.parent).toBeNull()
  })

  it('restores targets when a phase rejects, and propagates the error', async () => {
    const { renderer } = makeRenderer({ reject: true })
    const parent = new THREE.Group()
    const mesh   = makeMesh()
    parent.add(mesh)

    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface', label: 'Surface', targets: [mesh] },
    ]

    await expect(warmupBody(renderer, camera, phases)).rejects.toThrow('compile rejected')
    expect(mesh.parent).toBe(parent)
  })

  it('stops emitting progress on rejection (no done event)', async () => {
    const { renderer } = makeRenderer({ reject: true })
    const reports: WarmupProgress[] = []
    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface', label: 'Surface', targets: [makeMesh()] },
    ]

    await expect(
      warmupBody(renderer, camera, phases, { onProgress: p => reports.push({ ...p }) }),
    ).rejects.toThrow()

    // collecting fires before the failed compile; done never fires.
    expect(reports.map(r => r.phase)).toEqual(['collecting'])
  })

  it('handles an empty phase list — collecting then done immediately', async () => {
    const { renderer, calls } = makeRenderer()
    const reports: WarmupProgress[] = []
    await warmupBody(renderer, camera, [], { onProgress: p => reports.push({ ...p }) })

    expect(reports.map(r => r.phase)).toEqual(['collecting', 'done'])
    expect(reports.at(-1)!.total).toBe(1)
    expect(reports.at(-1)!.current).toBe(1)
    expect(calls.length).toBe(0)
  })

  it('survives a missing onProgress option', async () => {
    const { renderer } = makeRenderer()
    const phases: WarmupPhaseSpec[] = [
      { phase: 'surface', label: 'Surface', targets: [makeMesh()] },
    ]
    await expect(warmupBody(renderer, camera, phases)).resolves.toBeUndefined()
  })
})
