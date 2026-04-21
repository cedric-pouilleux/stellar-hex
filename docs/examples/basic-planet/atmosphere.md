<script setup>
import PlanetAtmoDemo    from '../../.vitepress/theme/demos/PlanetAtmoDemo.vue'
import PlanetAtmoDemoRaw from '../../.vitepress/theme/demos/PlanetAtmoDemo.vue?raw'
import PlanetAtmoVueRaw  from '../../.vitepress/theme/demos/PlanetAtmoVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: PlanetAtmoDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: PlanetAtmoVueRaw,  lang: 'vue' },
]
</script>

# Basic Planet — With atmosphere

Rocky planet with a Rayleigh scattering atmosphere shell. The atmosphere color
is derived automatically from the surface temperature range via `auraParamsFor`.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <PlanetAtmoDemo />
  </DemoBlock>
</ClientOnly>

## How it works

`buildAtmosphereShell` returns a standalone mesh you attach to the body group.
`auraParamsFor` resolves color, intensity and fresnel power from the config.

```ts
import {
  buildAtmosphereShell,
  atmosphereRadius,
  auraParamsFor,
} from '@cedric-pouilleux/stellar-hex/core'

const aura = auraParamsFor(config)
const atmo = buildAtmosphereShell({
  radius:    atmosphereRadius(config),
  litBySun:  true,
  color:     aura.color,
  intensity: aura.intensity,
  power:     aura.power,
})
body.group.add(atmo.mesh)

// in animation loop:
atmo.tick(elapsed)
```
