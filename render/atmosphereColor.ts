/**
 * Visual color for the atmosphere shell based on the surface temperature (K).
 *
 * Not a physical model — a four-step palette used by UI previews and the
 * atmosphere shader to convey a planet's thermal class at a glance.
 */
export function atmosphereColorFromTemp(T_surface_K: number): string {
  if (T_surface_K > 773) return '#ff4400'   // volcanic / runaway greenhouse
  if (T_surface_K > 263) return '#4488ff'   // temperate (Earth-like)
  if (T_surface_K > 173) return '#aaddff'   // cold / icy
  return '#888888'                          // frigid / negligible
}
