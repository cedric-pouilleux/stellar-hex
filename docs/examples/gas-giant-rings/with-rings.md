<script setup>
import { gasGiantThreeCode } from '../../.vitepress/theme/code/gas-giant-three'
import GasGiantVueRaw from '../../.vitepress/theme/demos/GasGiantVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: gasGiantThreeCode, lang: 'ts'  },
  { label: 'Vue',      code: GasGiantVueRaw,    lang: 'vue' },
]
</script>

# Gas Giant — With ring system

Banded gas giant with a procedural ring disc. The ring variation is generated
deterministically from the body seed via `generateBodyVariation` inside `useBody`.

<DemoBlock :tabs="tabs">
  <div class="no-demo">No live preview — install the package and run locally.</div>
</DemoBlock>

The full list of ring archetypes is documented on
[`RING_ARCHETYPES`](/api/) in the API reference.

<style scoped>
.no-demo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: rgba(255,255,255,0.3);
  font-size: 0.9rem;
  font-family: var(--vp-font-family-mono);
}
</style>
