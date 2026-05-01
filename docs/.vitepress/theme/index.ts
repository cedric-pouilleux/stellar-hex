import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DemoBlock from './components/DemoBlock.vue'
import ImplSwitcher from './components/ImplSwitcher.vue'
import EarthHeroPlanet from './components/EarthHeroPlanet.vue'
import HeroPlanetToggle from './components/HeroPlanetToggle.vue'
import HomeIntro from './components/HomeIntro.vue'
import './styles/home.css'

/**
 * Extends the VitePress default theme with:
 * - the global `ImplSwitcher` (shown only on `/examples/` pages),
 * - the `DemoBlock` component registered globally so MD pages can wrap
 *   a live preview + tabbed source code without an explicit import,
 * - the home-page hero planet, split across three slots:
 *     - `home-hero-before` mounts `EarthHeroPlanet` as a fixed,
 *       full-viewport canvas (right-side, behind everything),
 *     - `home-hero-after` mounts `HeroPlanetToggle`, the small
 *       loader / view-mode toggle that sits flush under the hero
 *       baseline,
 *     - `home-features-before` mounts `HomeIntro`, the editorial
 *       layered-architecture description placed just above the
 *       features grid. All three slots are home-only, so no
 *       per-route guard.
 */
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'aside-top':            () => h(ImplSwitcher),
      'home-hero-before':     () => h(EarthHeroPlanet),
      'home-hero-after':      () => h(HeroPlanetToggle),
      'home-features-before': () => h(HomeIntro),
    }),
  enhanceApp({ app }) {
    app.component('DemoBlock', DemoBlock)
  },
}

export default theme
