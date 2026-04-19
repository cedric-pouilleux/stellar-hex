/**
 * Framework-agnostic atmosphere shell builder.
 *
 * Creates a Three.js sphere + Rayleigh/Mie scattering ShaderMaterial. The caller
 * drives per-frame updates via `tick(dt)` and owns the scene-graph attachment.
 * Used by the Vue `AtmosphereShell.vue` wrapper and by vanilla-Three consumers
 * (Nuxt, SSR preview, standalone scenes).
 */

import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// Vertex shader
// Passes world-space normal and world-space view direction for Rayleigh phase.
// cameraPosition is a Three.js built-in vec3 uniform for ShaderMaterial.
// ─────────────────────────────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;

  void main() {
    vec3 worldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal          = normalize(normalMatrix * normal);
    vWorldNormal     = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 mv          = modelViewMatrix * vec4(position, 1.0);
    vViewDir         = normalize(-mv.xyz);
    vWorldViewDir    = normalize(cameraPosition - worldPos);
    gl_Position      = projectionMatrix * mv;
  }
`

// ─────────────────────────────────────────────────────────────────────────────
// Fragment shader — Rayleigh + Mie scattering model. See original
// AtmosphereShell.vue comments for the physics derivation.
// ─────────────────────────────────────────────────────────────────────────────
const FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uPower;
  uniform vec3  uSunDir;
  uniform float uLitBySun;
  uniform float uAtmoOpacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;

  float miePhaseFn(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.0001), 1.5));
  }

  void main() {
    vec3  N  = normalize(vNormal);
    vec3  V  = normalize(vViewDir);
    vec3  WN = normalize(vWorldNormal);
    vec3  WV = normalize(vWorldViewDir);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), uPower);

    float sunDot   = dot(WN, uSunDir);
    float cosTheta = dot(WV, uSunDir);

    float mu       = max(sunDot + 0.15, 0.025);
    float optDepth = clamp(1.0 / mu, 1.0, 18.0);

    float rayleighPhase = 0.75 * (1.0 + cosTheta * cosTheta);
    float miePhase      = miePhaseFn(cosTheta, 0.76) * 0.06;

    vec3  sunsetColor  = vec3(1.0, 0.36, 0.04);
    float sunsetT      = smoothstep(1.5, 14.0, optDepth);
    vec3  scatterColor = mix(uColor, sunsetColor, sunsetT * uLitBySun);

    float phaseMod = mix(1.0, rayleighPhase * 0.55 + 0.45, uLitBySun);
    scatterColor  *= phaseMod;
    scatterColor  += vec3(miePhase) * max(sunDot, 0.0) * uLitBySun;

    float litFactor   = smoothstep(-0.25, 0.5, sunDot);
    float attenuation = mix(1.0, litFactor, uLitBySun);

    float alpha = fresnel * uIntensity * attenuation * uAtmoOpacity;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(scatterColor, alpha);
  }
`

/** Shared `{ value }` uniform handle — matches Three.js's IUniform shape. */
export interface NumberUniform { value: number }

export interface AtmosphereShellConfig {
  /** Pre-computed atmosphere shell radius (see atmosphereRadius in sceneBodyUtils). */
  radius:    number
  /** Base scatter color (CSS string or #rrggbb). */
  color:     string
  intensity: number
  /** Fresnel exponent (soft edge → sharp rim as it grows). */
  power:     number
  /** false for self-lit bodies (stars) — disables Rayleigh and terminator. */
  litBySun?: boolean
  /**
   * World-space position of the parent body. When provided, `tick` recomputes
   * the sun direction each frame (sun assumed at world origin). Irrelevant
   * when `litBySun === false`.
   */
  getPlanetWorldPos?: () => THREE.Vector3
  /** Optional shared `uAtmoOpacity` uniform (reuse `hexGraphicsUniforms.uAtmoOpacity`). */
  atmoOpacityUniform?: NumberUniform
}

export interface AtmosphereShellHandle {
  /** Renderable mesh — callers attach/detach it to their scene graph. */
  mesh: THREE.Mesh
  /** Per-frame update (currently ignores `dt`; kept for API symmetry). */
  tick(dt: number): void
  /** Releases GPU resources (geometry + material). */
  dispose(): void
}

/** Sun is at the world origin in all current scenes. */
const SUN_POS = /*#__PURE__*/ new THREE.Vector3(0, 0, 0)

/**
 * Builds an atmosphere shell mesh with a Rayleigh+Mie scattering shader.
 * Pure Three.js — no Vue, TresJS, or scene hierarchy assumptions.
 */
export function buildAtmosphereShell(config: AtmosphereShellConfig): AtmosphereShellHandle {
  const litBySun = config.litBySun !== false

  const geo = new THREE.SphereGeometry(config.radius, 32, 16)
  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor:       { value: new THREE.Color(config.color) },
      uIntensity:   { value: config.intensity },
      uPower:       { value: config.power },
      uSunDir:      { value: new THREE.Vector3(1, 0, 0) },
      uLitBySun:    { value: litBySun ? 1.0 : 0.0 },
      uAtmoOpacity: config.atmoOpacityUniform ?? { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.FrontSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.raycast       = () => {}

  const _planetWP = new THREE.Vector3()
  const _sunDir   = new THREE.Vector3()
  const sunDirUni = mat.uniforms.uSunDir.value as THREE.Vector3
  const getPlanetWP = config.getPlanetWorldPos

  function tick(_dt: number): void {
    if (!litBySun || !getPlanetWP) return
    _planetWP.copy(getPlanetWP())
    _sunDir.subVectors(SUN_POS, _planetWP).normalize()
    sunDirUni.copy(_sunDir)
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { mesh, tick, dispose }
}
