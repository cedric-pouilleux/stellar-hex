/**
 * Pure state mapping for the home-page hero planet's view mode.
 *
 * The hero canvas exposes three states matching `body.view.set(...)`:
 *
 *   - `'shader'`     — pretty mode (smooth sphere + animated atmo halo)
 *   - `'surface'`    — playable hex sol
 *   - `'atmosphere'` — playable atmo board
 *
 * Interaction model is **press-and-hold**: while the left button is
 * pressed, the surface is shown; while the right button is pressed, the
 * atmosphere board is shown. Releasing any button returns to the shader
 * view. `viewModeForHold` is the one-line predicate that drives this.
 *
 * Kept dependency-free so it's trivially unit-tested.
 */

export type HeroViewMode = 'shader' | 'surface' | 'atmosphere'

/**
 * Maps a `MouseEvent.button` value to the view mode that should be
 * displayed while that button is held down. Any other button (middle,
 * back/forward) falls through to the calm shader view.
 */
export function viewModeForHold(button: number): HeroViewMode {
  if (button === 0) return 'surface'
  if (button === 2) return 'atmosphere'
  return 'shader'
}
