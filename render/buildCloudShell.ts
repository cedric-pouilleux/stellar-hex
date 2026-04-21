/**
 * Framework-agnostic cloud / ice shell builder.
 *
 *   frozen=false : FBM cloud layer (animated, white, drifts with mesh rotation)
 *   frozen=true  : Worley ice-sheet layer with grounded plates and soft crevasses
 *
 * Both shaders respect the terminator (night side invisible) and the optional
 * occluder shadow (this body behind a parent body is invisible).
 *
 * Pure Three.js — the Vue wrapper only owns lifecycle + reactive bindings.
 */

import * as THREE from 'three'
import { findSceneRoot, findDominantLightWorldPos } from './findDominantLight'

// ── Shared vertex shader ──────────────────────────────────────────

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

const GLSL_UNIFORMS_VARS = /* glsl */`
  uniform float uTime;
  uniform float uCoverage;
  uniform vec3  uOccluderPos;
  uniform float uOccluderRadius;
  uniform vec3  uSunWorldPos;
  uniform float uCloudOpacity;
  uniform float uCloudSpeed;
  uniform vec3  uCloudColor;
  varying vec3  vLocalPos;
  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
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
  vec3 whash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
`

const GLSL_OCCLUDER_CHECK = /* glsl */`
    if (uOccluderRadius > 0.0) {
      vec3  _L   = normalize(vWorldPos);
      float _tCA = dot(uOccluderPos, _L);
      if (_tCA > 0.1 && _tCA < length(vWorldPos)) {
        vec3  _perp = uOccluderPos - _tCA * _L;
        float _occ  = 1.0 - smoothstep(uOccluderRadius * 0.88, uOccluderRadius * 1.05, length(_perp));
        alpha *= (1.0 - _occ);
        if (alpha < 0.01) discard;
      }
    }
`

const CLOUD_FRAG = GLSL_UNIFORMS_VARS + GLSL_NOISE + /* glsl */`
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p  = p * 2.1 + vec3(1.7, 9.2, 3.4);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float t = uTime * uCloudSpeed;
    vec3 p = vLocalPos * 3.5;
    p.x += t * 0.012;
    p.z += t * 0.006;
    float base = fbm(p);

    vec3 pd = vLocalPos * 7.2 + vec3(5.3, 1.8, 2.7);
    pd.x += t * 0.019;
    pd.z += t * 0.019;
    float detail = fbm(pd);

    float cloud  = base * 0.70 + detail * 0.30;
    float thresh = 0.54 + (0.5 - uCoverage) * 0.5;
    float alpha  = smoothstep(thresh - 0.06, thresh + 0.10, cloud);

    vec3  sunDir = normalize(uSunWorldPos - vWorldPos);
    float NdotL  = dot(vWorldNormal, sunDir);
    alpha *= smoothstep(-0.08, 0.12, NdotL);
    if (alpha < 0.01) discard;

    float diffuse    = max(0.0, NdotL);
    float light      = diffuse * 0.60 + 0.40;
    float brightness = mix(0.78, 1.00, smoothstep(thresh, thresh + 0.15, cloud));

    ${GLSL_OCCLUDER_CHECK}

    gl_FragColor = vec4(uCloudColor * brightness * light, alpha * uCloudOpacity);
  }
`

const ICE_FRAG = GLSL_UNIFORMS_VARS + GLSL_NOISE + /* glsl */`
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p  = p * 2.1 + vec3(1.7, 9.2, 3.4);
      a *= 0.5;
    }
    return v;
  }

  void worley2(vec3 p, out float F1, out float F2, out vec3 cellHash) {
    vec3 i = floor(p), f = fract(p);
    F1 = 1e4; F2 = 1e4;
    cellHash = vec3(0.0);
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3  n = vec3(float(x), float(y), float(z));
      vec3  h = whash3(i + n);
      vec3  r = n + h - f;
      float d = dot(r, r);
      if      (d < F1) { F2 = F1; F1 = d; cellHash = h; }
      else if (d < F2) { F2 = d; }
    }
    F1 = sqrt(F1); F2 = sqrt(F2);
  }
  void worley2Fast(vec3 p, out float F1, out float F2, out vec3 cellHash) {
    vec3 i = floor(p), f = fract(p);
    vec3 bias = step(0.5, f);
    F1 = 1e4; F2 = 1e4;
    cellHash = vec3(0.0);
    for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
    for (int x = 0; x <= 1; x++) {
      vec3  n = vec3(float(x), float(y), float(z)) - (1.0 - bias);
      vec3  h = whash3(i + n);
      vec3  r = n + h - f;
      float d = dot(r, r);
      if      (d < F1) { F2 = F1; F1 = d; cellHash = h; }
      else if (d < F2) { F2 = d; }
    }
    F1 = sqrt(F1); F2 = sqrt(F2);
  }

  void main() {
    vec3  p = vLocalPos;

    float F1, F2;
    vec3  plateHash;
    worley2(p * 2.35, F1, F2, plateHash);
    float plateSpan     = F2 - F1;
    float plateInterior = smoothstep(0.032, 0.24, plateSpan);
    float plateEdge     = 1.0 - smoothstep(0.040, 0.14, plateSpan);

    float G1, G2;
    vec3  detailHash;
    worley2Fast(p * 5.8 + vec3(5.3, 0.0, 2.8), G1, G2, detailHash);
    float detailSpan     = G2 - G1;
    float detailInterior = smoothstep(0.020, 0.11, detailSpan);
    float detailEdge     = 1.0 - smoothstep(0.024, 0.078, detailSpan);

    float surf       = fbm(p * 4.6 + vec3(1.3, 4.7, 2.1));
    float plateTone  = clamp(plateHash.x * 0.62 + plateHash.y * 0.38, 0.0, 1.0);
    float frostTone  = clamp(surf * 0.58 + plateTone * 0.42, 0.0, 1.0);
    float detailTone = detailHash.z;
    float plateField = smoothstep(0.22, 0.78, plateTone);

    vec3  iceBase = mix(vec3(0.50, 0.56, 0.65), vec3(0.74, 0.79, 0.83), frostTone);
    vec3  iceLift = mix(vec3(0.66, 0.71, 0.75), vec3(0.81, 0.85, 0.86), plateTone);
    vec3  plateCol = mix(vec3(0.48, 0.54, 0.63), vec3(0.84, 0.86, 0.86), plateField);
    vec3  color   = mix(iceBase, iceLift, 0.34 + surf * 0.16);
    color         = mix(color, plateCol, 0.22);
    color         = mix(color, vec3(0.31, 0.35, 0.42), plateEdge * 0.24);
    color         = mix(color, vec3(0.46, 0.50, 0.57), detailEdge * 0.10);
    color        *= 0.97 + detailTone * 0.06;

    float alpha = (0.26 + uCoverage * 0.54)
                * mix(0.70, 1.00, plateInterior)
                * mix(0.88, 1.00, detailInterior);
    if (alpha < 0.01) discard;

    vec3  sunDir = normalize(uSunWorldPos - vWorldPos);
    float NdotL  = dot(vWorldNormal, sunDir);
    alpha *= smoothstep(-0.06, 0.10, NdotL);
    if (alpha < 0.01) discard;

    float diffuse    = max(0.0, NdotL);
    vec3  finalLight = vec3(diffuse * 0.85) + vec3(0.03, 0.06, 0.14);

    ${GLSL_OCCLUDER_CHECK}

    gl_FragColor = vec4(color * finalLight, alpha * uCloudOpacity * 0.867);
  }
`

/** Shared `{ value: THREE.Vector3 }` uniform handle — matches Three's IUniform shape. */
export interface Vec3Uniform   { value: THREE.Vector3 }
/** Shared `{ value: number }` uniform handle — matches Three's IUniform shape. */
export interface NumberUniform { value: number }

/**
 * Input configuration for {@link buildCloudShell}. Drives both the animated
 * gaseous cloud layer and the frozen Worley ice variant through the same
 * mesh, sharing uniforms with the host body when needed.
 */
export interface CloudShellConfig {
  /**
   * Absolute shell radius. The builder draws the sphere at exactly this radius,
   * so callers are responsible for placing it above the tallest terrain. Use
   * `cloudShellRadius(config, frozen)` to derive a value that also clears the
   * hex extrusion, matching the `atmosphereRadius` pattern.
   */
  radius:   number
  /** Cloud / ice coverage ratio [0..1]. */
  coverage: number
  /** When true, renders a static Worley ice sheet; otherwise animated FBM clouds. */
  frozen:   boolean
  /**
   * Optional occluder shadow uniforms (shared with a parent body's updater).
   * When omitted, no occlusion is applied.
   */
  occluderUniforms?: { pos: Vec3Uniform, radius: NumberUniform }
  /** Optional shared `uCloudOpacity` uniform (e.g. `hexGraphicsUniforms.uCloudOpacity`). */
  cloudOpacityUniform?: NumberUniform
  /** Optional shared `uCloudSpeed` uniform (e.g. `hexGraphicsUniforms.uCloudSpeed`). */
  cloudSpeedUniform?:   NumberUniform
  /** Optional shared `uCloudColor` vec3 uniform (e.g. `hexGraphicsUniforms.uCloudColor`). */
  cloudColorUniform?:   { value: THREE.Color }
  /**
   * Optional callback returning the dominant light's world-space position each
   * frame. When provided, it takes precedence over the automatic scene-traversal
   * done by {@link findDominantLightWorldPos}, which requires the mesh to already
   * be in a fully updated scene graph. Prefer this in vanilla Three.js setups
   * where tick runs before the renderer's implicit `updateMatrixWorld`.
   *
   * For a directional light at position `p` pointing toward the origin, pass
   * `() => p.clone().normalize().multiplyScalar(1e5)` (or a pre-allocated Vector3
   * updated each frame).
   */
  getSunWorldPos?: () => THREE.Vector3
}

/**
 * Runtime handle returned by {@link buildCloudShell}. Owns the cloud mesh
 * and its per-frame `tick` (advancing time) + `dispose` lifecycle.
 */
export interface CloudShellHandle {
  mesh: THREE.Mesh
  tick(dt: number): void
  dispose(): void
}

/**
 * Builds a cloud-layer (or ice-sheet) mesh around a planet. Pure Three.js.
 */
export function buildCloudShell(config: CloudShellConfig): CloudShellHandle {
  const timeUniform  = { value: 0 }
  const speedUniform = config.cloudSpeedUniform ?? { value: 1.0 }
  const uniforms = {
    uTime:           timeUniform,
    uCoverage:       { value: config.coverage },
    uSunWorldPos:    { value: new THREE.Vector3(0, 0, 0) },
    uOccluderPos:    config.occluderUniforms?.pos    ?? { value: new THREE.Vector3() },
    uOccluderRadius: config.occluderUniforms?.radius ?? { value: 0.0 },
    uCloudOpacity:   config.cloudOpacityUniform ?? { value: 1.0 },
    uCloudSpeed:     speedUniform,
    uCloudColor:     config.cloudColorUniform   ?? { value: new THREE.Color(1, 1, 1) },
  }

  const geo = new THREE.SphereGeometry(config.radius, 32, 16)
  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: config.frozen ? ICE_FRAG : CLOUD_FRAG,
    uniforms,
    transparent:    true,
    depthWrite:     false,
    depthTest:      true,
    side:           THREE.FrontSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder   = 2
  mesh.frustumCulled = false
  mesh.raycast       = () => {}

  const sunPosUni      = uniforms.uSunWorldPos.value
  const frozen         = config.frozen
  const getSunWorldPos = config.getSunWorldPos

  function tick(dt: number): void {
    // `uCloudSpeed` is already multiplied into `uTime` inside the shader, so
    // raising it churns the FBM pattern faster. Mesh rotation is kept at a
    // fixed slow drift on top of the parent body's spin — otherwise clouds
    // would overtake the terrain whenever speed is increased.
    timeUniform.value += dt
    if (!frozen) mesh.rotation.y += dt * 0.01
    // Prefer the explicit callback (reliable before renderer.updateMatrixWorld);
    // fall back to scene-traversal when running inside a fully-managed scene.
    if (getSunWorldPos) {
      sunPosUni.copy(getSunWorldPos())
    } else if (mesh.parent) {
      findDominantLightWorldPos(findSceneRoot(mesh), sunPosUni)
    }
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { mesh, tick, dispose }
}
