<script setup>
import VuePlanetDemo from '../../.vitepress/theme/demos/VuePlanetDemo.vue'
import VuePlanetDemoRaw from '../../.vitepress/theme/demos/VuePlanetDemo.vue?raw'

const tabs = [{ label: 'Vue', code: VuePlanetDemoRaw, lang: 'vue' }]
</script>

# Basic Planet — With Vue

Same rocky planet using `<TresCanvas>` and the `<Body>` component from the
root entry. Atmosphere and cloud shell are mounted automatically by `<Body>`
based on the config — no manual shell setup needed.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <VuePlanetDemo />
  </DemoBlock>
</ClientOnly>
