import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { useBody } from './useBody'
import { DEFAULT_CORE_RADIUS_RATIO } from '../../physics/body'
import type { BodyConfig } from '../../types/body.types'

// ── Helpers ───────────────────────────────────────────────────────

/** Mirrors the StatsOverlay polygon counting logic (position.count / 3). */
function countGroupPolygons(group: THREE.Group): number {
  let n = 0
  group.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      const pos = (obj as THREE.Mesh).geometry?.getAttribute('position')
      if (pos) n += (pos.count / 3) | 0
    }
  })
  return n
}

/** Returns true when every mesh geometry in the group is non-indexed (merged prisms). */
function hasNonIndexedMesh(group: THREE.Group): boolean {
  let found = false
  group.traverse(obj => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry && !mesh.geometry.index) found = true
  })
  return found
}

/** Returns true when every non-trivial mesh geometry in the group is indexed (sphere). */
function hasIndexedMesh(group: THREE.Group): boolean {
  let found = false
  group.traverse(obj => {
    const mesh = obj as THREE.Mesh
    // Ignore the PlaneGeometry used by bodyHoverOverlay (4 vertices)
    if (mesh.isMesh && mesh.geometry && mesh.geometry.index
      && mesh.geometry.getAttribute('position').count > 10) found = true
  })
  return found
}

function makeStarConfig(radius = 1): BodyConfig {
  return {
    name: 'TestStar', type: 'star', spectralType: 'G',
    radius, rotationSpeed: 0.01, axialTilt: 0,
  }
}

function makeRockyConfig(radius = 1): BodyConfig {
  return {
    name: 'TestRocky', type: 'rocky',
    atmosphereThickness: 0.5,
    liquidType: 'water', liquidState: 'liquid',
    radius, rotationSpeed: 0.05, axialTilt: 0,
  }
}

// Large tile size → subdivision 2 → 42 tiles (fast test builds).
const TILE_SIZE = 0.5

// ── Star display mesh is smooth sphere (indexed) in overview ──────

describe('useBody — star', () => {
  it('places an indexed smooth sphere in the group without hex mode', () => {
    // Stars now use buildStarSmoothMesh (same pattern as rocky):
    // indexed SphereGeometry + animated BodyMaterial('star').
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect(hasIndexedMesh(star.group)).toBe(true)
    expect(hasNonIndexedMesh(star.group)).toBe(false)
    star.dispose()
  })

  it('polygon count stays low without hex mode (smooth sphere vertex count / 3)', () => {
    // SphereGeometry with segs ≈ 64 → far fewer than the old hex mesh.
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect(countGroupPolygons(star.group)).toBeLessThan(5_000)
    star.dispose()
  })

  it('exposes planetMaterial so ShaderPane can live-update star uniforms', () => {
    // The playground's shader slider pipeline calls `body.planetMaterial.setParams`
    // on every input event. Omitting this field here (previous regression) broke
    // every star shader control — temperature, pulsation, corona, granulation…
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect((star as any).planetMaterial?.setParams).toBeTypeOf('function')
    star.dispose()
  })

  it('switches to non-indexed hex mesh in interactive mode and back on deactivate', () => {
    // Same smooth ↔ hex swap lifecycle as rocky planets.
    const star = useBody(makeStarConfig(), TILE_SIZE)

    expect(hasNonIndexedMesh(star.group)).toBe(false)
    expect(hasIndexedMesh(star.group)).toBe(true)

    star.interactive.activate()
    expect(hasNonIndexedMesh(star.group)).toBe(true)
    expect(hasIndexedMesh(star.group)).toBe(false)

    star.interactive.deactivate()
    expect(hasNonIndexedMesh(star.group)).toBe(false)
    expect(hasIndexedMesh(star.group)).toBe(true)

    star.dispose()
  })
})

// ── Rocky display mesh is smooth sphere (indexed) ─────────────────

describe('useBody — rocky (non-interactive)', () => {
  it('places an indexed smooth sphere in the group (not a hex mesh)', () => {
    // Rocky planets use buildSmoothSphereMesh → THREE.SphereGeometry (indexed).
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    expect(hasIndexedMesh(rocky.group)).toBe(true)
    rocky.dispose()
  })

  it('polygon count stays low without hex mode (smooth sphere vertex count / 3)', () => {
    // SphereGeometry with segs ≈ 72 → position.count ≈ 74×37 = 2738 → polys ≈ 912.
    // The hex mesh (buildPlanetMesh + buildInteractiveMesh) is built but NOT in the group.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    const polys = countGroupPolygons(rocky.group)
    // Smooth sphere is indexed: position.count = (segs+1)*(segs/2+1) ≪ tile prism count.
    // 5000 is a generous ceiling that no smooth sphere (segs ≤ ~120) would exceed.
    expect(polys).toBeLessThan(5_000)
    rocky.dispose()
  })

  it('hex mesh is absent from group before activateInteractive, present after', () => {
    // buildPlanetMesh (raycaster proxy) and buildInteractiveMesh are constructed
    // eagerly for all rocky planets, consuming CPU memory even in smooth mode.
    // They must NOT appear in body.group until activateInteractive() is called.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)

    // Before: only smooth sphere (indexed) — no non-indexed hex prism mesh.
    expect(hasNonIndexedMesh(rocky.group)).toBe(false)

    rocky.interactive.activate()

    // After activation: hex prism mesh (non-indexed) replaces the smooth sphere.
    // Note: when the surface is liquid, an ocean sphere (indexed) is added
    // alongside the hex mesh, so `hasIndexedMesh` may still be true here.
    expect(hasNonIndexedMesh(rocky.group)).toBe(true)

    rocky.interactive.deactivate()

    // After deactivation: back to smooth sphere — hex mesh removed from group.
    expect(hasNonIndexedMesh(rocky.group)).toBe(false)
    expect(hasIndexedMesh(rocky.group)).toBe(true)

    rocky.dispose()
  })

  it('mounts a smooth ocean sphere in hex mode when the surface is liquid', () => {
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    rocky.interactive.activate()

    // Count indexed meshes with non-trivial geometry — the ocean layer uses
    // a SphereGeometry which is indexed and contributes many vertices.
    let indexedMeshes = 0
    rocky.group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.geometry?.index
        && mesh.geometry.getAttribute('position').count > 10) indexedMeshes++
    })
    expect(indexedMeshes).toBeGreaterThanOrEqual(1)

    rocky.dispose()
  })

  it('repaintSmoothSphere re-reads tileStates so dig mutations surface on the display mesh', () => {
    // Regression: the shader pane used to stay pristine after a dig because
    // the smooth-sphere paint path cached noise bands at build time. The
    // tile-state delta branch + `repaint` must let the same mutation
    // propagate into the vertex colour buffer.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    let displayMesh: THREE.Mesh | undefined
    rocky.group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.geometry?.index
        && mesh.geometry.getAttribute('color')) displayMesh = mesh
    })
    expect(displayMesh).toBeDefined()

    const colorAttr = displayMesh!.geometry.getAttribute('color') as THREE.BufferAttribute
    const initialColours = Float32Array.from(colorAttr.array as Float32Array)

    // Drop every tile to elevation 0. The noise bands still rule vertex
    // placement, but the per-tile delta must pull the associated vertices
    // down to the lowest palette band.
    const states = rocky.sim.tileStates as Map<number, { tileId: number; elevation: number }>
    for (const [id] of states) states.set(id, { tileId: id, elevation: 0 })
    rocky.tiles.repaintSmoothSphere()

    const movedColours = colorAttr.array as Float32Array
    let anyChanged = false
    for (let i = 0; i < movedColours.length; i++) {
      if (Math.abs(movedColours[i] - initialColours[i]) > 1e-4) { anyChanged = true; break }
    }
    expect(anyChanged).toBe(true)

    rocky.dispose()
  })

  it('setSeaLevel drives the smooth sphere shader + vertex colours in addition to the hex mesh', () => {
    // Regression: the sea-level slider used to move only the hex view's
    // liquid sphere. The smooth display sphere stayed painted with its
    // initial band assignment, so the left pane looked "dry" while the
    // right pane updated. Both the ocean-mask uniform and the vertex
    // colour buffer must now react to every `setSeaLevel` call.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)

    // Grab the smooth display sphere (indexed SphereGeometry — the only
    // indexed mesh with vertex colours in non-interactive mode).
    let displayMesh: THREE.Mesh | undefined
    rocky.group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.geometry?.index
        && mesh.geometry.getAttribute('color')) displayMesh = mesh
    })
    expect(displayMesh).toBeDefined()

    const colorAttr = displayMesh!.geometry.getAttribute('color') as THREE.BufferAttribute
    const initialColours = Float32Array.from(colorAttr.array as Float32Array)
    const initialVersion = colorAttr.version
    const shader = rocky.planetMaterial.material as THREE.ShaderMaterial
    const initialSeaUniform = shader.uniforms.uSeaLevel?.value as number

    // Push sea level well above its initial world radius → more submerged
    // vertices → the smooth-sphere colour buffer flips them to the sea
    // anchor (the smooth sphere has no liquid mesh sitting on top in
    // shader view, so the underwater tint must come from vertex colour),
    // AND the shader uniform slides to track the new waterline.
    rocky.liquid.setSeaLevel(rocky.getSurfaceRadius() * 0.99)

    const movedColours = colorAttr.array as Float32Array
    let anyChanged = false
    for (let i = 0; i < movedColours.length; i++) {
      if (Math.abs(movedColours[i] - initialColours[i]) > 1e-4) { anyChanged = true; break }
    }
    expect(anyChanged).toBe(true)
    // `needsUpdate = true` bumps the internal `version` counter — the
    // observable side-effect renderers pick up to re-upload the buffer.
    expect(colorAttr.version).toBeGreaterThan(initialVersion)
    expect(shader.uniforms.uSeaLevel.value).not.toBe(initialSeaUniform)

    rocky.dispose()
  })
})

// ── Core mesh transverse (step 1) ─────────────────────────────────

describe('useBody — core mesh (non-stellar bodies)', () => {
  it('rocky exposes getCoreRadius = radius * DEFAULT_CORE_RADIUS_RATIO when ratio is omitted', () => {
    // Drop the atmo so the clamp `coreRatio + atmoThick ≤ 0.95` is inert
    // and the default ratio survives end-to-end.
    const cfg = { ...makeRockyConfig(4), atmosphereThickness: 0 }
    const rocky = useBody(cfg, TILE_SIZE)
    expect(rocky.getCoreRadius?.()).toBeCloseTo(4 * DEFAULT_CORE_RADIUS_RATIO, 5)
    expect(rocky.getSurfaceRadius?.()).toBeCloseTo(4, 5)
    rocky.dispose()
  })

  it('rocky honours an explicit coreRadiusRatio override', () => {
    const cfg = { ...makeRockyConfig(4), coreRadiusRatio: 0.3 }
    const rocky = useBody(cfg, TILE_SIZE)
    expect(rocky.getCoreRadius?.()).toBeCloseTo(4 * 0.3, 5)
    rocky.dispose()
  })

  it('rocky group contains an additional opaque sphere mesh at the core radius', () => {
    const rocky  = useBody(makeRockyConfig(4), TILE_SIZE)
    const target = rocky.getCoreRadius!()
    let found    = false
    rocky.group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      mesh.geometry.computeBoundingSphere()
      const r = mesh.geometry.boundingSphere?.radius ?? 0
      if (Math.abs(r - target) < 1e-3) found = true
    })
    expect(found).toBe(true)
    rocky.dispose()
  })

  it('star carries the StarBody discriminant and exposes coherent radii', () => {
    const config = makeStarConfig()
    const star   = useBody(config, TILE_SIZE)
    // Discriminant — callers narrow the Body union via `kind === 'star'`
    // before reaching for planet-only namespaces (liquid, view, atmoShell).
    expect(star.kind).toBe('star')
    // Radii are real — stars do carry a core + surface even though they
    // skip the 3-layer liquid plumbing.
    expect(star.getSurfaceRadius()).toBeCloseTo(config.radius, 5)
    expect(star.getCoreRadius()).toBeLessThanOrEqual(config.radius)
    star.dispose()
  })
})

// ── Surface-liquid invariant (gaseous / metallic stay dry) ─────────

describe('useBody — surface liquid invariant', () => {
  it('gaseous body with stale liquidType still renders dry (no liquid sphere, no wet sea anchor)', () => {
    // Regression: a gaseous config accidentally carrying `liquidType` used
    // to smuggle in a liquid sphere + sea anchor through the render layer.
    // `hasSurfaceLiquid(config)` is the single gate — gas giants must
    // ignore the field entirely.
    const gaseous = useBody({
      name:           'GasGiant',
      type:           'gaseous',
      atmosphereThickness: 0.9,
      // These should be ignored — the body is gaseous.
      liquidType:     'water',
      liquidState:    'liquid',
      radius:         3,
      rotationSpeed:  0.4,
      axialTilt:      0,
    }, TILE_SIZE)

    // Simulation side: the sim must not compute a waterline.
    expect(gaseous.sim.seaLevelElevation).toBe(-1)
    expect(gaseous.sim.surfaceLiquid).toBeUndefined()
    expect(gaseous.sim.liquidCoverage).toBe(0)

    gaseous.dispose()
  })
})
