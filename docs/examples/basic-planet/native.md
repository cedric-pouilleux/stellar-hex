<script setup>
import ThreePlanetDemo from '../../.vitepress/theme/demos/ThreePlanetDemo.vue'
import ThreePlanetDemoRaw from '../../.vitepress/theme/demos/ThreePlanetDemo.vue?raw'

const tabs = [{ label: 'Three.js', code: ThreePlanetDemoRaw, lang: 'vue' }]
</script>

# Basic Planet — Native Three.js

Rocky planet with procedural biomes, ocean mask, atmosphere and cloud shell
using the `/core` entry point directly.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <ThreePlanetDemo />
  </DemoBlock>
</ClientOnly>
