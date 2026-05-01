import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DemoBlock from './components/DemoBlock.vue'
import ImplSwitcher from './components/ImplSwitcher.vue'
import EarthHeroPlanet from './components/EarthHeroPlanet.vue'

/**
 * Extends the VitePress default theme with:
 * - the global `ImplSwitcher` (shown only on `/examples/` pages),
 * - the `DemoBlock` component registered globally so MD pages can wrap
 *   a live preview + tabbed source code without an explicit import,
 * - an interactive Earth-like planet sitting in the home hero image
 *   slot (right of the title) — left-click toggles the playable sol
 *   board, right-click toggles the playable atmosphere board.
 */
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'aside-top':       () => h(ImplSwitcher),
      'home-hero-image': () => h(EarthHeroPlanet),
    }),
  enhanceApp({ app }) {
    app.component('DemoBlock', DemoBlock)
  },
}

export default theme
