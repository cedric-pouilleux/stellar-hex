import * as THREE from 'three'
import { c } from './colorUtils'

// ── Temperature anchor definitions ───────────────────────────────
// 5 key temperatures (°C): -150 / -40 / 15 / 120 / 400

/**
 * Level 0 (DRY) — dry lowland / base-rock colours keyed by temperature.
 * Used for rocky worlds without surface liquid.
 */
export const L0_DRY: [number, THREE.Color][] = [
  [-150, c(0xc8d8e8)],  // deep-freeze pale ice plain
  [ -40, c(0x6070a0)],  // cold grey-blue rock
  [  15, c(0x686058)],  // neutral grey-brown rock
  [ 120, c(0x6b3a1a)],  // dry dark brown
  [ 400, c(0x1a0800)],  // dark volcanic basalt
]

// ── Liquid-type color constants ───────────────────────────────────
// One flat colour per liquid type — deliberately temperature-independent.
// The caller's `liquidType` (opaque string) selects the sea + shore colour,
// and that choice is the ONLY physical input: the lib no longer tries to
// tint oceans based on how warm or cold the world is.

/** Canonical deep-water colour used whenever `liquidType === 'water'`. */
export const L0_WATER    = c(0x2878d0)  // Earth-ocean blue
/** Canonical deep colour for ammonia oceans (`liquidType === 'ammonia'`). */
export const L0_AMMONIA  = c(0x7a9840)  // yellow-green olive
/** Canonical deep colour for methane oceans (`liquidType === 'methane'`). */
export const L0_METHANE  = c(0x7a5828)  // Titan warm amber
/** Canonical deep colour for nitrogen oceans (`liquidType === 'nitrogen'`). */
export const L0_NITROGEN = c(0xc8b0b8)  // Pluto-like dusty rose
/** Canonical deep colour for a frozen surface sheet (any liquid). */
export const L0_ICE      = c(0x90b0c0)  // just-frozen grey-blue ice

/** Shore band above a water ocean — tropical turquoise. */
export const L_SHORE_WATER    = c(0x4dc8a8)
/** Shore band above an ammonia ocean — lighter yellow-green coastal palette. */
export const L_SHORE_AMMONIA  = c(0x98b860)
/** Shore band above a methane ocean — warm bronze coastal palette. */
export const L_SHORE_METHANE  = c(0x987840)
/** Shore band above a nitrogen ocean — dusty rose coastal palette. */
export const L_SHORE_NITROGEN = c(0xd0b8c0)

/**
 * Shore band (DRY) — arid shore / beach colours keyed by temperature. Used
 * for dry worlds and frozen-sheet worlds so the coastal rock step still
 * reads coherent without any liquid present.
 */
export const L_SHORE_DRY: [number, THREE.Color][] = [
  [-150, c(0xbcccd8)],  // deep-freeze grey-white ice shore
  [ -40, c(0x707878)],  // grey pebbles
  [  15, c(0xc8a870)],  // sandy beach
  [ 120, c(0xb89050)],  // dry shore
  [ 400, c(0x2a0e06)],  // dark volcanic shore
]

/** Level 1 (WET) — lowland / coastal plain colours for water-bearing worlds. */
export const L1_WET: [number, THREE.Color][] = [
  [-150, c(0xd4e4f0)],  // deep-freeze glacier plain — pale grey-white
  [ -40, c(0x7090a8)],  // cold grey-blue tundra with ice patches
  [  15, c(0x2d7a5a)],  // lush green lowlands
  [ 120, c(0xc89050)],  // warm savanna
  [ 400, c(0x5a1a08)],  // volcanic lowlands
]
/** Level 1 (DRY) — lowland / flat colours for dry worlds. */
export const L1_DRY: [number, THREE.Color][] = [
  [-150, c(0xd0dce8)],  // deep-freeze pale grey ice flat
  [ -40, c(0x8090a8)],  // cold grey-blue stone flat
  [  15, c(0x787060)],  // brown-grey rock plain
  [ 120, c(0xb8864e)],  // sandstone desert
  [ 400, c(0x401005)],  // dark lava rock
]

/** Level 2 (WET) — midland / hill / plateau colours for water-bearing worlds. */
export const L2_WET: [number, THREE.Color][] = [
  [-150, c(0xe0eef8)],  // deep-freeze ice ridge — near white
  [ -40, c(0x90a8b8)],  // cold icy highland
  [  15, c(0x3a8a52)],  // forest / highland green
  [ 120, c(0xd4956a)],  // arid plateau
  [ 400, c(0x8b2200)],  // dark red volcanic
]
/** Level 2 (DRY) — midland / plateau colours for dry worlds. */
export const L2_DRY: [number, THREE.Color][] = [
  [-150, c(0xe8f0f8)],  // deep-freeze near-white ice highland
  [ -40, c(0xa0a8b8)],  // cold grey-blue highland
  [  15, c(0x908070)],  // brown-grey plateau
  [ 120, c(0xc87840)],  // rust-brown mesa
  [ 400, c(0x6a1500)],  // dark volcanic highland
]

/**
 * Level 3 — peak / summit colours shared by both wet and dry palettes,
 * keyed by temperature (°C). The coldest entry produces pure white spires,
 * the hottest emits active-lava orange.
 */
export const L3: [number, THREE.Color][] = [
  [-150, c(0xffffff)],  // deep-freeze: pure white ice spires
  [ -40, c(0xd8ecf0)],  // snow-covered peaks
  [  15, c(0x9ab0a0)],  // grey stone peaks, light snow
  [ 120, c(0xe8d0a0)],  // pale sandstone / limestone
  [ 400, c(0xff4500)],  // active lava peaks (emissive)
]

// ── Height schedule (vary with temperature) ───────────────────────
// Deep-freeze (-150): dramatic crevasse relief — flat plains + tall spires.
// Sea tiles carve a shallow basin — ocean surface sits below shore rim.

/**
 * Vertical drop (world units) from the shore rim down to the ocean surface.
 * Small value so the ocean appears as a shallow basin, not a deep chasm.
 */
export const SEA_DEPTH = 0.03

/** Lowland elevation schedule keyed by temperature (°C). */
export const LOW_HEIGHT: [number, number][]  = [
  [-150, 0.025], [-40, 0.020], [15, 0.030], [120, 0.030], [400, 0.015],
]

/** Midland elevation schedule keyed by temperature (°C). */
export const MID_HEIGHT: [number, number][]  = [
  [-150, 0.120], [-40, 0.060], [15, 0.080], [120, 0.080], [400, 0.030],
]

/**
 * Peak elevation schedule keyed by temperature (°C). Deep-freeze values are
 * deliberately tall to produce crevasse-style relief on frozen worlds.
 */
export const PEAK_HEIGHT: [number, number][] = [
  [-150, 0.240], [-40, 0.100], [15, 0.140], [120, 0.110], [400, 0.050],
]

// ── Metallic palette color anchors ────────────────────────────────
// Temperature range: -150 / -40 / 15 / 120 / 400 °C

/**
 * Metallic — crater-floor colours (darkest band, ~2× darker than plains).
 * Keyed by surface temperature (°C).
 */
export const M_DEEP: [number, THREE.Color][] = [
  [-150, c(0x3a1a10)],  // dark frozen iron rust
  [ -40, c(0x242830)],  // dark cold gunmetal
  [  15, c(0x1e2228)],  // dark chrome shadow
  [ 120, c(0x2a1c08)],  // dark copper shadow
  [ 400, c(0x160400)],  // near-black molten base
]

/**
 * Metallic — plains colours. Primary surface tone, mid-dark; sets the
 * overall look of the planet. Keyed by temperature.
 */
export const M_PLAIN: [number, THREE.Color][] = [
  [-150, c(0x7a3820)],  // iron oxide warm brown
  [ -40, c(0x505860)],  // cold dark steel
  [  15, c(0x686e76)],  // steel grey  (reference ball mid-tone)
  [ 120, c(0x8a6030)],  // copper-bronze
  [ 400, c(0x903010)],  // hot dark iron
]

/**
 * Metallic — highland colours, noticeably lighter than plains. Provides a
 * clear visual step up from `M_PLAIN`.
 */
export const M_HIGH: [number, THREE.Color][] = [
  [-150, c(0xa85040)],  // rust highlight
  [ -40, c(0x7a8898)],  // steel blue-grey
  [  15, c(0x949ca8)],  // light steel  (reference ball mid-high)
  [ 120, c(0xc08840)],  // bright copper/gold
  [ 400, c(0xd85010)],  // bright hot orange
]

/**
 * Metallic — peak colours. Brightest band with strong specular response;
 * used for metallic summits (chrome, gold, molten).
 */
export const M_PEAK: [number, THREE.Color][] = [
  [-150, c(0xd07858)],  // pale rust peak
  [ -40, c(0xa8b4c0)],  // polished steel peak
  [  15, c(0xc4ccd4)],  // chrome / near-silver
  [ 120, c(0xe8c060)],  // bright gold peak
  [ 400, c(0xff6820)],  // molten peak
]

/**
 * Peak elevation schedule for metallic worlds, keyed by temperature.
 * Values are tuned to produce sharper relief than rocky bodies.
 */
export const M_PEAK_HEIGHT: [number, number][] = [
  [-150, 0.160], [-40, 0.130], [15, 0.120], [120, 0.100], [400, 0.060],
]

// ── Gas giant tile archetypes ─────────────────────────────────────

/**
 * Per-molecule gas-giant tile archetypes. Each entry is a 4-tuple of RGB
 * triples ordered from dark → mid-dark → mid-light → light. Blended in
 * proportion to the body's atmospheric composition by `buildGasPalette`.
 */
export const GAS_TILE_ARCH: Record<string, [number, number, number][]> = {
  H2He:   [[0xc0, 0x80, 0x40], [0xe8, 0xb8, 0x70], [0xf0, 0xd0, 0xa0], [0xd4, 0x95, 0x6a]],
  CH4:    [[0x0a, 0x1a, 0x28], [0x1a, 0x50, 0x70], [0x30, 0x90, 0xb8], [0x70, 0xc8, 0xe0]],
  NH3:    [[0x80, 0x68, 0x40], [0xc8, 0xa8, 0x50], [0xe8, 0xd8, 0x90], [0xf4, 0xf0, 0xd0]],
  H2O:    [[0x10, 0x30, 0x60], [0x28, 0x60, 0x90], [0x50, 0x90, 0xc0], [0x90, 0xc0, 0xd8]],
  sulfur: [[0x08, 0x04, 0x08], [0x1a, 0x10, 0x20], [0x38, 0x28, 0x38], [0x60, 0x48, 0x58]],
  hot:    [[0x1a, 0x02, 0x00], [0x8a, 0x1a, 0x00], [0xd4, 0x40, 0x10], [0xff, 0x70, 0x30]],
}
