/**
 * Generic warmup driver shared between the planet (`useBody`) and star
 * (`useStar`) factories. Runs a sequence of compile phases against a
 * supplied renderer / camera, exploiting `KHR_parallel_shader_compile`
 * via `WebGLRenderer.compileAsync` so the main thread stays responsive
 * while the GPU driver links programs in the background.
 *
 * Each phase carries a list of root `Object3D`s to compile. The targets
 * are temporarily re-parented under a transient `Scene` for the call to
 * `compileAsync` and then restored to their original parents — this
 * lets callers warm up meshes that are not yet attached to the body
 * group (e.g. the interactive sol mesh, swapped in only on
 * `interactive.activate()`, or the atmo shell, mounted only when the
 * view switcher selects `'surface'` / `'shader'`).
 *
 * Phases run sequentially so progress reports correspond to discrete
 * shader groups; `KHR_parallel_shader_compile` still parallelises the
 * compilation of multiple programs *within* a phase.
 */

import * as THREE from 'three'
import type {
  WarmupOptions,
  WarmupPhase,
  WarmupProgress,
} from '../types/bodyHandle.types'

/**
 * Single phase descriptor consumed by {@link warmupBody}. Built by
 * `useBody` / `useStar` from the body's actual handles — empty `targets`
 * lists are filtered out before reporting so the `total` reflects only
 * meaningful steps.
 */
export interface WarmupPhaseSpec {
  /** Stable phase code surfaced in {@link WarmupProgress.phase}. */
  phase:   WarmupPhase
  /** Default English label surfaced in {@link WarmupProgress.label}. */
  label:   string
  /** Roots whose materials must be compiled in this phase. */
  targets: readonly THREE.Object3D[]
}

/** Captured parent reference used to restore an object after warmup. */
interface SavedParent {
  object: THREE.Object3D
  parent: THREE.Object3D | null
}

/**
 * Pre-compiles the body's shader programs phase-by-phase. The renderer
 * and camera belong to the caller (the lib never owns either). Phases
 * with no targets are skipped — they would compile nothing and only
 * pollute the `total` denominator.
 *
 * @param renderer - Renderer hosting the WebGL context.
 * @param camera   - Any scene camera (matrices are not bound into the
 *                   compiled program — multi-camera scenes still only
 *                   need a single warmup pass).
 * @param phases   - Phase specs in execution order. The implementation
 *                   appends a synthetic `'done'` phase after the last
 *                   compile resolves.
 * @param options  - Optional progress hook.
 */
export async function warmupBody(
  renderer: THREE.WebGLRenderer,
  camera:   THREE.Camera,
  phases:   readonly WarmupPhaseSpec[],
  options?: WarmupOptions,
): Promise<void> {
  // Drop empty phases up front so `total` only counts compile steps the
  // caller will actually observe — surfacing a `'cursor'` phase with no
  // targets would be a lie to the loading bar.
  const compilePhases = phases.filter(p => p.targets.length > 0)
  // `total` includes the synthetic `'done'` boundary so `current === total`
  // when the loader hides.
  const total      = compilePhases.length + 1
  const onProgress = options?.onProgress
  let   current    = 0

  function report(phase: WarmupPhase, label: string): void {
    if (!onProgress) return
    onProgress({
      phase,
      current,
      total,
      progress: total === 0 ? 1 : current / total,
      label,
    })
  }

  // Initial signal — lets callers reveal a loader on the first tick
  // even when `compileAsync` resolves synchronously (no parallel-compile
  // extension on the host browser).
  report('collecting', 'Preparing shaders…')

  for (const spec of compilePhases) {
    const scratch: THREE.Scene  = new THREE.Scene()
    const saved:   SavedParent[] = []
    try {
      for (const obj of spec.targets) {
        saved.push({ object: obj, parent: obj.parent })
        scratch.add(obj)
      }
      await renderer.compileAsync(scratch, camera)
    } finally {
      // Always restore — even if `compileAsync` rejects — so a partial
      // failure does not strand meshes outside the body group.
      for (const { object, parent } of saved) {
        if (parent) parent.add(object)
        else        scratch.remove(object)
      }
    }
    current += 1
    report(spec.phase, spec.label)
  }

  current = total
  report('done', 'Ready')
}
