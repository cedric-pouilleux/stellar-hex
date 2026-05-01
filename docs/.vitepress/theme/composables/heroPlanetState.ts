import { ref } from 'vue'
import type { HeroViewMode } from './heroPlanetView'

/**
 * Shared reactive state for the home-page hero planet.
 *
 * The canvas (`EarthHeroPlanet.vue`) writes warmup progress and reacts
 * to `heroMode`; the controls strip (`HeroPlanetToggle.vue`) reads the
 * same refs and updates `heroBaseMode`. They are mounted in different
 * VitePress slots (`home-hero-before` and `home-features-before`), so
 * we use module-level state rather than props to bridge them.
 *
 * Hold gestures temporarily override `heroMode`; releasing snaps back
 * to `heroBaseMode`, which the toggle controls.
 */

export const heroBaseMode = ref<HeroViewMode>('shader')
export const heroMode     = ref<HeroViewMode>('shader')

export const heroLoading      = ref(true)
export const heroLoadingLabel = ref('Préparation de la planète…')
export const heroLoadingRatio = ref(0)

export const heroViewOptions: ReadonlyArray<{ value: HeroViewMode; label: string }> = [
  { value: 'shader',     label: 'Shader' },
  { value: 'surface',    label: 'Sol' },
  { value: 'atmosphere', label: 'Atmo' },
]
