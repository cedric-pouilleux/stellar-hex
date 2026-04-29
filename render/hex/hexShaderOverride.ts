/**
 * Shader override for the interactive hex mesh.
 *
 * Minimal shader for the focused hex mesh: per-vertex roughness/metalness
 * + optional fill light + terrain bump + edge blend + metallic sheen.
 * Liquid surfaces are handled by the stacked hex liquid shell
 * ({@link buildLiquidShell}) on the layered planet path; the hex mesh
 * only draws the sol prisms.
 */

import * as THREE from 'three'
import type { GraphicsUniforms } from './hexGraphicsUniforms'
import { GRADIENT_NOISE_GLSL, TERRAIN_NORMAL_GLSL, EDGE_BLEND_GLSL } from './hexShaderSnippets'

/**
 * Applies per-vertex roughness/metalness, terrain bump-mapping, edge
 * blending and metallic sheen to the interactive hex mesh material.
 *
 * @param graphicsUniforms - Per-body uniform bag — wires `uTerrainBumpEnabled`,
 *                           `uEdgeBlendEnabled`, `uBumpStrength`, `uEdgeBlendStrength`
 *                           into the shader.
 */
export function applyHexShader(
  m:                THREE.MeshStandardMaterial,
  fillUniform:      { value: number },
  timeUniform:      { value: number },
  metallicSheen:    number,
  graphicsUniforms: GraphicsUniforms,
): void {
  m.customProgramCacheKey = () => 'hex_fill_terrain'

  m.onBeforeCompile = (shader) => {
    // ── Vertex shader: forward per-vertex attributes ──────────────
    shader.vertexShader =
      'attribute float aRoughness;\nattribute float aMetalness;\n' +
      'attribute float aLand;\n' +
      'attribute vec3  aTileCenter;\nattribute float aTileRadius;\n' +
      'varying float vRoughness;\nvarying float vMetalness;\n' +
      'varying float vLand;\n' +
      'varying vec3  vTileCenter;\nvarying float vTileRadius;\n' +
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' +
      // Object-space position for noise sampling — stays fixed on the surface
      // regardless of group rotation so terrain patterns follow the planet.
      'varying vec3 vObjectPos;\n' +
      shader.vertexShader

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vRoughness   = aRoughness;',
      'vMetalness   = aMetalness;',
      'vLand        = aLand;',
      'vTileCenter  = (modelMatrix * vec4(aTileCenter, 1.0)).xyz;',
      'vTileRadius  = aTileRadius;',
      'vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      'vWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vObjectPos   = transformed;',
    ].join('\n'))

    // ── Fragment shader: terrain bump + edge blend + metallic sheen ──
    shader.fragmentShader =
      'varying float vRoughness;\nvarying float vMetalness;\n' +
      'varying float vLand;\n' +
      'varying vec3  vTileCenter;\nvarying float vTileRadius;\n' +
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n' +
      'varying vec3 vObjectPos;\n' +
      'uniform float uFillIntensity;\n' +
      'uniform float uMetallicSheen;\n' +
      'uniform float uTime;\n' +
      'uniform float uTerrainBumpEnabled;\n' +
      'uniform float uEdgeBlendEnabled;\n' +
      'uniform float uBumpStrength;\n' +
      'uniform float uEdgeBlendStrength;\n' +
      /* Gradient noise — used by both terrain bump and edge-blend passes. */
      GRADIENT_NOISE_GLSL +
      shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor = vRoughness;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      'float metalnessFactor = vMetalness;',
    )

    // Terrain bump-mapping on land tiles — injected after
    // normal_fragment_maps so Three.js uses perturbed normals for lighting.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' + TERRAIN_NORMAL_GLSL,
    )

    // Inter-tile color dissolve — softens hard hex seams on land.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' + EDGE_BLEND_GLSL,
    )

    // Metallic sheen + fill light
    const extra = `
{
  vec3  _toSun = normalize(-vWorldPos);
  float _ndl   = dot(vWorldNormal, _toSun);
  float _lit   = smoothstep(-0.10, 0.28, _ndl);

  float _mMask = uMetallicSheen * vMetalness;
  reflectedLight.indirectDiffuse  *= mix(1.0, 0.18 + 0.82 * _lit, _mMask);
  reflectedLight.indirectSpecular *= mix(1.0, 0.15 + 0.85 * _lit, _mMask);
  float _rim = pow(1.0 - max(0.0, dot(vWorldNormal, normalize(cameraPosition - vWorldPos))), 3.8)
             * smoothstep(-0.08, 0.45, _ndl);
  reflectedLight.directSpecular += diffuseColor.rgb * _rim * _mMask * 0.55;
}
reflectedLight.indirectDiffuse += diffuseColor.rgb * uFillIntensity;
`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>' + extra,
    )

    shader.uniforms.uFillIntensity       = fillUniform
    shader.uniforms.uMetallicSheen       = { value: metallicSheen }
    shader.uniforms.uTime                = timeUniform
    shader.uniforms.uTerrainBumpEnabled  = graphicsUniforms.uTerrainBumpEnabled
    shader.uniforms.uEdgeBlendEnabled    = graphicsUniforms.uEdgeBlendEnabled
    shader.uniforms.uBumpStrength        = graphicsUniforms.uBumpStrength
    shader.uniforms.uEdgeBlendStrength   = graphicsUniforms.uEdgeBlendStrength
  }
}
