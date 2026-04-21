<script setup>
import { starThreeCode } from '../../.vitepress/theme/code/star-three'
import StarVueRaw from '../../.vitepress/theme/demos/StarVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: starThreeCode, lang: 'ts'  },
  { label: 'Vue',      code: StarVueRaw,    lang: 'vue' },
]
</script>

# Star — With god-rays

Animated star shader with a post-processing god-rays pass. Numeric ranges for
every star uniform (`temperature`, `convectionScale`, `coronaSize`, …) live in
`SHADER_RANGES.star`.

<DemoBlock :tabs="tabs">
  <div class="no-demo">No live preview — install the package and run locally.</div>
</DemoBlock>

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
