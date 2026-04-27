<script setup>
import TemperatureGradientDemo    from '../../.vitepress/theme/demos/TemperatureGradientDemo.vue'
import TemperatureGradientDemoRaw from '../../.vitepress/theme/demos/TemperatureGradientDemo.vue?raw'
import TemperatureGradientVueRaw  from '../../.vitepress/theme/demos/TemperatureGradientVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: TemperatureGradientDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: TemperatureGradientVueRaw,  lang: 'vue' },
]
</script>

# Gradient de température

La lib est **agnostique du climat** — `BodyConfig` ne porte plus de champs `temperatureMin/Max`, et aucune fonction de la lib ne lit une température. Le pattern recommandé : calculer côté caller des ancres `terrainColorLow`/`terrainColorHigh` (ou un quadruplet `metallicBands`) depuis votre propre modèle thermique, puis les pousser dans `BodyConfig`.

Le démo ci-dessous illustre ce pattern : chaque cellule pré-résout ses couleurs et les pousse dans la lib qui n'a jamais besoin de connaître la température derrière.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <TemperatureGradientDemo />
  </DemoBlock>
</ClientOnly>

## Régimes typiques (caller-side)

| Plage moyenne | Ancres terrain typiques | `liquidState` typique |
| ------------- | ----------------------- | --------------------- |
| `< -50 °C`     | Bleu-gris pâle → blanc | `'frozen'` (cap glace via `buildSolidShell`) |
| `-50 → 60 °C`  | Brun → vert tempéré    | `'liquid'` |
| `> 60 °C`      | Ocre → rouge brûlé     | `'liquid'` ou `'none'` (évaporé), au choix du caller |

## Pattern caller-driven

```ts
// 1. Côté caller : modèle thermique → ancres de palette
function deriveAnchors(midC: number): { low: string; high: string } {
  if (midC > 200) return { low: '#3a1808', high: '#c08040' }   // brûlé
  if (midC <  -50) return { low: '#404a58', high: '#d8e4f0' }  // glacial
  return                  { low: '#2c2820', high: '#8a8270' }  // tempéré
}

// 2. La lib reçoit les ancres résolues — elle ne sait rien du modèle thermique
function buildBody(midC: number) {
  const { low, high } = deriveAnchors(midC)
  return useBody({
    // ...
    liquidState:      midC > 0 ? 'liquid' : 'frozen',
    terrainColorLow:  low,
    terrainColorHigh: high,
  }, DEFAULT_TILE_SIZE)
}
```

## Reconstruire vs muter

La palette est résolue **au build**. Pour passer d'un régime à un autre en runtime, le pattern est `dispose()` + `useBody()` (voir le snippet ci-dessus). Pour une variation **continue** sans rebuild, passez par un override de palette (`BodyRenderOptions.palette`) que vous régénérez à la volée. C'est ce que font les pipelines de prévisualisation type « time-of-year ».
