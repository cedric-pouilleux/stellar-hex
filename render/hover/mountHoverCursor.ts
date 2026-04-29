/**
 * Preset orchestration on top of the unified hover cursor.
 *
 * Two construction shapes coexist:
 *
 *   - `hoverCursor`  : single config — wrapped into a `{ default: cfg }`
 *                      preset map for uniform downstream handling.
 *   - `hoverCursors` : named preset map — the lib pre-allocates the union
 *                      of every primitive used across the presets so any
 *                      preset can be activated live without re-building
 *                      the body. The initial preset is `defaultCursor`
 *                      (or the first key when omitted).
 *
 * Switching a preset is a `cursor.updateConfig(preset)` call under the
 * hood — colors / intensities / opacities apply in place; ring sizes
 * replay on the next pointer move via `cursor.refresh`.
 */

import {
  buildHoverCursor,
  type HoverCursorHandle,
  type HoverCursorPorts,
} from './buildHoverCursor'
import type {
  HoverCursorConfig,
  HoverCursorPresets,
} from '../../types/hoverCursor.types'

/** Optional inputs forwarded by the body factories. */
export interface MountHoverCursorOptions {
  /** Single cursor — equivalent to `hoverCursors: { default: hoverCursor }`. */
  hoverCursor?:   HoverCursorConfig
  /** Named cursor presets, swappable at runtime via `useCursor(name)`. */
  hoverCursors?:  HoverCursorPresets
  /** Initial preset name (defaults to the first key in `hoverCursors`). */
  defaultCursor?: string
}

/** Public surface returned by {@link mountHoverCursor}. */
export interface HoverCursorMount {
  /** The underlying primitive — forwarded to `body.hover.{setBoardTile, onChange, …}`. */
  cursor:    HoverCursorHandle
  /** Switches the active preset by name. Throws on unknown names. */
  useCursor: (name: string) => void
}

/** Resolves the construction inputs into a normalised preset map + initial name. */
function resolvePresets(opts: MountHoverCursorOptions | undefined): {
  presets:     HoverCursorPresets
  defaultName: string
} {
  if (opts?.hoverCursors) {
    const names = Object.keys(opts.hoverCursors)
    if (names.length === 0) {
      // Empty map — fall back to a single default preset.
      return { presets: { default: {} }, defaultName: 'default' }
    }
    const defaultName = opts.defaultCursor ?? names[0]
    if (!opts.hoverCursors[defaultName]) {
      throw new Error(`Unknown defaultCursor "${defaultName}" — keys: ${names.join(', ')}`)
    }
    return { presets: opts.hoverCursors, defaultName }
  }
  // Back-compat single cursor — wrapped so the runtime treats every
  // body uniformly through the preset path.
  return {
    presets:     { default: opts?.hoverCursor ?? {} },
    defaultName: 'default',
  }
}

/**
 * Builds the union of every primitive that is **not explicitly disabled**
 * in any preset. The union is what the cursor allocates GPU resources for;
 * primitives absent from the union cannot be activated by any preset.
 *
 * Each per-primitive config in the union carries empty params — defaults
 * apply at allocation. The active preset's `updateConfig` call right
 * after construction overrides those defaults with the preset values.
 */
function unionPrimitives(presets: HoverCursorPresets): HoverCursorConfig {
  const used = { ring: false, floorRing: false, emissive: false, column: false }
  for (const cfg of Object.values(presets)) {
    if (cfg.ring      !== false) used.ring      = true
    if (cfg.floorRing !== false) used.floorRing = true
    if (cfg.emissive  !== false) used.emissive  = true
    if (cfg.column    !== false) used.column    = true
  }
  return {
    ring:      used.ring      ? {} : false,
    floorRing: used.floorRing ? {} : false,
    emissive:  used.emissive  ? {} : false,
    column:    used.column    ? {} : false,
  }
}

/**
 * Builds the hover cursor with preset-aware orchestration. Returns the
 * cursor handle (for hover dispatch) and a `useCursor(name)` switcher
 * the body factory wires onto `body.hover`.
 */
export function mountHoverCursor(
  opts:  MountHoverCursorOptions | undefined,
  ports: HoverCursorPorts,
): HoverCursorMount {
  const { presets, defaultName } = resolvePresets(opts)
  const union  = unionPrimitives(presets)
  const cursor = buildHoverCursor(union, ports)
  // Apply the default preset over the empty union so the user sees the
  // configured colors / intensities / opacities from the first hover.
  cursor.updateConfig(presets[defaultName])

  function useCursor(name: string): void {
    const preset = presets[name]
    if (!preset) throw new Error(`Unknown hover cursor preset: "${name}"`)
    cursor.updateConfig(preset)
  }

  return { cursor, useCursor }
}
