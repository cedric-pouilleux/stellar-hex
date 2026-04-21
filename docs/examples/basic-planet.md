<script setup>
import ThreePlanetDemo from '../.vitepress/theme/demos/ThreePlanetDemo.vue'
import ThreePlanetDemoRaw from '../.vitepress/theme/demos/ThreePlanetDemo.vue?raw'
import VuePlanetDemoRaw from '../.vitepress/theme/demos/VuePlanetDemo.vue?raw'

const tabs = [
  { label: 'Three.js', code: ThreePlanetDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: VuePlanetDemoRaw,   lang: 'vue' },
]
</script>

# Basic Planet

Rocky planet with procedural biomes, ocean mask, atmosphere and cloud shell.
The preview runs the vanilla Three.js implementation — click **Show code** then
switch tabs to compare with the Vue / TresJS equivalent.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <ThreePlanetDemo />
  </DemoBlock>
</ClientOnly>
