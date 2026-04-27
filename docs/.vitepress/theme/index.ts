import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DemoBlock from './components/DemoBlock.vue'
import ImplSwitcher from './components/ImplSwitcher.vue'

/**
 * Extends the VitePress default theme with:
 * - the global `ImplSwitcher` (shown only on `/examples/` pages),
 * - the `DemoBlock` component registered globally so MD pages can wrap
 *   a live preview + tabbed source code without an explicit import.
 */
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'aside-top': () => h(ImplSwitcher),
    }),
  enhanceApp({ app }) {
    app.component('DemoBlock', DemoBlock)
  },
}

export default theme
