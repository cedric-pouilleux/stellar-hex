<script setup>
import ThreePlanetDemo    from '../../.vitepress/theme/demos/ThreePlanetDemo.vue'
import ThreePlanetDemoRaw from '../../.vitepress/theme/demos/ThreePlanetDemo.vue?raw'
import VuePlanetDemoRaw   from '../../.vitepress/theme/demos/VuePlanetDemo.vue?raw'

const tabs = [
  { label: 'Three.js', code: ThreePlanetDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: VuePlanetDemoRaw,   lang: 'vue' },
]
</script>

# Basic Planet — With clouds

Rocky planet with atmosphere and animated FBM cloud layer. Clouds appear when
`liquidCoverage >= 0.10` and `atmosphereThickness >= 0.15`. Frozen planets
(`temperatureMax <= 0`) render a static Worley ice sheet instead.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <ThreePlanetDemo />
  </DemoBlock>
</ClientOnly>

## How it works

The caller decides when clouds should appear (the lib no longer bundles a rule
for it). A typical rocky-planet heuristic:

```ts
import { buildCloudShell, cloudShellRadius } from '@cedric-pouilleux/stellar-hex/core'

const atmo   = config.atmosphereThickness ?? 0
const liquid = config.liquidCoverage      ?? 0
const coverage = atmo >= 0.15 && liquid >= 0.10
  ? Math.min(0.75, liquid * 0.55 + atmo * 0.20)
  : null

if (coverage != null) {
  const frozen = config.temperatureMax <= 0
  const clouds = buildCloudShell({
    radius:   cloudShellRadius(config, frozen),
    coverage,
    frozen,
  })
  body.group.add(clouds.mesh)

  // in animation loop:
  clouds.tick(dt)
}
```

`cloudShellRadius(config, frozen)` anchors the sphere above the tallest hex
terrain (palette max height), with a small gap on top — so tall tiles never
poke through the layer regardless of planet size.
