<script setup>
import BodyTypeStarDemo    from '../../.vitepress/theme/demos/BodyTypeStarDemo.vue'
import BodyTypeStarDemoRaw from '../../.vitepress/theme/demos/BodyTypeStarDemo.vue?raw'
import BodyTypeStarVueRaw  from '../../.vitepress/theme/demos/BodyTypeStarVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: BodyTypeStarDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: BodyTypeStarVueRaw,  lang: 'vue' },
]
</script>

# Étoile

Corps en fusion nucléaire avec granulation convective animée, corona et pulsation. La température de surface (en Kelvin) est dérivée de la classe spectrale (`SPECTRAL_KELVIN`) et la couleur en blackbody via `kelvinToThreeColor`.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeStarDemo />
  </DemoBlock>
</ClientOnly>

## Info métier

La classe spectrale (`spectralType`) est la propriété centrale d'une étoile — elle détermine simultanément la température, la couleur et les paramètres de rendu. La granulation convective (cellules de Bénard-Marangoni) est simulée par un bruit de Worley animé. La corona est un halo fresnel autour du disque. Le slider **Température** modifie directement l'uniform shader — glisser de 2500 K (rouge M) à 40 000 K (bleu O) change la teinte en temps réel.

| Type spectral | Température | Couleur |
|---------------|-------------|---------|
| O | > 30 000 K | Bleu-violet |
| B | 10 000 – 30 000 K | Bleu-blanc |
| A | 7 500 – 10 000 K | Blanc |
| F | 6 000 – 7 500 K | Blanc-jaune |
| G | 5 200 – 6 000 K | Jaune (Soleil) |
| K | 3 700 – 5 200 K | Orange |
| M | 2 400 – 3 700 K | Rouge |

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'star'` | Discriminant obligatoire |
| `spectralType` | `'O'\|'B'\|'A'\|'F'\|'G'\|'K'\|'M'` | Classe spectrale — dérive température (Kelvin) et couleur via la table `SPECTRAL_KELVIN` |
| `rotationSpeed` | `number` | Vitesse de rotation (rad/s) — dérive `animSpeed` |
| `radius` | `number` | Rayon visuel (unités monde) |

## Paramètres shader

### Base

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `seed` | 0 – 1000 | 1 | Graine du bruit procédural |
| `temperature` | 2500 – 40 000 K | 5778 | Température de surface — dérive la couleur blackbody |
| `animSpeed` | 0 – 3 | 1.0 | Vitesse d'animation de la convection |

### Granulation

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `convectionScale` | 0.05 – 4 | 1.5 | Taille des cellules de convection |
| `granulationContrast` | 0 – 1 | 0.65 | Contraste entre cellules chaudes et froides |
| `cloudAmount` | 0 – 1 | 0.55 | Opacité de la couche de granulation supérieure |
| `cloudBlend` | select | Overlay | Mode de fusion de la couche supérieure |

### Effets

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `coronaSize` | 0 – 0.5 | 0.15 | Rayon normalisé de la corona fresnel |
| `pulsation` | 0 – 1 | 0.3 | Amplitude des pulsations de luminosité |
