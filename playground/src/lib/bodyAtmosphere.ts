/**
 * Playground-side attachment of the atmosphere + cloud shells.
 *
 * Both shells live in their own shader pipelines (see `buildAtmosphereShell`
 * and `buildCloudShell`). The main app wires them via TresJS components in
 * `scene/AtmosphereShell.vue` and `scene/CloudShell.vue` — the playground
 * reuses the framework-agnostic builders directly so the visual output stays
 * consistent without pulling TresJS into the preview.
 */

import * as THREE from 'three'
import {
  buildAtmosphereShell, type AtmosphereShellHandle,
  buildCloudShell,      type CloudShellHandle,
  atmosphereRadius,     cloudCoverageFor,      auraParamsFor,
  hasAtmosphere,
  hexGraphicsUniforms,
  type BodyConfig,
} from '@lib'
import { cloudShaderParams } from './cloudShader'

export interface AtmosphereParamOverrides {
  intensity?: number | null
  power?:     number | null
  color?:     string | null
}

export interface BodyShellsHandle {
  atmosphere: AtmosphereShellHandle | null
  clouds:     CloudShellHandle      | null
  /** Advances the shell animations (clouds drift, atmosphere sun tracking). */
  tick(dt: number): void
  /** Live-update the cloud coverage uniform (no rebuild). */
  setCloudCoverage(value: number): void
  /** Toggle the cloud mesh visibility without rebuilding. */
  setCloudsEnabled(value: boolean): void
  /**
   * Live-patch the atmosphere mesh uniforms (`uColor`, `uIntensity`, `uPower`).
   * A `null` entry restores the build-time derived value; an `undefined`
   * entry leaves the current uniform unchanged.
   */
  setAtmosphereParams(overrides: AtmosphereParamOverrides): void
  /** Toggle the atmosphere mesh visibility without rebuilding. */
  setAtmosphereEnabled(value: boolean): void
  dispose(): void
}

/**
 * Attaches atmosphere + cloud shells onto a body group when the config
 * calls for them. Returns a handle whose `tick` forwards to the underlying
 * builders and whose `dispose` detaches + releases everything.
 *
 * The atmosphere is built whenever `hasAtmosphere(config)` is true (matches
 * the production gating from `sceneBodyUtils`). Clouds only spawn when
 * `cloudCoverageFor(config)` returns a non-null coverage.
 */
export function attachBodyShells(group: THREE.Group, config: BodyConfig): BodyShellsHandle {
  const wp = new THREE.Vector3()
  let atmosphere: AtmosphereShellHandle | null = null
  let clouds:     CloudShellHandle      | null = null

  const auraDerived = hasAtmosphere(config) ? auraParamsFor(config) : null

  if (auraDerived) {
    atmosphere = buildAtmosphereShell({
      radius:            atmosphereRadius(config),
      color:             auraDerived.color,
      intensity:         auraDerived.intensity,
      power:             auraDerived.power,
      litBySun:          config.type !== 'star',
      getPlanetWorldPos: () => group.getWorldPosition(wp),
      atmoOpacityUniform: hexGraphicsUniforms.uAtmoOpacity,
    })
    group.add(atmosphere.mesh)
  }

  // Rocky planets use the CPU-derived coverage. Gas giants always carry
  // a swirling cloud layer so the band animation reads visually — it's
  // what brings `gasJetStream` / `gasCloudDetail` to life in the preview.
  const rockyCoverage = cloudCoverageFor(config)
  const gasCoverage   = config.type === 'gaseous' ? 0.55 : null
  const derived       = rockyCoverage ?? gasCoverage
  const override      = cloudShaderParams.coverageOverride
  const coverage      = override ?? derived
  if (coverage !== null) {
    clouds = buildCloudShell({
      radius:              config.radius,
      coverage,
      frozen:              false,
      cloudOpacityUniform: hexGraphicsUniforms.uCloudOpacity,
      cloudSpeedUniform:   hexGraphicsUniforms.uCloudSpeed,
      cloudColorUniform:   hexGraphicsUniforms.uCloudColor,
    })
    group.add(clouds.mesh)
  }

  function tick(dt: number): void {
    atmosphere?.tick(dt)
    clouds?.tick(dt)
  }

  function setCloudCoverage(value: number): void {
    const mat = clouds?.mesh.material as THREE.ShaderMaterial | undefined
    const uni = mat?.uniforms?.uCoverage
    if (uni) uni.value = value
  }

  function setCloudsEnabled(value: boolean): void {
    if (clouds) clouds.mesh.visible = value
  }

  function setAtmosphereParams(o: AtmosphereParamOverrides): void {
    const mat = atmosphere?.mesh.material as THREE.ShaderMaterial | undefined
    if (!mat || !auraDerived) return
    if (o.intensity !== undefined) {
      mat.uniforms.uIntensity.value = o.intensity ?? auraDerived.intensity
    }
    if (o.power !== undefined) {
      mat.uniforms.uPower.value = o.power ?? auraDerived.power
    }
    if (o.color !== undefined) {
      ;(mat.uniforms.uColor.value as THREE.Color).set(o.color ?? auraDerived.color)
    }
  }

  function setAtmosphereEnabled(value: boolean): void {
    if (atmosphere) atmosphere.mesh.visible = value
  }

  function dispose(): void {
    if (atmosphere) { group.remove(atmosphere.mesh); atmosphere.dispose() }
    if (clouds)     { group.remove(clouds.mesh);     clouds.dispose() }
  }

  return {
    atmosphere, clouds, tick,
    setCloudCoverage, setCloudsEnabled,
    setAtmosphereParams, setAtmosphereEnabled,
    dispose,
  }
}
