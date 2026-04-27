/**
 * Reactive view-mode toggle for the playground.
 *
 * Flips the layered interactive mesh between two mutually exclusive
 * renderings:
 * - `'surface'` shows the extruded sol band (terrain relief).
 * - `'atmosphere'` shows the outer hexasphere, pinned at `config.radius`
 *   with no vertical relief — that layer stands in for the body's
 *   atmosphere.
 *
 * Panes watch the exported ref and call `body.view.set(mode)` on the
 * layered interactive mesh; the smooth-sphere display mesh ignores it.
 */

import { ref } from 'vue'
import type { InteractiveView } from '@lib'

/** Shared reactive view mode — single source of truth for the UI toggle. */
export const viewMode = ref<InteractiveView>('surface')
