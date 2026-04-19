/**
 * Framework-agnostic planet effect layer (storms / lava) builder.
 *
 *   mode = 'storms' (gaseous)  : animated bands with differential rotation +
 *                                slow-drifting oval storm spot. Palette tracks
 *                                planet temperature (cold=teal, warm=amber).
 *   mode = 'lava'   (hot rocky): Voronoï crack network with self-illumination.
 *
 * Pure Three.js. The caller owns attachment and per-frame `tick` driving.
 */

import * as THREE from 'three'
import type { BodyConfig } from '../types/body.types'

const VERT = /* glsl */`
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vLocalPos    = normalize(position);
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLSL_NOISE = /* glsl */`
  float hash(vec3 p) {
    p  = fract(p * 0.3183099);
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i),             hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p  = p * 2.1 + vec3(1.7, 9.2, 3.4);
      a *= 0.5;
    }
    return v;
  }
`

const STORMS_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uWarmth;
  uniform vec3  uSunWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
` + GLSL_NOISE + /* glsl */`

  void main() {
    vec3  n   = normalize(vLocalPos);
    float lat = n.y;

    float rotOffset = uTime * 0.022 * (1.0 - lat * lat * 0.60);
    float cosR = cos(rotOffset), sinR = sin(rotOffset);
    vec3  s = vec3(n.x * cosR - n.z * sinR, n.y, n.x * sinR + n.z * cosR);

    float turbA = fbm(s * 3.8  + vec3(0.0,       uTime * 0.004, 0.0))       - 0.5;
    float turbB = fbm(s * 7.5  + vec3(uTime*0.003, 0.0,         uTime*0.002)) - 0.5;

    float pLat  = lat + turbA * 0.18 + turbB * 0.06;
    float bands = sin(pLat * 3.14159 * 8.0) * 0.5 + 0.5;

    float fine  = fbm(s * 14.0 + vec3(uTime * 0.008, 0.0, 0.0));
    float value = bands * 0.65 + fine * 0.35;

    vec3 wBright = vec3(0.90, 0.72, 0.40);
    vec3 wDark   = vec3(0.48, 0.26, 0.10);
    vec3 cBright = vec3(0.50, 0.75, 0.90);
    vec3 cDark   = vec3(0.20, 0.35, 0.62);
    vec3 colB    = mix(cBright, wBright, uWarmth);
    vec3 colD    = mix(cDark,   wDark,   uWarmth);
    vec3 color   = mix(colD, colB, value);
    color += (fbm(s * 24.0) - 0.5) * 0.04;

    float spotLon  = uTime * 0.004;
    vec3  spotAxis = normalize(vec3(cos(spotLon), -0.28, sin(spotLon)));
    float spotDist = distance(n, spotAxis);

    float spotCore = smoothstep(0.22, 0.04, spotDist);
    float spotRim  = smoothstep(0.28, 0.14, spotDist) * (1.0 - spotCore * 0.6);

    float swirl    = fbm(n * 9.0 + vec3(uTime * 0.030, 0.0, uTime * -0.012));
    float spot     = (spotCore * 0.85 + spotRim * 0.35) * (0.45 + swirl * 0.55);

    vec3 spotColW  = vec3(0.88, 0.28, 0.06);
    vec3 spotColC  = vec3(0.40, 0.55, 0.90);
    vec3 spotCol   = mix(spotColC, spotColW, uWarmth);
    color = mix(color, spotCol, spot * 0.88);

    float alpha = 0.80 + spot * 0.12;

    vec3  sunDir = normalize(uSunWorldPos - vWorldPos);
    float NdotL  = dot(vWorldNormal, sunDir);
    color  *= (NdotL * 0.40 + 0.62);
    alpha  *= smoothstep(-0.08, 0.10, NdotL);
    alpha   = clamp(alpha, 0.0, 0.92);

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

const LAVA_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uTempNorm;
  uniform float uWaterCov;
  uniform vec3  uSunWorldPos;
  uniform vec3  uCameraWorldPos;
  uniform float uRadius;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
` + GLSL_NOISE + /* glsl */`

  vec3 hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  void worley2(vec3 p, out float F1, out float F2) {
    vec3 i = floor(p), f = fract(p);
    F1 = 1e4; F2 = 1e4;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3  nb = vec3(float(x), float(y), float(z));
      vec3  r  = nb + hash3(i + nb) - f;
      float d  = dot(r, r);
      if      (d < F1) { F2 = F1; F1 = d; }
      else if (d < F2) { F2 = d; }
    }
    F1 = sqrt(F1); F2 = sqrt(F2);
  }
  void worley2Fast(vec3 p, out float F1, out float F2) {
    vec3 i = floor(p), f = fract(p);
    vec3 bias = step(0.5, f);
    F1 = 1e4; F2 = 1e4;
    for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
    for (int x = 0; x <= 1; x++) {
      vec3  nb = vec3(float(x), float(y), float(z)) - (1.0 - bias);
      vec3  r  = nb + hash3(i + nb) - f;
      float d  = dot(r, r);
      if      (d < F1) { F2 = F1; F1 = d; }
      else if (d < F2) { F2 = d; }
    }
    F1 = sqrt(F1); F2 = sqrt(F2);
  }

  void main() {
    vec3  p = normalize(vLocalPos);

    float speed = 0.03 + uTempNorm * 0.10;
    float t = uTime * speed;

    vec3 flow1 = vec3(
      fbm(p * 2.2 + vec3(t * 0.40, 0.0,       t * 0.25)) - 0.5,
      fbm(p * 2.2 + vec3(0.0,       t * 0.35, -t * 0.20)) - 0.5,
      fbm(p * 2.2 + vec3(-t * 0.30, t * 0.28,  0.0      )) - 0.5
    );
    vec3 flow2 = vec3(
      fbm(p * 4.5 + vec3(t * 0.55,  0.0,      -t * 0.30)) - 0.5,
      fbm(p * 4.5 + vec3(0.0,      -t * 0.45,  t * 0.38)) - 0.5,
      fbm(p * 4.5 + vec3(t * 0.42, -t * 0.33,  0.0      )) - 0.5
    );
    float advStr = 0.08 + uTempNorm * 0.14;
    vec3  q = p + flow1 * advStr + flow2 * (advStr * 0.45);

    float F1a, F2a;
    worley2(q * 3.2 + vec3(t * 0.18, 0.0, t * 0.12), F1a, F2a);
    float crackA = 1.0 - smoothstep(0.0, 0.30, F2a - F1a);
    float poolA  = smoothstep(0.38, 0.0, F1a) * 0.65;

    float F1m, F2m;
    worley2(q * 5.5 + vec3(-t * 0.22, t * 0.16, 0.0), F1m, F2m);
    float crackM = 1.0 - smoothstep(0.0, 0.20, F2m - F1m);

    float F1b, F2b;
    worley2Fast(q * 9.5 + vec3(0.0, t * 0.28, t * 0.18), F1b, F2b);
    float crackB = 1.0 - smoothstep(0.0, 0.13, F2b - F1b);

    float lava = max(
      crackA * 0.55 + crackM * 0.28 + crackB * 0.17,
      poolA
    );

    float pulseSpeed = 0.6 + uTempNorm * 1.2;
    float pulse = sin(uTime * pulseSpeed        + F1a * 14.0) * 0.10
                + sin(uTime * pulseSpeed * 1.65 + F1b *  8.0) * 0.07
                + sin(uTime * pulseSpeed * 0.70 + F1m * 11.0) * 0.05;
    lava = clamp(lava + pulse * lava, 0.0, 1.0);

    float crackOnly = smoothstep(0.0, 0.35, uTempNorm);
    float lavaVis   = crackOnly * lava + (1.0 - crackOnly) * min(lava, crackA * 0.6 + crackB * 0.4);

    vec3 rockCool = vec3(0.06, 0.01, 0.01);
    vec3 rockHot  = vec3(0.12, 0.04, 0.01);
    vec3 rock     = mix(rockCool, rockHot, uTempNorm);

    vec3 crustCool = mix(rock, vec3(0.14, 0.18, 0.20), uWaterCov * 0.5);
    vec3 crust     = mix(rock, crustCool, uWaterCov);

    vec3 seamCol  = vec3(0.92, 0.78, 0.18);
    vec3 dimGlowC = vec3(0.50, 0.08, 0.01);
    vec3 dimGlowH = vec3(0.70, 0.18, 0.02);
    vec3 dimGlow  = mix(mix(seamCol, dimGlowC, smoothstep(0.0, 0.25, uTempNorm)), dimGlowH, smoothstep(0.25, 1.0, uTempNorm));

    vec3 glowC    = vec3(0.88, 0.22, 0.03);
    vec3 glowH    = vec3(1.00, 0.62, 0.10);
    vec3 glow     = mix(glowC, glowH, uTempNorm);

    vec3 hotC     = vec3(1.00, 0.72, 0.20);
    vec3 hotH     = vec3(1.00, 0.96, 0.72);
    vec3 hotCol   = mix(hotC, hotH, uTempNorm);

    vec3 color;
    color = mix(crust,  dimGlow, smoothstep(0.04, 0.22, lavaVis));
    color = mix(color,  glow,    smoothstep(0.22, 0.58, lavaVis) * crackOnly);
    color = mix(color,  hotCol,  smoothstep(0.62, 0.92, lavaVis) * crackOnly);

    float crackAlpha = smoothstep(0.03, 0.18, lavaVis);
    float fullAlpha  = smoothstep(0.05, 0.24, lava);
    float alpha = mix(crackAlpha * 0.60, fullAlpha, crackOnly);
    alpha *= smoothstep(0.0, 0.10, uTempNorm);

    vec3  sunDir   = normalize(uSunWorldPos - vWorldPos);
    float NdotL    = dot(vWorldNormal, sunDir);
    float selfEmit = smoothstep(0.28, 0.90, lavaVis) * (0.60 + uTempNorm * 0.40);
    float termFade = mix(smoothstep(-0.15, 0.10, NdotL), 1.0, selfEmit * 0.80);
    alpha *= (termFade * 0.65 + 0.35);

    float nightGlow = (1.0 - max(0.0, NdotL)) * selfEmit * (0.55 + uTempNorm * 0.45);
    color += color * nightGlow;

    float dist     = length(vWorldPos - uCameraWorldPos);
    float nearDist = uRadius * 2.2;
    float farDist  = uRadius * 20.0;
    float distFade = 1.0 - smoothstep(nearDist, farDist, dist);
    alpha *= distFade;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, clamp(alpha * 0.94, 0.0, 1.0));
  }
`

export type BodyEffectMode = 'storms' | 'lava'

export interface BodyEffectLayerConfig {
  config:  BodyConfig
  /** Static sun world position. Ignored when `getStarWorldPos` is supplied. Defaults to origin. */
  sunPos?: THREE.Vector3
  /** Live star world position (when the star itself moves). */
  getStarWorldPos?: () => THREE.Vector3
  /** Live camera world position — required for the lava falloff. */
  getCameraWorldPos?: () => THREE.Vector3
}

export interface BodyEffectLayerHandle {
  mode: BodyEffectMode
  mesh: THREE.Mesh
  tick(dt: number): void
  dispose(): void
  /** Exposed storm `uWarmth` uniform (null for lava mode). */
  uWarmth:   { value: number } | null
  /** Exposed lava `uTempNorm` uniform (null for storm mode). */
  uTempNorm: { value: number } | null
  /** Exposed lava `uWaterCov` uniform (null for storm mode). */
  uWaterCov: { value: number } | null
}

/**
 * Builds the procedural effect overlay appropriate for `config.type` +
 * average temperature. Returns a mesh, a per-frame tick, and handles to
 * the mode-specific uniforms for external tweaking.
 */
export function buildBodyEffectLayer(opts: BodyEffectLayerConfig): BodyEffectLayerHandle {
  const cfg    = opts.config
  const avg    = (cfg.temperatureMin + cfg.temperatureMax) / 2
  const mode: BodyEffectMode = cfg.type === 'gaseous' ? 'storms' : 'lava'
  const warmth   = mode === 'storms' ? Math.max(0, Math.min(1, (avg + 200) / 400)) : 0
  const tempNorm = Math.max(0, Math.min(1, (avg - 60) / 1440))
  const waterCov = cfg.waterCoverage ?? 0

  const timeUniform    = { value: 0.0 }
  const cameraPosValue = new THREE.Vector3()
  const sunPosValue    = (opts.sunPos ?? new THREE.Vector3(0, 0, 0)).clone()

  const uniforms: Record<string, { value: unknown }> = {
    uTime:        timeUniform,
    uSunWorldPos: { value: sunPosValue },
  }

  let uWarmth:   { value: number } | null = null
  let uTempNorm: { value: number } | null = null
  let uWaterCov: { value: number } | null = null

  if (mode === 'storms') {
    uWarmth = { value: warmth }
    uniforms.uWarmth = uWarmth
  } else {
    uTempNorm = { value: tempNorm }
    uWaterCov = { value: waterCov }
    uniforms.uTempNorm       = uTempNorm
    uniforms.uWaterCov       = uWaterCov
    uniforms.uCameraWorldPos = { value: cameraPosValue }
    uniforms.uRadius         = { value: cfg.radius }
  }

  const geo = new THREE.SphereGeometry(
    cfg.radius * (mode === 'storms' ? 1.006 : 1.004),
    mode === 'storms' ? 72 : 64,
    mode === 'storms' ? 36 : 32,
  )
  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: mode === 'storms' ? STORMS_FRAG : LAVA_FRAG,
    uniforms,
    transparent: true,
    depthWrite:  false,
    depthTest:   true,
    side:        THREE.FrontSide,
  })
  const mesh         = new THREE.Mesh(geo, mat)
  mesh.renderOrder   = mode === 'storms' ? 1 : 2
  mesh.frustumCulled = false
  mesh.raycast       = () => {}

  const getStarWP   = opts.getStarWorldPos
  const getCameraWP = opts.getCameraWorldPos

  function tick(dt: number): void {
    timeUniform.value += dt
    if (getStarWP) sunPosValue.copy(getStarWP())
    if (mode === 'storms') {
      mesh.rotation.y += dt * 0.007
    } else if (getCameraWP) {
      cameraPosValue.copy(getCameraWP())
    }
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { mode, mesh, tick, dispose, uWarmth, uTempNorm, uWaterCov }
}
