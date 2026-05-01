<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { BodyNoiseProfile } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Three.js demo — galerie d'effets `BodyNoiseProfile`.
 *
 * Chaque cellule partage exactement le même `name` (donc le même seed) et
 * la même physique : seul le profil de bruit change. Comparer deux cellules
 * isole l'effet visuel d'un paramètre `noise*` indépendamment du reste.
 *
 * `liquidState: 'none'` partout pour que le relief reste lisible jusqu'au
 * fond (un océan masquerait les bandes basses).
 */

interface NoiseSpec {
  label: string
  hint:  string
  noise: BodyNoiseProfile
}

const specs: NoiseSpec[] = [
  {
    label: 'Default (1 octave)',
    hint:  'noise par défaut',
    noise: {},
  },
  {
    label: 'fBm 4 octaves',
    hint:  'noiseOctaves: 4',
    noise: { noiseOctaves: 4 },
  },
  {
    label: 'Crêtes — ridge 1.0',
    hint:  'noiseRidge: 1, noiseOctaves: 4',
    noise: { noiseRidge: 1.0, noiseOctaves: 4 },
  },
  {
    label: 'Hybride — ridge 0.5',
    hint:  'noiseRidge: 0.5, noiseOctaves: 4',
    noise: { noiseRidge: 0.5, noiseOctaves: 4 },
  },
  {
    label: 'Persistence 0.25',
    hint:  'noiseOctaves: 5, noisePersistence: 0.25',
    noise: { noiseOctaves: 5, noisePersistence: 0.25 },
  },
  {
    label: 'Persistence 0.85',
    hint:  'noiseOctaves: 5, noisePersistence: 0.85',
    noise: { noiseOctaves: 5, noisePersistence: 0.85 },
  },
]

const containers = ref<HTMLDivElement[]>([])
let cleanups: Array<() => void> = []

onMounted(async () => {
  const [THREE, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const el   = containers.value[i]
    if (!el) continue

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100)
    camera.position.set(0, 0, 4.2)

    scene.add(new THREE.AmbientLight(0xffffff, 0.3))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(4, 3, 5)
    scene.add(sun)

    const body = useBody({
      type:                'planetary',
      surfaceLook:         'terrain',
      // Same seed across every cell — isolates the noise-only delta.
      name:                'gaia',
      radius:               1.4,
      rotationSpeed:        0.005,
      axialTilt:            0.3,
      // Sea level off — relief stays readable from peaks down to the core.
      liquidState:         'none',
      atmosphereThickness:  0.0,
      // Caller-supplied noise profile — the only field that varies between cells.
      ...spec.noise,
    }, DEFAULT_TILE_SIZE)
    // Switch to the playable hex view so each cell shows the actual relief
    // (excavated bands + exposed core), not the smooth-sphere shader tint.
    body.interactive.activate()
    body.view.set('surface')
    scene.add(body.group)

    let animId: number
    let last = performance.now()
    const loop = () => {
      animId = requestAnimationFrame(loop)
      const now = performance.now()
      const dt  = (now - last) / 1000
      last = now
      body.group.rotation.y += dt * 0.3
      body.tick(dt)
      renderer.render(scene, camera)
    }
    loop()

    cleanups.push(() => {
      cancelAnimationFrame(animId)
      body.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    })
  }
})

onBeforeUnmount(() => {
  cleanups.forEach(c => c())
  cleanups = []
})
</script>

<template>
  <div class="noise-grid">
    <div v-for="(spec, i) in specs" :key="spec.label" class="noise-cell">
      <div :ref="(el) => { if (el) containers[i] = el as HTMLDivElement }" class="noise-canvas" />
      <p class="noise-label">{{ spec.label }}</p>
      <p class="noise-hint">{{ spec.hint }}</p>
    </div>
  </div>
</template>

<style scoped>
.noise-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  background: var(--vp-c-divider);
  height: 540px;
}
.noise-cell {
  position: relative;
  background: #08080f;
}
.noise-canvas { width: 100%; height: 100%; }
.noise-label {
  position: absolute;
  bottom: 1.5rem;
  left: 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255,255,255,0.85);
  margin: 0;
}
.noise-hint {
  position: absolute;
  bottom: 0.4rem;
  left: 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.65rem;
  color: rgba(255,255,255,0.55);
  margin: 0;
}
</style>
