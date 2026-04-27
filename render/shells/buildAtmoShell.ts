/**
 * Procedural atmosphere shell — translucent BackSide corona halo
 * mounted just outside the planet's silhouette on rocky / metallic
 * bodies.
 *
 * The fragment shader carries an FBm-noise + latitude-band pattern AND
 * reads a per-vertex colour attribute that the caller projects from
 * the playable atmo grid via {@link AtmoShellHandle.paintFromTiles},
 * so painted hex tiles re-emerge as smooth-shaded patches on the
 * shell. Gas giants don't use this shell — their smooth sphere already
 * carries the atmospheric look.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BodyConfig } from '../../types/body.types'
import type { Tile } from '../../geometry/hexasphere.types'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'

/**
 * Neutral default tint when the caller doesn't push one. Pale sky-blue —
 * reads as "atmospheric" without committing to a thermal class. Callers
 * that want a climate-driven hue derive it caller-side and pass it via
 * {@link AtmoShellConfig.tint}.
 */
const DEFAULT_ATMO_TINT = '#aaccff'

/** Per-tile RGB triple consumed by {@link AtmoShellHandle.paintFromTiles}. */
export interface AtmoShellRGB {
  r: number
  g: number
  b: number
}

/**
 * Tunable scalar parameters consumed by the atmo shell's procedural
 * fragment shader. Every field is optional; omitted fields keep their
 * current value when passed through {@link AtmoShellHandle.setParams}.
 */
export interface AtmoShellParams {
  /** Overall opacity in `[0, 1]`. */
  opacity?:     number
  /**
   * Strength of multi-scale turbulence — domain-warping FBm distortion
   * applied to the latitude bands. `0` keeps the bands purely
   * latitudinal; `1` shreds them into roiling cells. Defaults to `0.6`.
   */
  turbulence?:  number
  /**
   * Mix factor between latitude bands and free-form turbulence in `[0, 1]`.
   * `1` = pure horizontal bands (gas-giant classic); `0` = pure swirling
   * cells (volcanic / nebula look). Defaults to `0.55`.
   */
  bandiness?:   number
  /**
   * Latitudinal band frequency — `5` = ~5 belts north-to-south. Higher
   * values pack tighter bands. Defaults to `5`.
   */
  bandFreq?:    number
  /**
   * Animation speed multiplier for the drift / turbulence advection.
   * `0` freezes the shell; `2` doubles the rate. Defaults to `1`.
   */
  driftSpeed?:  number
  /**
   * Storm-spot intensity in `[0, 1]` — sprinkles a few rotating
   * Jupiter-style storm cells. `0` disables them. Defaults to `0.25`.
   */
  storms?:      number
  /**
   * High-altitude cloud cover in `[0, 1]`. The cloud layer rides on the
   * atmo shell (formerly painted on the rocky surface itself), so the
   * playable sol stays clean while the cloud cover modulates the
   * atmosphere. `0` disables clouds. Defaults to `0`.
   */
  cloudAmount?: number
  /** Cloud tint, hex string. Defaults to `'#e8eaf0'` (cool overcast white). */
  cloudColor?:  string
  /** Cloud-noise scale (≥ 0.1). Higher = more, smaller clouds. Defaults to `1.2`. */
  cloudScale?:  number
  /**
   * Per-tile colour mix in `[0, 1]` — strength of the painted-tile
   * colour over the body-level tint. `0` keeps the procedural tint
   * pure; `1` lets painted resources fully replace it. Defaults to
   * `0.85`.
   */
  tileColorMix?: number
}

/** Handle returned by {@link buildAtmoShell}. */
export interface AtmoShellHandle {
  mesh:    THREE.Mesh
  /** Advances the procedural drift animation. */
  tick:    (elapsed: number) => void
  /** Live-update the shell opacity in `[0, 1]` (no rebuild). */
  setOpacity: (value: number) => void
  /** Toggles visibility without rebuilding. */
  setVisible: (value: boolean) => void
  /** Live-tune the procedural shader params. Unspecified fields keep their value. */
  setParams: (params: AtmoShellParams) => void
  /** Updates `uLightDir` so the day/night terminator tracks the scene's sun. */
  setLight: (direction: THREE.Vector3) => void
  /** `true` flattens diffuse to uniform brightness (Sol-view dome look). */
  setFlatLighting: (enabled: boolean) => void
  /**
   * Stamps per-tile RGB into the shell's vertex colour buffer using a
   * nearest-tile lookup on the unit sphere. Vertices closest to a painted
   * tile receive its colour; vertices closest to an unpainted tile keep
   * their `(0, 0, 0)` default (the shader falls back to the procedural
   * tint there). Idempotent — subsequent calls overwrite the last paint.
   *
   * No-op when the shell was built without `tiles` (static decorative
   * shell — no gameplay link).
   */
  paintFromTiles: (colors: Map<number, AtmoShellRGB>) => void
  /** Disposes geometry + material. Idempotent. */
  dispose: () => void
}

/** Configuration accepted by {@link buildAtmoShell}. */
export interface AtmoShellConfig {
  config:  BodyConfig
  /** World radius the shell sits at — typically `config.radius`. */
  radius:  number
  /** Initial alpha in `[0, 1]`. */
  opacity: number
  /**
   * Optional override for the body-relative tint (hex string). When
   * omitted, falls back to a neutral pale-blue default. Callers that
   * want a climate-driven hue derive it caller-side and pass it here.
   */
  tint?:   string
  /**
   * Body's hexasphere tiles — when provided, enables the `paintFromTiles`
   * bridge that projects per-tile gas colours from the playable atmo
   * grid onto the shell. Omit for a purely procedural shell with no
   * gameplay link.
   */
  tiles?:  readonly Tile[]
  /**
   * Initial procedural params. Defaults are tuned for a generic temperate
   * atmosphere; gas-giant callers typically push `bandiness` and
   * `bandFreq` higher, while rocky callers push `turbulence` higher and
   * `bandiness` lower so the halo reads as soft cells rather than hard
   * belts.
   */
  params?: AtmoShellParams
  /** Optional render-quality bag — bumps the icosphere detail in `'high'`. */
  quality?: RenderQuality
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 color;
  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying vec3  vObjectDir;
  varying vec3  vTileColor;

  void main() {
    vec4 wp      = modelMatrix * vec4(position, 1.0);
    vWorldPos    = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vObjectDir   = normalize(position);
    vTileColor   = color;
    gl_Position  = projectionMatrix * viewMatrix * wp;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uTint;
  uniform vec3  uLightDir;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uBandiness;
  uniform float uBandFreq;
  uniform float uDriftSpeed;
  uniform float uStorms;
  uniform float uCloudAmount;
  uniform vec3  uCloudColor;
  uniform float uCloudScale;
  uniform float uTileColorMix;
  uniform float uFlatLighting;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vObjectDir;
  varying vec3 vTileColor;

  // 3D hash + value-noise — cheap, deterministic, wraps trig.
  float _hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  float _vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = _hash(i + vec3(0,0,0));
    float n100 = _hash(i + vec3(1,0,0));
    float n010 = _hash(i + vec3(0,1,0));
    float n110 = _hash(i + vec3(1,1,0));
    float n001 = _hash(i + vec3(0,0,1));
    float n101 = _hash(i + vec3(1,0,1));
    float n011 = _hash(i + vec3(0,1,1));
    float n111 = _hash(i + vec3(1,1,1));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }
  // FBm — five octaves give finer roiling without pricing the fragment
  // shader out of frame budget at typical viewport sizes.
  float _fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * _vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return s;
  }

  // Domain-warped FBm — feeds an FBm gradient back into the sample point,
  // producing the roiling-fluid look you get on gas giants and storm-rich
  // atmospheres. \`strength\` scales the warp; 0 collapses back to plain FBm.
  float _warpedFbm(vec3 p, float strength) {
    vec3 w = vec3(
      _fbm(p + vec3(0.7, 1.3, 2.1)),
      _fbm(p + vec3(5.2, 1.3, 2.8)),
      _fbm(p + vec3(2.4, 4.7, 1.1))
    );
    return _fbm(p + (w - 0.5) * 2.0 * strength);
  }

  // Storm-cell field — three rotating "spots" advected by uTime. Returns
  // 0 outside cells, peaks at ~1 inside. uStorms gates the contribution.
  float _stormField(vec3 dir, float t) {
    if (uStorms < 0.001) return 0.0;
    vec3 c0 = normalize(vec3(sin(t * 0.04 + 0.0), 0.35, cos(t * 0.04 + 0.0)));
    vec3 c1 = normalize(vec3(sin(t * 0.03 + 2.7), -0.20, cos(t * 0.03 + 2.7)));
    vec3 c2 = normalize(vec3(sin(t * 0.05 + 4.9),  0.55, cos(t * 0.05 + 4.9)));
    float s = 0.0;
    s += smoothstep(0.92, 1.0, dot(dir, c0)) * 1.0;
    s += smoothstep(0.94, 1.0, dot(dir, c1)) * 0.7;
    s += smoothstep(0.95, 1.0, dot(dir, c2)) * 0.5;
    return s * uStorms;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    // BackSide rendering — flip toward the viewer. Use gl_FrontFacing
    // (not a dot test) so silhouette fragments with marginally
    // negative interpolated dot values don't get mis-flipped on
    // FrontSide rendering, which would leak band tint onto the dark
    // hemisphere's limb.
    if (!gl_FrontFacing) N = -N;

    // Drifting object-space sample point. Speed is uniform-driven so a
    // playground slider can freeze / accelerate the animation live.
    float t = uTime * uDriftSpeed;
    vec3  q = vObjectDir * 2.4 + vec3(t * 0.04, t * 0.02, 0.0);

    // Multi-scale warped FBm — macro features (cloud masses) on top of
    // mid-scale turbulence and a fine-grain layer that catches the eye
    // when the camera zooms in. \`uTurbulence\` scales the domain warp.
    float macro = _warpedFbm(q * 0.6, uTurbulence);
    float meso  = _fbm(q * 1.6 + vec3(0.0, t * 0.05, 0.0));
    float micro = _fbm(q * 4.5 + vec3(t * 0.08, 0.0, 0.0));
    float turb  = clamp(macro * 0.6 + meso * 0.3 + micro * 0.1, 0.0, 1.0);

    // Adaptive latitude bands — the FBm offset gives the belts a wavy,
    // organic edge instead of mathematical sine perfection.
    float lat       = vObjectDir.y;
    float bandPhase = lat * uBandFreq + (macro - 0.5) * 1.8;
    float bands     = sin(bandPhase) * 0.5 + 0.5;
    // Slight asymmetry per band — alternating belts read darker / lighter.
    bands = mix(bands, bands * 0.65 + 0.18, 0.35 + 0.30 * sin(lat * uBandFreq * 0.5));

    // Combine turbulence and bands with the configured ratio. Storm cells
    // punch through any blend.
    float density = mix(turb, bands, clamp(uBandiness, 0.0, 1.0));
    density       = clamp(density + _stormField(vObjectDir, t) * 0.6, 0.0, 1.0);

    // Per-tile painted colour blended over the body-level tint. The
    // mask uses a smoothstep ramp instead of a hard step so adjacent
    // tiles with different paint values fade into each other rather
    // than producing visible polygon boundaries on the icosphere — the
    // procedural FBm pattern then breaks up any residual hex shape.
    float tileEnergy  = max(max(vTileColor.r, vTileColor.g), vTileColor.b);
    float tileMask    = smoothstep(0.005, 0.15, tileEnergy);
    vec3  baseTint    = mix(uTint, vTileColor, tileMask * uTileColorMix);
    float colorEnergy = (vTileColor.r + vTileColor.g + vTileColor.b) / 3.0;
    density           = mix(density, max(density, 0.5 + colorEnergy * 0.5), tileMask);

    // Bands also tint the base — alternating belts pick up a slightly
    // tinted shade so the silhouette breaks out of mono-tint flatness.
    vec3 bandTint = mix(baseTint * 0.85, baseTint * 1.15, bands);

    // ── High-altitude clouds ──────────────────────────────────────
    // Lives on the atmospheric shell instead of the body's surface
    // shader — keeps the playable sol clean while the cloud cover
    // animates on the atmosphere layer that wraps it. Driven by
    // uCloudAmount (slider) so the user can dial coverage live.
    float cloudWeight = 0.0;
    if (uCloudAmount > 0.001) {
      vec3 cp = vObjectDir * max(0.1, uCloudScale) * 1.4 + vec3(t * 0.05, t * 0.02, 0.0);
      vec3 cq = vec3(
        _fbm(cp + vec3(0.7, 1.3, 2.1)),
        _fbm(cp + vec3(5.2, 1.3, 2.8)),
        _fbm(cp + vec3(2.4, 4.7, 1.1))
      ) * 2.0 - 1.0;
      float cloudNoise = _fbm(cp * 1.5 + cq * 1.8 + vec3(t * 0.07, 0.0, 0.0));
      // Smoothstep gives feathered cloud edges; pow tightens the mask.
      cloudWeight = pow(smoothstep(0.45, 0.65, cloudNoise), 1.3) * uCloudAmount;
    }
    vec3 withClouds = mix(bandTint, uCloudColor, cloudWeight);

    // Rim falloff — atmo reads thicker at the silhouette than at the
    // sub-camera point.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.6);

    // Lambertian shading. Color carries a tiny ambient floor so the
    // shaded face stays barely visible; alpha gates HARDER (no floor)
    // via smoothstep on the raw cosine, so the dark hemisphere fades
    // to fully transparent at the silhouette and no thin warm line
    // forms at the limb. uFlatLighting=1 (Sol view dome) collapses
    // both to uniform 1.
    float ndl       = max(dot(N, normalize(uLightDir)), 0.0);
    float colorDiff = mix(0.05 + 0.95 * ndl, 1.0, uFlatLighting);
    float alphaGate = mix(smoothstep(0.0, 0.15, ndl), 1.0, uFlatLighting);

    float baseAlpha = mix(0.55, 1.0, fres) * (0.40 + 0.60 * density);
    float alpha     = uOpacity * max(baseAlpha, cloudWeight * 0.85) * alphaGate;
    if (alpha <= 0.001) discard;

    gl_FragColor = vec4(withClouds * colorDiff, alpha);
  }
`

/** Clamps `value` to `[0, 1]`. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// ── Nearest-tile lookup ──────────────────────────────────────────────────

const GRID_AZI = 18 // 360° / 18 = 20° per cell
const GRID_POL = 9  // 180° / 9  = 20° per cell

function tileAziCell(nz: number, nx: number): number {
  return Math.floor(((Math.atan2(nz, nx) / (2 * Math.PI)) + 0.5) * GRID_AZI) % GRID_AZI
}
function tilePolCell(ny: number): number {
  return Math.min(GRID_POL - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI) * GRID_POL))
}

/**
 * Builds a `(x, y, z) → tileId` lookup using a spherical azimuth × polar
 * grid for O(k) queries. Identical algorithm to `buildSmoothSphereMesh`'s
 * private helper — kept duplicated here to avoid coupling the smooth-sphere
 * orchestrator to the atmo-shell module.
 */
function buildNearestTileIdFn(tiles: readonly Tile[]): (x: number, y: number, z: number) => number {
  const count = tiles.length
  const nxArr = new Float32Array(count)
  const nyArr = new Float32Array(count)
  const nzArr = new Float32Array(count)
  const idArr = new Int32Array(count)
  const cells: number[][] = Array.from({ length: GRID_AZI * GRID_POL }, () => [])

  tiles.forEach((tile, i) => {
    const { x, y, z } = tile.centerPoint
    const len = Math.sqrt(x * x + y * y + z * z)
    nxArr[i] = x / len
    nyArr[i] = y / len
    nzArr[i] = z / len
    idArr[i] = tile.id
    cells[tilePolCell(nyArr[i]) * GRID_AZI + tileAziCell(nzArr[i], nxArr[i])].push(i)
  })

  return (x, y, z) => {
    const len = Math.sqrt(x * x + y * y + z * z)
    const qnx = x / len, qny = y / len, qnz = z / len
    const qAzi = tileAziCell(qnz, qnx)
    const qPol = tilePolCell(qny)

    let bestDot = -Infinity
    let bestIdx = 0

    for (let dp = -1; dp <= 1; dp++) {
      const p = qPol + dp
      if (p < 0 || p >= GRID_POL) continue
      const isPolar  = p === 0 || p === GRID_POL - 1
      const aziCount = isPolar ? GRID_AZI : 3
      const aziStart = isPolar ? 0 : qAzi - 1
      for (let da = 0; da < aziCount; da++) {
        const a = ((aziStart + da) + GRID_AZI) % GRID_AZI
        for (const i of cells[p * GRID_AZI + a]) {
          const dot = qnx * nxArr[i] + qny * nyArr[i] + qnz * nzArr[i]
          if (dot > bestDot) { bestDot = dot; bestIdx = i }
        }
      }
    }
    return idArr[bestIdx]
  }
}

/**
 * Builds the procedural atmosphere shell.
 */
export function buildAtmoShell(input: AtmoShellConfig): AtmoShellHandle {
  const { config, radius, opacity, tiles, params: initParams } = input
  const tintHex = input.tint ?? DEFAULT_ATMO_TINT
  const tint = new THREE.Color(tintHex)

  // Defaults — generic temperate-atmosphere look. Callers tune via
  // `setParams` (or pass `params` at build) to push toward gas-giant
  // belts, rocky halo cells, etc.
  const turbulence = clamp01(initParams?.turbulence ?? 0.6)
  const bandiness  = clamp01(initParams?.bandiness  ?? 0.55)
  const bandFreq   = Math.max(0.5, initParams?.bandFreq ?? 5.0)
  const driftSpeed = Math.max(0,   initParams?.driftSpeed ?? 1.0)
  const storms     = clamp01(initParams?.storms ?? 0.25)
  const cloudAmount  = clamp01(initParams?.cloudAmount ?? 0)
  const cloudColor   = new THREE.Color(initParams?.cloudColor ?? '#e8eaf0')
  const cloudScale   = Math.max(0.1, initParams?.cloudScale ?? 1.2)
  const tileColorMix = clamp01(initParams?.tileColorMix ?? 0.85)

  // Icosahedron at detail 5 (~2562 shared vertices after mergeVertices)
  // — detail 4 left the day/night terminator visibly polygonal in
  // Shader view. `computeVertexNormals` is required to replace the
  // flat-shaded face normals with per-vertex averages so the fresnel
  // rim doesn't read as triangle edges at the silhouette.
  const detail   = resolveSphereDetail(5, input.quality)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(radius, detail))
  geometry.computeVertexNormals()
  const pos      = geometry.getAttribute('position') as THREE.BufferAttribute

  // Per-vertex colour buffer — initially (0, 0, 0). The shader falls back
  // to the uniform tint until `paintFromTiles` projects a per-tile colour
  // mapping onto the shell.
  const colorAttr = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3)
  geometry.setAttribute('color', colorAttr)
  const colorBuf = colorAttr.array as Float32Array

  // Pre-compute the tile-id of each vertex once at build time. Painting
  // afterwards is a flat lookup loop — no per-paint nearest-search cost.
  let vertexTileIds: Int32Array | null = null
  if (tiles && tiles.length > 0) {
    const lookup = buildNearestTileIdFn(tiles)
    vertexTileIds = new Int32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      vertexTileIds[i] = lookup(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
  }

  const uniforms: Record<string, THREE.IUniform> = {
    uTint:        { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
    uLightDir:    { value: new THREE.Vector3(1, 0.5, 1).normalize() },
    uOpacity:     { value: Math.max(0, Math.min(1, opacity)) },
    uTime:        { value: 0 },
    uTurbulence:  { value: turbulence },
    uBandiness:   { value: bandiness },
    uBandFreq:    { value: bandFreq },
    uDriftSpeed:  { value: driftSpeed },
    uStorms:      { value: storms },
    uCloudAmount:  { value: cloudAmount },
    uCloudColor:   { value: new THREE.Vector3(cloudColor.r, cloudColor.g, cloudColor.b) },
    uCloudScale:   { value: cloudScale },
    uTileColorMix: { value: tileColorMix },
    uFlatLighting: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent:    true,
    depthWrite:     false,
    // BackSide — far-face fragments sit at depth `D + R`, so anything
    // opaque the body draws inside (hex prisms, smooth sphere, liquid)
    // wins the depth test. The shell is then visible only in the corona
    // ring just outside the planet's silhouette.
    side:           THREE.BackSide,
    blending:       THREE.NormalBlending,
  })
  material.visible = uniforms.uOpacity.value > 0

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder   = 1

  function paintFromTiles(colors: Map<number, AtmoShellRGB>): void {
    if (!vertexTileIds || colors.size === 0) return
    for (let i = 0; i < vertexTileIds.length; i++) {
      const rgb = colors.get(vertexTileIds[i])
      if (!rgb) {
        // Vertex closest to an unpainted tile — clear so it falls back to
        // the uniform tint instead of carrying a stale paint from a
        // previous distribution.
        colorBuf[i * 3]     = 0
        colorBuf[i * 3 + 1] = 0
        colorBuf[i * 3 + 2] = 0
        continue
      }
      colorBuf[i * 3]     = rgb.r
      colorBuf[i * 3 + 1] = rgb.g
      colorBuf[i * 3 + 2] = rgb.b
    }
    colorAttr.needsUpdate = true
  }

  return {
    mesh,
    tick(elapsed) { uniforms.uTime.value = elapsed },
    setOpacity(value) {
      const v = clamp01(value)
      uniforms.uOpacity.value = v
      material.visible        = v > 0
    },
    setVisible(value) { mesh.visible = value },
    setParams(p) {
      if (p.opacity    !== undefined) {
        const v = clamp01(p.opacity)
        uniforms.uOpacity.value = v
        material.visible        = v > 0
      }
      if (p.turbulence !== undefined) uniforms.uTurbulence.value = clamp01(p.turbulence)
      if (p.bandiness  !== undefined) uniforms.uBandiness.value  = clamp01(p.bandiness)
      if (p.bandFreq   !== undefined) uniforms.uBandFreq.value   = Math.max(0.5, p.bandFreq)
      if (p.driftSpeed !== undefined) uniforms.uDriftSpeed.value = Math.max(0, p.driftSpeed)
      if (p.storms     !== undefined) uniforms.uStorms.value     = clamp01(p.storms)
      if (p.cloudAmount !== undefined) uniforms.uCloudAmount.value = clamp01(p.cloudAmount)
      if (p.cloudScale  !== undefined) uniforms.uCloudScale.value  = Math.max(0.1, p.cloudScale)
      if (p.cloudColor  !== undefined) {
        const cc = new THREE.Color(p.cloudColor)
        ;(uniforms.uCloudColor.value as THREE.Vector3).set(cc.r, cc.g, cc.b)
      }
      if (p.tileColorMix !== undefined) uniforms.uTileColorMix.value = clamp01(p.tileColorMix)
    },
    setLight(direction) {
      ;(uniforms.uLightDir.value as THREE.Vector3).copy(direction).normalize()
    },
    setFlatLighting(enabled) {
      uniforms.uFlatLighting.value = enabled ? 1 : 0
    },
    paintFromTiles,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
