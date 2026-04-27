/**
 * Tiny hex / int colour conversions shared by every UI control that binds a
 * `0xRRGGBB` integer (the catalogue / paint registry storage shape) to an
 * `<input type="color">` `#rrggbb` string. Centralised here so the same
 * rounding + clamping rule applies everywhere.
 */

/** `0xRRGGBB` → `#rrggbb` for the native colour picker. */
export function hexFromInt(value: number): string {
  return '#' + (value & 0xffffff).toString(16).padStart(6, '0')
}

/** `#rrggbb` (with or without `#`) → `0xRRGGBB`. */
export function intFromHex(value: string): number {
  return parseInt(value.replace('#', ''), 16)
}

/** `(r, g, b)` byte triple → `#rrggbb`, with each channel clamped to `[0, 255]`. */
export function hexFromRgb(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}
