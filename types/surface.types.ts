/**
 * Body taxonomy — pure body domain, no game or resource vocabulary.
 *
 * Two top-level kinds:
 *   - `'planetary'` — every body that can host a hex sol (rocky, gas-like,
 *                     metallic, ice…). The visual archetype is selected by
 *                     {@link SurfaceLook}.
 *   - `'star'`     — emissive body, dedicated mesh pipeline (no atmo shell,
 *                     no liquid surface, no layered sol).
 *
 * Adding a future kind (`'blackhole'`, `'nebula'`, …) means a new pipeline
 * branch in `useBody`. Adding a visual archetype on a planetary body is just
 * a new `SurfaceLook` value — no new mesh pipeline needed.
 */
export type BodyType = 'planetary' | 'star'

/**
 * Visual archetype for planetary bodies — drives the shader family + palette
 * generator + atmosphere defaults. Independent from the body's physical type
 * (a planet can read as `'metallic'` regardless of its mass / composition;
 * the caller picks the look that matches its game state).
 *
 *   - `'terrain'`  : rocky-like — low/high colour ramp, translucent atmo halo
 *                    by default. Suits Earth-like, lunar, lava worlds, etc.
 *   - `'bands'`    : gas-like — 4-stop band palette, opaque atmo by default
 *                    (smooth sphere acts as the atmospheric silhouette).
 *   - `'metallic'` : 4-band metallic palette with a metalness sheen, no
 *                    atmo halo by default.
 *
 * Defaults to `'terrain'` when omitted on a planetary {@link BodyConfig}.
 * Stars ignore this field (their pipeline is fixed).
 */
export type SurfaceLook = 'terrain' | 'bands' | 'metallic'
