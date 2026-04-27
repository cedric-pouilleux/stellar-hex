/**
 * Framework-agnostic planet ring builder.
 *
 * Creates a carrier `Group` + ring `Mesh` pair. The carrier is what the caller
 * attaches to the planet's group; attaching the carrier (not the mesh) lets the
 * ring inherit the planet's tilt, spin and user drag while the ring's own spin
 * is applied at the mesh level around the carrier's local +Y. See the original
 * `BodyRings.vue` header for the full hierarchy rationale.
 *
 * Pure Three.js — no Vue, TresJS, or `onBeforeRender` coupling.
 */

import * as THREE from 'three'
import type { RingVariation } from './ringVariation'
import { findSceneRoot, findDominantLightWorldPos } from '../lighting/findDominantLight'

const VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec2 vLocalXY;

  void main() {
    vLocalXY    = position.xy;
    vec4 wp     = modelMatrix * vec4(position, 1.0);
    vWorldPos   = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAG = /* glsl */`
  uniform float uInnerR;
  uniform float uOuterR;
  uniform vec4  uProfileA;
  uniform vec4  uProfileB;
  uniform float uBandFreq;
  uniform float uBandContrast;
  uniform float uDustiness;
  uniform float uGrainAmount;
  uniform float uGrainFreq;
  uniform float uOpacity;
  uniform float uLobeStrength;
  uniform float uKeplerShear;
  uniform float uRotationPhase;
  uniform float uNoiseSeed;
  uniform vec3  uColorInner;
  uniform vec3  uColorOuter;
  uniform vec3  uPlanetWorldPos;
  uniform float uPlanetRadius;
  uniform vec3  uSunWorldPos;

  varying vec3 vWorldPos;
  varying vec2 vLocalXY;

  float sampleProfile(float t) {
    float x = clamp(t, 0.0, 1.0) * 7.0;
    float i = floor(x);
    float f = x - i;
    float sA, sB;
    if      (i < 1.0) { sA = uProfileA.x; sB = uProfileA.y; }
    else if (i < 2.0) { sA = uProfileA.y; sB = uProfileA.z; }
    else if (i < 3.0) { sA = uProfileA.z; sB = uProfileA.w; }
    else if (i < 4.0) { sA = uProfileA.w; sB = uProfileB.x; }
    else if (i < 5.0) { sA = uProfileB.x; sB = uProfileB.y; }
    else if (i < 6.0) { sA = uProfileB.y; sB = uProfileB.z; }
    else              { sA = uProfileB.z; sB = uProfileB.w; }
    return mix(sA, sB, f);
  }

  float hash1(float x) {
    return fract(sin(x * 12.9898 + uNoiseSeed * 0.1731) * 43758.5453);
  }
  float vnoise1(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), f);
  }
  float fbm1(float x) {
    float v = 0.0;
    float a = 0.5;
    float w = 1.0;
    for (int k = 0; k < 4; k++) {
      v += a * vnoise1(x * w);
      w *= 2.17;
      a *= 0.5;
    }
    return v;
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233)) + uNoiseSeed * 0.2731) * 43758.5453);
  }
  float vnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    float r = length(vLocalXY);
    if (r < uInnerR || r > uOuterR) discard;
    float t = (r - uInnerR) / max(uOuterR - uInnerR, 1e-4);

    float edge = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
    float macro = sampleProfile(t);

    float micro = fbm1(t * uBandFreq);
    micro = mix(0.5, micro, uBandContrast);

    // Keplerian shear — outer bands lag behind inner as rotation accumulates.
    // factor(r) = 1 - (r_inner/r)^1.5 is 0 at the inner edge and grows toward
    // the outer edge. Multiplied by the accumulated rotation phase and the
    // shear strength, it adds an in-shader azimuthal offset on top of the
    // mesh mono-block spin so shear=0 keeps the pattern locked to the mesh.
    float rN       = max(r, uInnerR);
    float keplerF  = 1.0 - pow(uInnerR / rN, 1.5);
    float shearPhi = uKeplerShear * keplerF * uRotationPhase;
    float theta    = atan(vLocalXY.y, vLocalXY.x) + shearPhi;

    float phi = theta + t * 1.4 + uNoiseSeed * 0.01;
    float lobes = 0.45 * cos(2.0 * phi)
                + 0.30 * cos(3.0 * phi + 1.3)
                + 0.18 * cos(5.0 * phi + 2.9)
                + 0.12 * cos(7.0 * phi + 4.1);
    float lobesMod = 1.0 + uLobeStrength * lobes;

    vec2  grainP = vec2(t * uGrainFreq, theta * (uGrainFreq * 0.11));
    float grain  = vnoise2(grainP);
    grain        = 0.65 * grain + 0.35 * vnoise2(grainP * 2.17 + vec2(5.3, 1.7));
    float grainMod = mix(1.0, 0.35 + 1.30 * grain, uGrainAmount);

    float density = macro * (0.55 + 0.45 * micro);
    density = mix(density, macro * 0.6, uDustiness);
    density *= lobesMod * grainMod;
    density *= edge;

    float alpha = density * uOpacity;
    if (alpha < 0.01) discard;

    vec3 color = mix(uColorInner, uColorOuter, t);
    color *= mix(0.92, 1.08, grain);

    vec3  sunToFrag = vWorldPos - uSunWorldPos;
    float fragDist  = length(sunToFrag);
    vec3  rayDir    = sunToFrag / max(fragDist, 1e-4);
    vec3  sunToPlan = uPlanetWorldPos - uSunWorldPos;
    float tCA       = dot(sunToPlan, rayDir);
    float shadow    = 0.0;
    if (tCA > 0.0 && tCA < fragDist) {
      float d  = length(sunToPlan - tCA * rayDir);
      // Penumbra widens with the fragment's distance behind the planet along
      // the sun ray — points far from the occluder see a more diffuse edge
      // (geometric umbra/penumbra divergence with a finite-size light source).
      float distBehind = fragDist - tCA;
      float penK       = clamp(distBehind / uPlanetRadius * 0.045, 0.03, 0.22);
      shadow = 1.0 - smoothstep(uPlanetRadius * (1.0 - penK), uPlanetRadius * (1.0 + penK * 1.25), d);
    }
    color *= mix(1.0, 0.15, shadow);

    vec3  viewDir = normalize(vWorldPos - cameraPosition);
    vec3  sunDir  = normalize(uSunWorldPos - vWorldPos);
    float fwd     = max(0.0, dot(viewDir, -sunDir));
    float halo    = pow(fwd, 10.0) * 0.22 * (1.0 - shadow);
    color *= 1.0 + halo;

    gl_FragColor = vec4(color, alpha);
  }
`

/**
 * Input configuration for {@link buildBodyRings}. Couples the ring
 * geometry (radii derived from the planet radius), the deterministic
 * variation (archetype + profile + colours) and the planet's world-space
 * position used for shadow rays.
 *
 * Time scrubbing (pause / speed multiplier) is intentionally absent —
 * the caller scales the `dt` it passes to `tick()` instead, which keeps
 * playback control where it belongs (with the time source).
 */
export interface BodyRingsConfig {
  /** Planet visual radius (world units). Ring radii are `radius × innerRatio/outerRatio`. */
  radius:        number
  /** Ring self-rotation speed around its own normal (rad/s). */
  rotationSpeed: number
  /** Deterministic ring variation (archetype + profile + colors). */
  variation:     RingVariation
  /**
   * Mutable world-space position of the planet — read by the shadow
   * shader on every render. The caller owns the vector and mutates it
   * each frame (e.g. `props.group.getWorldPosition(planetWorldPos)`); the
   * lib never reassigns it. Wired directly into the shader uniform so no
   * per-frame copy is needed.
   */
  planetWorldPos: THREE.Vector3
}

/**
 * Runtime handle returned by {@link buildBodyRings}. Owns a `carrier`
 * group (attached to the planet) and exposes live setters to tweak the
 * ring variation without rebuilding.
 */
export interface BodyRingsHandle {
  /** The group to attach to the planet's group (NOT the mesh directly). */
  carrier: THREE.Group
  mesh:    THREE.Mesh
  /**
   * Advances the ring's internal spin angle by `dt` and refreshes the
   * world-space uniforms. Pass `0` (or skip the call) to freeze the
   * rotation — pause is just absence of ticks.
   */
  tick(dt: number): void
  /** Mutate live uniforms + rebuild the geometry when inner/outer ratios change. */
  updateVariation(v: RingVariation): void
  dispose(): void
}

/**
 * Builds the ring carrier + mesh pair. The caller attaches `carrier` to the
 * planet group; `tick(dt)` advances spin and refreshes world-space uniforms.
 */
export function buildBodyRings(config: BodyRingsConfig): BodyRingsHandle {
  let innerR = config.radius * config.variation.innerRatio
  let outerR = config.radius * config.variation.outerRatio

  let geo = new THREE.RingGeometry(innerR, outerR, 256, 1)

  const [p0, p1, p2, p3, p4, p5, p6, p7] = config.variation.profile
  const profileA = new THREE.Vector4(p0, p1, p2, p3)
  const profileB = new THREE.Vector4(p4, p5, p6, p7)

  const uniforms = {
    uInnerR:         { value: innerR },
    uOuterR:         { value: outerR },
    uProfileA:       { value: profileA },
    uProfileB:       { value: profileB },
    uBandFreq:       { value: config.variation.bandFreq },
    uBandContrast:   { value: config.variation.bandContrast },
    uDustiness:      { value: config.variation.dustiness },
    uGrainAmount:    { value: config.variation.grainAmount },
    uGrainFreq:      { value: config.variation.grainFreq },
    uOpacity:        { value: config.variation.opacity },
    uLobeStrength:   { value: config.variation.lobeStrength },
    uKeplerShear:    { value: config.variation.keplerShear },
    uRotationPhase:  { value: 0 },
    uNoiseSeed:      { value: config.variation.noiseSeed },
    uColorInner:     { value: new THREE.Color(config.variation.colorInner) },
    uColorOuter:     { value: new THREE.Color(config.variation.colorOuter) },
    // Wired directly to the caller's mutable Vector3 — no per-frame copy.
    uPlanetWorldPos: { value: config.planetWorldPos },
    uPlanetRadius:   { value: config.radius },
    uSunWorldPos:    { value: new THREE.Vector3(0, 0, 0) },
  }

  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder   = 3
  mesh.frustumCulled = false
  mesh.raycast       = () => {}

  const carrier = new THREE.Group()
  carrier.add(mesh)

  const Q_base  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  const Q_spin  = new THREE.Quaternion()
  const Y_AXIS  = new THREE.Vector3(0, 1, 0)

  let spinAngle = 0

  function tick(dt: number): void {
    spinAngle += config.rotationSpeed * dt
    Q_spin.setFromAxisAngle(Y_AXIS, spinAngle)
    mesh.quaternion.multiplyQuaternions(Q_spin, Q_base)

    // Kepler shear compensates in-shader against the mesh spin, so it must
    // track the same accumulated phase — both stay in lockstep.
    uniforms.uRotationPhase.value = spinAngle

    // `uPlanetWorldPos` is wired by reference to `config.planetWorldPos` —
    // the caller mutates it from its own loop, the shader sees the change
    // next render with no copy.
    if (mesh.parent) findDominantLightWorldPos(findSceneRoot(mesh), uniforms.uSunWorldPos.value)
  }

  function updateVariation(v: RingVariation): void {
    const newInner = config.radius * v.innerRatio
    const newOuter = config.radius * v.outerRatio
    if (newInner !== innerR || newOuter !== outerR) {
      geo.dispose()
      geo = new THREE.RingGeometry(newInner, newOuter, 256, 1)
      mesh.geometry = geo
      innerR = newInner
      outerR = newOuter
      uniforms.uInnerR.value = newInner
      uniforms.uOuterR.value = newOuter
    }
    uniforms.uProfileA.value.set(v.profile[0], v.profile[1], v.profile[2], v.profile[3])
    uniforms.uProfileB.value.set(v.profile[4], v.profile[5], v.profile[6], v.profile[7])
    uniforms.uBandFreq.value     = v.bandFreq
    uniforms.uBandContrast.value = v.bandContrast
    uniforms.uDustiness.value    = v.dustiness
    uniforms.uGrainAmount.value  = v.grainAmount
    uniforms.uGrainFreq.value    = v.grainFreq
    uniforms.uOpacity.value      = v.opacity
    uniforms.uLobeStrength.value = v.lobeStrength
    uniforms.uKeplerShear.value  = v.keplerShear
    uniforms.uNoiseSeed.value    = v.noiseSeed
    uniforms.uColorInner.value.set(v.colorInner)
    uniforms.uColorOuter.value.set(v.colorOuter)
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { carrier, mesh, tick, updateVariation, dispose }
}
