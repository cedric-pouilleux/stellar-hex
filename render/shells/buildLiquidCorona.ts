/**
 * Liquid corona — outer translucent halo coloured with the body's liquid
 * tint, mounted just past the atmoShell on rocky bodies that carry a
 * surface liquid. Pure fresnel rim glow, no procedural pattern: visible
 * only as a thin coloured ring outside the atmosphere silhouette.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'

export interface LiquidCoronaConfig {
  radius:  number
  color:   THREE.ColorRepresentation
  opacity: number
  /** Optional render-quality bag — bumps the icosphere detail in `'high'`. */
  quality?: RenderQuality
}

export interface LiquidCoronaHandle {
  mesh: THREE.Mesh
  setOpacity:      (value: number) => void
  setColor:        (color: THREE.ColorRepresentation) => void
  setVisible:      (on: boolean) => void
  setLight:        (direction: THREE.Vector3) => void
  /** Flat = uniform brightness (Sol-view dome look). */
  setFlatLighting: (enabled: boolean) => void
  dispose:         () => void
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 wp      = modelMatrix * vec4(position, 1.0);
    vWorldPos    = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position  = projectionMatrix * viewMatrix * wp;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform vec3  uLightDir;
  uniform float uFlatLighting;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    if (!gl_FrontFacing) N = -N;

    float ndl       = max(dot(N, normalize(uLightDir)), 0.0);
    float colorDiff = mix(0.05 + 0.95 * ndl, 1.0, uFlatLighting);
    float alphaGate = mix(smoothstep(0.0, 0.15, ndl), 1.0, uFlatLighting);
    float fres      = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);

    float alpha = uOpacity * fres * alphaGate;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(uColor * colorDiff, alpha);
  }
`

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Builds the outer liquid-corona shell. BackSide-rendered so the back
 * face depth pushes the mesh behind any opaque body geometry — only the
 * thin ring outside the atmoShell silhouette ever lights up.
 */
export function buildLiquidCorona(opts: LiquidCoronaConfig): LiquidCoronaHandle {
  const detail   = resolveSphereDetail(5, opts.quality)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(opts.radius, detail))
  geometry.computeVertexNormals()

  const tint = new THREE.Color(opts.color)
  const uniforms: Record<string, THREE.IUniform> = {
    uColor:        { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
    uOpacity:      { value: clamp01(opts.opacity) },
    uLightDir:     { value: new THREE.Vector3(1, 0.5, 1).normalize() },
    uFlatLighting: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent:    true,
    depthWrite:     false,
    side:           THREE.BackSide,
    blending:       THREE.NormalBlending,
  })
  material.visible = uniforms.uOpacity.value > 0

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  // Render after atmoShell so blending order is consistent at the limb.
  mesh.renderOrder   = 2

  return {
    mesh,
    setOpacity(value) {
      const v = clamp01(value)
      uniforms.uOpacity.value = v
      material.visible = v > 0
    },
    setColor(color) {
      const c = new THREE.Color(color)
      ;(uniforms.uColor.value as THREE.Vector3).set(c.r, c.g, c.b)
    },
    setVisible(on) { mesh.visible = on },
    setLight(direction) {
      ;(uniforms.uLightDir.value as THREE.Vector3).copy(direction).normalize()
    },
    setFlatLighting(enabled) {
      uniforms.uFlatLighting.value = enabled ? 1 : 0
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
