<script setup>
import NoiseProfileDemo    from '../../.vitepress/theme/demos/NoiseProfileDemo.vue'
import NoiseProfileDemoRaw from '../../.vitepress/theme/demos/NoiseProfileDemo.vue?raw'
import NoiseProfileVueRaw  from '../../.vitepress/theme/demos/NoiseProfileVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: NoiseProfileDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: NoiseProfileVueRaw,  lang: 'vue' },
]
</script>

# Profil de bruit (`BodyNoiseProfile`)

[`BodyNoiseProfile`](/api/sim/interfaces/BodyNoiseProfile) pilote le **champ scalaire** que la simulation quantifie en bandes d'élévation. Six knobs orthogonaux contrôlent la forme du relief — sans changer ni la palette, ni la silhouette, ni le tile count.

Les 6 cellules ci-dessous partagent **exactement le même seed** (`name: 'gaia'`) et la même physique. Seul le profil de bruit change. Comparer deux cellules isole l'effet visuel d'un paramètre indépendamment du reste.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <NoiseProfileDemo />
  </DemoBlock>
</ClientOnly>

## Catalogue des paramètres

| Champ | Plage | Défaut | Effet |
| ----- | ----- | ------ | ----- |
| `noiseScale`       | `> 0`     | `1.4` | Fréquence de base du simplex. Petit = relief large (continents épais), grand = relief fin (texture serrée). |
| `noiseOctaves`     | `1..8`    | `1`   | Nombre d'octaves fBm sommées. `1` = simplex brut ; > 1 empile du détail à fréquence multipliée. |
| `noisePersistence` | `(0, 1]`  | `0.5` | Atténuation par octave. `0.25` = octaves hautes muettes (relief lisse), `0.85` = octaves hautes dominantes (relief bruité). |
| `noiseLacunarity`  | `≥ 1`     | `2`   | Multiplicateur de fréquence entre octaves. `2` = doublement classique fBm ; `3` = sauts de fréquence plus larges. |
| `noiseRidge`       | `[0, 1]`  | `0`   | Mix vers ridge multifractal — transforme les crêtes du bruit en arêtes nettes. `1` = montagnes, `0.5` = hybride plaine + crêtes. |
| `noisePower`       | `> 0`     | `1`   | Reshape exponentiel `sign(n) × \|n\|^p`. **Voir caveat plus bas.** |

::: warning `noisePower` n'a pas d'effet sur les bandes hex
Le terrain hexagonal est quantifié par **équi-fréquence** (cf. [Concepts fondamentaux §6](/guides/core-concepts#quantification-%C3%A9qui-fr%C3%A9quence)) : les `n` tuiles sont triées et découpées en `N` paquets de taille égale. Le ranking est invariant par toute transformation monotone du bruit — `noisePower` est exactement ce type de transformation, donc **les bandes restent identiques**.

Son seul effet observable est sur les *readers de bruit brut* : le shader de la smooth sphere quand il calcule un masque océan (vue `'shader'`), où le seuil de chaque bande est reshapé. Sur le mesh hex jouable, la palette est strictement la même.
:::

## Régimes typiques

Quelques presets cohérents avec les choix de la lib :

```ts
// Default — cohérent, doux, suffisant pour la plupart des cas
{ /* noise* tous omis */ }

// Multi-octave classique — relief riche, transitions naturelles
{ noiseOctaves: 4, noisePersistence: 0.5, noiseLacunarity: 2.0 }

// Crêtes pures — chaînes de montagnes, alpins
{ noiseRidge: 1.0, noiseOctaves: 4 }

// Hybride — plaines en dunes + sommets en crêtes
{ noiseRidge: 0.5, noiseOctaves: 4 }

// Lisse — relief doux, peu de détails hautes fréquences
{ noiseOctaves: 5, noisePersistence: 0.25 }

// Bruité — détails hautes fréquences dominants (lune cratérée)
{ noiseOctaves: 5, noisePersistence: 0.85 }
```

Le profil de bruit est **une partie** du pipeline d'élévation. Pour des landmasses macroscopiques (continents, archipels), c'est `continentAmount` / `continentScale` qui prennent le relais. Pour aplatir un planet sans perdre de bandes, c'est `reliefFlatness`. Cf. [Palettes & terrain — Continents discrets](/guides/palettes-and-terrain#continents-discrets-rocheuses).

## Stack complet (relief macro → micro)

Cinq couches s'appliquent successivement, chacune indépendamment toggleable :

```
1. Voronoï continent  ── continentAmount, continentScale  (si > 0)
2. fBm simplex        ── noiseScale, noiseOctaves, noisePersistence, noiseLacunarity
3. Ridge transform    ── noiseRidge                       (mix vers `1 - 2|n|`)
4. Power reshape      ── noisePower                       (sign(n) × |n|^p — n'affecte pas les bandes)
5. Equi-frequency     ── auto                             (ranking → N bandes équilibrées)
6. Flatness contract  ── reliefFlatness                   (post-quantisation, contracte vers le top)
```

L'ordre est figé. Pour mémoire :
- (1) ajoute des landmasses **avant** la sommation fBm — le voronoi pilote la macro silhouette.
- (3) → (4) sont des reshapes **avant** la quantification — ils altèrent la **forme** du bruit.
- (5) est le passage clé : le ranking équi-fréquence garantit que **chaque bande reçoit ~le même nombre de tuiles**, indépendamment de la forme du bruit.
- (6) intervient **après** la quantification — flatness aplatit la rétroaction du ranking sans réduire le nombre de bandes accessibles à l'excavation.

## Déterminisme

Comme le reste de la lib, le bruit est seedé sur `BodyConfig.name`. Deux corps avec le même `name` et le même profil de bruit produisent **byte-à-byte** le même relief — c'est ce qui permet à la galerie ci-dessus d'isoler les paramètres : on ne voit pas du « hasard différent », on voit l'effet du paramètre.

Pour générer plusieurs variations d'un même profil, change le `name` ; pour comparer deux profils sur la même planète, garde le `name` constant et tweak `noise*`.

## Voir aussi

- [Palettes & terrain — Continents discrets](/guides/palettes-and-terrain#continents-discrets-rocheuses) — la couche voronoï macro
- [Concepts fondamentaux §6](/guides/core-concepts#_6-le-syst%C3%A8me-de-tuiles) — quantification équi-fréquence + `reliefFlatness`
- [API : `BodyNoiseProfile`](/api/sim/interfaces/BodyNoiseProfile)
- [Headless / serveur](/guides/headless-simulation) — générer un seed côté Node sans WebGL
