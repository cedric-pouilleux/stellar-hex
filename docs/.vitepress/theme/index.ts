import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DemoBlock from './components/DemoBlock.vue'
import './controls.css'

/** Extends VitePress default theme with demo components and a controls portal. */
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'aside-top': () => h('div', { id: 'demo-controls-portal' }),
  }),
  enhanceApp({ app }) {
    app.component('DemoBlock', DemoBlock)
  },
}

export default theme
