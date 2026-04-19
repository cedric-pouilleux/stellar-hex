import * as THREE from 'three'
import { c } from './colorUtils'

// ── Temperature anchor definitions ───────────────────────────────
// 5 key temperatures (°C): -150 / -40 / 15 / 120 / 400

// Level 0 — deep ocean / base rock (tiles below sea level)
export const L0_WET: [number, THREE.Color][] = [
  [-150, c(0xd8ecfc)],  // deep-freeze flat ice — near-white blue
  [ -40, c(0x3870b0)],  // cold deep ocean — blue-grey
  [  15, c(0x2878d0)],  // Earth deep ocean — vivid blue
  [ 120, c(0x4a2810)],  // hot mudflats / dry seabed
  [ 400, c(0x100504)],  // dark basalt / cooling lava
]
export const L0_DRY: [number, THREE.Color][] = [
  [-150, c(0xc8d8e8)],  // deep-freeze pale ice plain
  [ -40, c(0x6070a0)],  // cold grey-blue rock
  [  15, c(0x686058)],  // neutral grey-brown rock
  [ 120, c(0x6b3a1a)],  // dry dark brown
  [ 400, c(0x1a0800)],  // dark volcanic basalt
]

// Level 0 — ice sheet (used when temperatureMax <= 0 — always frozen)
export const L0_ICE: [number, THREE.Color][] = [
  [-150, c(0xeaf4fc)],  // deep-freeze mirror ice (near white)
  [ -40, c(0xc0d4e8)],  // cold ice sheet
  [   0, c(0x90b0c0)],  // just-frozen grey-blue ice
]

// Level 0 — ammonia ocean (yellow-green murky liquid)
export const L0_AMMONIA: [number, THREE.Color][] = [
  [-110, c(0x8aa860)],  // frozen ammonia — pale olive
  [ -78, c(0x6a8838)],  // cold ammonia — deep olive
  [ -55, c(0x7a9840)],  // mid ammonia — yellow-green
  [ -33, c(0x90a848)],  // warm ammonia — bright olive
]

// Level 0 — methane ocean (amber-orange, Titan-like)
export const L0_METHANE: [number, THREE.Color][] = [
  [-210, c(0x604020)],  // frozen methane — dark brown
  [-183, c(0x6a4820)],  // cold methane — deep amber
  [-172, c(0x7a5828)],  // mid methane — warm amber
  [-161, c(0x8a6830)],  // liquid methane — rich amber
]

// Level 0 — nitrogen ocean (pale rose-transparent, Pluto-like)
export const L0_NITROGEN: [number, THREE.Color][] = [
  [-230, c(0xe0d8e0)],  // frozen nitrogen — near white
  [-210, c(0xd0c0c8)],  // cold nitrogen — pale rose
  [-203, c(0xc8b0b8)],  // mid nitrogen — dusty rose
  [-196, c(0xc0a0a8)],  // liquid nitrogen — muted rose
]

// Level SHORE — ammonia coast
export const L_SHORE_AMMONIA: [number, THREE.Color][] = [
  [-110, c(0xa0b878)],  // frozen shore — pale lime
  [ -78, c(0x88a858)],  // cold shore — olive
  [ -55, c(0x98b860)],  // mid shore — yellow-green
  [ -33, c(0xb0c870)],  // warm shore — bright lime
]

// Level SHORE — methane coast
export const L_SHORE_METHANE: [number, THREE.Color][] = [
  [-210, c(0x785830)],  // frozen shore — dark bronze
  [-183, c(0x886838)],  // cold shore — bronze
  [-172, c(0x987840)],  // mid shore — warm bronze
  [-161, c(0xa88848)],  // liquid shore — golden bronze
]

// Level SHORE — nitrogen coast
export const L_SHORE_NITROGEN: [number, THREE.Color][] = [
  [-230, c(0xe8e0e4)],  // frozen shore — near white
  [-210, c(0xd8c8d0)],  // cold shore — pale rose
  [-203, c(0xd0b8c0)],  // mid shore — dusty rose
  [-196, c(0xc8b0b8)],  // liquid shore — muted rose
]

// Level SHORE — shallow water / coast (band just above sea level)
export const L_SHORE_WET: [number, THREE.Color][] = [
  [-150, c(0xd4e8f0)],  // deep-freeze ice shore — pale white
  [ -40, c(0x6aa0b0)],  // cold pebble shore / pale teal
  [  15, c(0x4dc8a8)],  // tropical shallows — turquoise
  [ 120, c(0xc8a060)],  // hot mud / dry estuary
  [ 400, c(0x3a1808)],  // volcanic shore
]
export const L_SHORE_DRY: [number, THREE.Color][] = [
  [-150, c(0xbcccd8)],  // deep-freeze grey-white ice shore
  [ -40, c(0x707878)],  // grey pebbles
  [  15, c(0xc8a870)],  // sandy beach
  [ 120, c(0xb89050)],  // dry shore
  [ 400, c(0x2a0e06)],  // dark volcanic shore
]

// Level 1 — lowlands (coastal plains / flats)
export const L1_WET: [number, THREE.Color][] = [
  [-150, c(0xd4e4f0)],  // deep-freeze glacier plain — pale grey-white
  [ -40, c(0x7090a8)],  // cold grey-blue tundra with ice patches
  [  15, c(0x2d7a5a)],  // lush green lowlands
  [ 120, c(0xc89050)],  // warm savanna
  [ 400, c(0x5a1a08)],  // volcanic lowlands
]
export const L1_DRY: [number, THREE.Color][] = [
  [-150, c(0xd0dce8)],  // deep-freeze pale grey ice flat
  [ -40, c(0x8090a8)],  // cold grey-blue stone flat
  [  15, c(0x787060)],  // brown-grey rock plain
  [ 120, c(0xb8864e)],  // sandstone desert
  [ 400, c(0x401005)],  // dark lava rock
]

// Level 2 — midlands (hills, plateaux)
export const L2_WET: [number, THREE.Color][] = [
  [-150, c(0xe0eef8)],  // deep-freeze ice ridge — near white
  [ -40, c(0x90a8b8)],  // cold icy highland
  [  15, c(0x3a8a52)],  // forest / highland green
  [ 120, c(0xd4956a)],  // arid plateau
  [ 400, c(0x8b2200)],  // dark red volcanic
]
export const L2_DRY: [number, THREE.Color][] = [
  [-150, c(0xe8f0f8)],  // deep-freeze near-white ice highland
  [ -40, c(0xa0a8b8)],  // cold grey-blue highland
  [  15, c(0x908070)],  // brown-grey plateau
  [ 120, c(0xc87840)],  // rust-brown mesa
  [ 400, c(0x6a1500)],  // dark volcanic highland
]

// Level 3 — peaks
export const L3: [number, THREE.Color][] = [
  [-150, c(0xffffff)],  // deep-freeze: pure white ice spires
  [ -40, c(0xd8ecf0)],  // snow-covered peaks
  [  15, c(0x9ab0a0)],  // grey stone peaks, light snow
  [ 120, c(0xe8d0a0)],  // pale sandstone / limestone
  [ 400, c(0xff4500)],  // active lava peaks (emissive)
]

// ── Height schedule (vary with temperature) ───────────────────────
// Deep-freeze (-150): dramatic crevasse relief — flat plains + tall spires
// Sea tiles carve a shallow basin — ocean surface sits below shore rim.
export const SEA_DEPTH = 0.03
export const LOW_HEIGHT: [number, number][]  = [
  [-150, 0.025], [-40, 0.020], [15, 0.030], [120, 0.030], [400, 0.015],
]
export const MID_HEIGHT: [number, number][]  = [
  [-150, 0.120], [-40, 0.060], [15, 0.080], [120, 0.080], [400, 0.030],
]
export const PEAK_HEIGHT: [number, number][] = [
  [-150, 0.240], [-40, 0.100], [15, 0.140], [120, 0.110], [400, 0.050],
]

// ── Metallic palette color anchors ────────────────────────────────
// Temperature range: -150 / -40 / 15 / 120 / 400 °C

// Crater floors — darkest band, roughly 2× darker than plains
export const M_DEEP: [number, THREE.Color][] = [
  [-150, c(0x3a1a10)],  // dark frozen iron rust
  [ -40, c(0x242830)],  // dark cold gunmetal
  [  15, c(0x1e2228)],  // dark chrome shadow
  [ 120, c(0x2a1c08)],  // dark copper shadow
  [ 400, c(0x160400)],  // near-black molten base
]

// Plains — primary surface; mid-dark, sets the overall planet tone
export const M_PLAIN: [number, THREE.Color][] = [
  [-150, c(0x7a3820)],  // iron oxide warm brown
  [ -40, c(0x505860)],  // cold dark steel
  [  15, c(0x686e76)],  // steel grey  (reference ball mid-tone)
  [ 120, c(0x8a6030)],  // copper-bronze
  [ 400, c(0x903010)],  // hot dark iron
]

// Highlands — noticeably lighter than plains, clear step up
export const M_HIGH: [number, THREE.Color][] = [
  [-150, c(0xa85040)],  // rust highlight
  [ -40, c(0x7a8898)],  // steel blue-grey
  [  15, c(0x949ca8)],  // light steel  (reference ball mid-high)
  [ 120, c(0xc08840)],  // bright copper/gold
  [ 400, c(0xd85010)],  // bright hot orange
]

// Peaks — brightest band, strong specular response
export const M_PEAK: [number, THREE.Color][] = [
  [-150, c(0xd07858)],  // pale rust peak
  [ -40, c(0xa8b4c0)],  // polished steel peak
  [  15, c(0xc4ccd4)],  // chrome / near-silver
  [ 120, c(0xe8c060)],  // bright gold peak
  [ 400, c(0xff6820)],  // molten peak
]

// Height schedule for metallic worlds — sharper relief than rocky
export const M_PEAK_HEIGHT: [number, number][] = [
  [-150, 0.160], [-40, 0.130], [15, 0.120], [120, 0.100], [400, 0.060],
]

// ── Gas giant tile archetypes ─────────────────────────────────────
// Archetype [dark, mid-dark, mid-light, light] RGB per atmospheric molecule.
export const GAS_TILE_ARCH: Record<string, [number, number, number][]> = {
  H2He:   [[0xc0, 0x80, 0x40], [0xe8, 0xb8, 0x70], [0xf0, 0xd0, 0xa0], [0xd4, 0x95, 0x6a]],
  CH4:    [[0x0a, 0x1a, 0x28], [0x1a, 0x50, 0x70], [0x30, 0x90, 0xb8], [0x70, 0xc8, 0xe0]],
  NH3:    [[0x80, 0x68, 0x40], [0xc8, 0xa8, 0x50], [0xe8, 0xd8, 0x90], [0xf4, 0xf0, 0xd0]],
  H2O:    [[0x10, 0x30, 0x60], [0x28, 0x60, 0x90], [0x50, 0x90, 0xc0], [0x90, 0xc0, 0xd8]],
  sulfur: [[0x08, 0x04, 0x08], [0x1a, 0x10, 0x20], [0x38, 0x28, 0x38], [0x60, 0x48, 0x58]],
  hot:    [[0x1a, 0x02, 0x00], [0x8a, 0x1a, 0x00], [0xd4, 0x40, 0x10], [0xff, 0x70, 0x30]],
}
