<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { setBodyCoreVisible } from '../demos/bodyCoreVisibility'
import { paintAtmoSample }    from '../demos/paintAtmoSample'
import {
  viewModeForHold,
  type HeroViewMode,
} from '../composables/heroPlanetView'

/**
 * Earth-like planet showcased on the home hero, right of the title.
 *
 *   - transparent canvas (no backdrop, blends with the page background),
 *   - flat shell — `reliefFlatness` near 1 + a variation override that
 *     drops `roughnessMod` / `heightMod` to their floors so the rocky
 *     shader reads as a smooth sphere with no displacement noise,
 *   - thin live atmosphere (5 %) with animated clouds, visible from the
 *     very first frame (`view.set('shader')` at mount, otherwise
 *     `useBody` defaults to `'surface'` and the halo shell stays hidden),
 *   - 4× the default tile density via `tileSize = DEFAULT_TILE_SIZE / 2`,
 *   - drag/zoom via OrbitControls, slow auto-rotate when idle,
 *   - press-and-hold left-click → playable sol board (released = shader),
 *   - press-and-hold right-click → playable atmo board (released = shader).
 *
 * Click vs. drag is irrelevant here — pressing already swaps the view,
 * dragging on top of that just rotates the planet without leaving the
 * playable mode until the button is released.
 */

const container    = ref<HTMLDivElement>()
const mode         = ref<HeroViewMode>('shader')
const loading      = ref(true)
const loadingLabel = ref('Préparation de la planète…')
const loadingRatio = ref(0)

let applyMode: ((m: HeroViewMode) => void) | null = null
let cleanup:   (() => void) | null = null

watch(mode, m => applyMode?.(m))

onMounted(async () => {
  const [THREE, ctrl, lib] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellex-js/core'),
  ])
  const { OrbitControls } = ctrl
  const { useBody, DEFAULT_TILE_SIZE, generateBodyVariation } = lib

  const el = container.value
  if (!el) return

  const sizeOf = (): { w: number; h: number } => {
    const rect = el.getBoundingClientRect()
    return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) }
  }

  let { w: width, h: height } = sizeOf()

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
  camera.position.set(0, 0.4, 3.2)

  // Brighter “sun” so the thin atmo halo and the cloud bands read clearly
  // from the first frame — the rocky strategy bakes its halo opacity at
  // 0.45, but a 5 %-thick shell needs more incident light to register.
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  const sun = new THREE.DirectionalLight(0xfff1dd, 4.5)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping   = true
  orbit.enablePan       = false
  orbit.minDistance     = 4.5
  orbit.maxDistance     = 4.5
  orbit.autoRotate      = true
  orbit.autoRotateSpeed = 0.45
  // Free up the right mouse button for the atmosphere hold gesture.
  orbit.mouseButtons    = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  -1 as unknown as THREE.MOUSE,
  }

  const config = {
    type:                'planetary',           
    surfaceLook: 'terrain' as const,
    name:                'home-earth-like',
    radius:               1.4,
    rotationSpeed:        0,
    axialTilt:            0.41,
    // Near-1 collapses the relief onto the top band so the playable sol
    // reads as a smooth shell with the ocean tiles cleanly distinguished
    // (1.0 would flatten the sea level too and erase the shoreline).
    reliefFlatness:       0.55,
    atmosphereThickness:  0.15,
    atmosphereOpacity:    0.9,
    liquidState:         'liquid' as const,
    liquidCoverage:       0.32,
    liquidColor:         '#175da1',
    terrainColorLow:     '#2c2820',
    terrainColorHigh:    '#8a8270',
  }

  // Smooth-shell variation — the procedural variation generator yields
  // values in `[0.6, 1.4]` for roughness/height, which makes the rocky
  // shader read as visibly bumpy. Clamp height + roughness near their
  // floors and zero out craters so the mode-shader sphere appears flat.
  const baseVariation = generateBodyVariation(config)
  const variation = {
    ...baseVariation,
    roughnessMod:     0.10,
    heightMod:        0.05,
    craterDensityMod: 0.10,
    craterCountMod:   0.10,
    waveAmount:       1,
  }

  // 4× the default tile density — `N ∝ 1/tileSize²`, so halving the tile
  // size quadruples the count (~5 k → ~20 k tiles on a unit sphere).
  const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
  body.group.rotation.z = config.axialTilt
  scene.add(body.group)

  // Live, breathing cloud cover. The shell shader already advects the
  // cloud field on `uTime` (driven by `body.tick`), so we only need to
  // crank `cloudAmount` and the drift rate. `bandiness` is lowered so
  // the result reads as moving cloud cells, not Jupiter-style belts.
  body.atmoShell?.setParams({
    cloudAmount: 1,
    cloudColor:  '#ffffff',
    cloudScale:  1.4,
    driftSpeed:  1.6,
    storms:      0.18,
    turbulence:  0.78,
    bandiness:   0.18,
  })


  paintAtmoSample(body)

  applyMode = (m: HeroViewMode) => {
    if (m === 'shader') {
      body.view.set('shader')
      body.interactive.deactivate()
      setBodyCoreVisible(body, false)
    } else {
      body.interactive.activate()
      body.view.set(m === 'atmosphere' ? 'atmosphere' : 'surface')
      setBodyCoreVisible(body, true)
    }
  }
  // Force the shader view on mount: `useBody` initialises `activeView` to
  // `'surface'` and never auto-paints, so without this call the atmo halo
  // mesh stays hidden until the user clicks. We want it live immediately.
  applyMode('shader')

  // Press-and-hold tracking. Each pointerdown installs the matching mode;
  // pointerup / pointerleave snaps back to shader. We track the active
  // pointerId so a leave-and-reenter while still pressed doesn't trip us.
  let activePointer = -1

  const onPointerDown = (e: PointerEvent): void => {
    const next = viewModeForHold(e.button)
    if (next === 'shader') return
    activePointer = e.pointerId
    mode.value = next
    renderer.domElement.setPointerCapture?.(e.pointerId)
  }
  const onPointerUp = (e: PointerEvent): void => {
    if (activePointer !== -1 && e.pointerId !== activePointer) return
    activePointer = -1
    renderer.domElement.releasePointerCapture?.(e.pointerId)
    mode.value = 'shader'
  }
  const onPointerCancel = onPointerUp
  const onContextMenu = (e: Event): void => e.preventDefault()

  renderer.domElement.addEventListener('pointerdown',   onPointerDown)
  renderer.domElement.addEventListener('pointerup',     onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  renderer.domElement.addEventListener('contextmenu',   onContextMenu)

  await body.warmup(renderer, camera, {
    onProgress: (info: { label: string; progress: number }) => {
      loadingLabel.value = info.label
      loadingRatio.value = info.progress
    },
  })
  loading.value = false

  const onResize = (): void => {
    const next = sizeOf()
    width  = next.w
    height = next.h
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', onResize)

  let animId  = 0
  let last    = performance.now()
  const loop = (): void => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last = now
    orbit.update()
    body.tick(dt)
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', onResize)
    renderer.domElement.removeEventListener('pointerdown',   onPointerDown)
    renderer.domElement.removeEventListener('pointerup',     onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
    renderer.domElement.removeEventListener('contextmenu',   onContextMenu)
    orbit.dispose()
    body.dispose()
    renderer.dispose()
    if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="hero-planet">
    <div ref="container" class="hero-planet__canvas" />

    <Transition name="hero-loader">
      <div v-if="loading" class="hero-planet__loader">
        <span class="hero-planet__label">{{ loadingLabel }}</span>
        <div class="hero-planet__bar">
          <div
            class="hero-planet__fill"
            :style="{ width: (loadingRatio * 100) + '%' }"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hero-planet {
  position: relative;
  width:  100%;
  aspect-ratio: 1 / 1;
  max-width: 340px; 
  margin: 0 auto;
}

.hero-planet__canvas {
  position: absolute;
  inset: 0;
  width:  100%;
  height: 100%;
  cursor: grab;
}
.hero-planet__canvas:active { cursor: grabbing; }

.hero-planet__loader {
  position: absolute;
  inset: auto 0 12px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}

.hero-planet__label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}

.hero-planet__bar {
  width: 180px;
  height: 3px;
  background: var(--vp-c-divider);
  border-radius: 999px;
  overflow: hidden;
}

.hero-planet__fill {
  height: 100%;
  background: linear-gradient(90deg, #4ea3ff, #a78bff);
  transition: width 120ms ease-out;
}

.hero-planet__hint {
  position: absolute;
  inset: auto 0 -28px 0;
  margin: 0;
  display: flex;
  justify-content: center;
  gap: 1.25rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
  letter-spacing: 0.02em;
  pointer-events: none;
}
.hero-planet__hint[data-mode='surface']    span:first-child  { color: var(--vp-c-brand-1); }
.hero-planet__hint[data-mode='atmosphere'] span:nth-child(2) { color: var(--vp-c-brand-1); }

.hero-loader-enter-active,
.hero-loader-leave-active { transition: opacity 320ms ease; }
.hero-loader-enter-from,
.hero-loader-leave-to     { opacity: 0; }

@media (max-width: 640px) {
  .hero-planet { max-width: 360px; }
  .hero-planet__hint { font-size: 0.65rem; gap: 0.75rem; }
}
</style>
