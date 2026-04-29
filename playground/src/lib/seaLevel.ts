/**
 * Reactive sea-level control for the playground.
 *
 * The layered interactive mesh exposes `setSeaLevel(worldRadius)` which
 * drives the liquid hex shell's top band (and repaints any tile whose
 * submerged status flipped across the move). The slider in
 * `LiquidControls` drives a normalised fraction in `[0, 1]`: the fraction
 * is read as a band-space position (`band = fraction * bandCount`), so
 * `0` pins the ocean on the core and `1` floats it above the tallest
 * peak. `HexaPane` converts the band back to world units before
 * forwarding to `body.liquid.setSeaLevel` and mirrors it into the hover
 * tooltip.
 *
 * The default (`0.5`) matches the simulation's initial mid-band waterline,
 * so the slider starts aligned with the sim's default sea level.
 */

import { ref } from 'vue'

/** Shared sea-level fraction — 0 = at core, 1 = above the tallest band. */
export const seaLevelFraction = ref(0.5)

/** Canonical default used by the reset button. */
export const SEA_LEVEL_DEFAULT = 0.5
