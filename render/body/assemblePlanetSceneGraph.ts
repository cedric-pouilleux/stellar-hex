/**
 * Scene-graph assembly for non-stellar bodies (rocky / metallic / gaseous).
 *
 * Pure assembly: builds every mesh + shell + handle the planet path needs
 * and packages them in a flat record. View-state management lives in
 * `createPlanetViewSwitcher`; the body factory glues both together and
 * exposes the public `Body` handle.
 *
 * Stars use a separate pipeline (`useStar`) — they do not flow through
 * this assembler.
 */

import * as THREE from 'three'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from './bodyVariation'
import {
  resolveCoreRadiusRatio,
  resolveAtmosphereThickness,
  hasSurfaceLiquid,
} from '../../physics/body'
import type { ShadowUniforms, OccluderUniforms } from '../hex/hexMeshShared'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { RenderQuality } from '../quality/renderQuality'
import { buildSmoothSphereMesh } from './buildSmoothSphereMesh'
import { buildLayeredInteractiveMesh } from '../layered/buildLayeredInteractiveMesh'
import { buildBodyHoverOverlay } from '../shells/buildBodyHoverOverlay'
import { buildCoreMesh } from '../shells/buildCoreMesh'
import { buildAtmoShell, type AtmoShellHandle } from '../shells/buildAtmoShell'
import { buildLiquidCorona, type LiquidCoronaHandle } from '../shells/buildLiquidCorona'
import { makeInteractiveController } from './interactiveController'
import { injectPlanetShadows } from '../lighting/shadowInjection'
import { injectRingShadow } from '../shells/ringShadowInjection'
import { strategyFor, type BodyTypeStrategy } from './bodyTypeStrategy'

/** Inputs needed by the planet assembler. */
export interface AssemblePlanetInputs {
  config:    BodyConfig
  sim:       BodySimulation
  palette:   TerrainLevel[]
  variation: BodyVariation
  hoverChannel:     HoverChannel
  graphicsUniforms: GraphicsUniforms
  /** Multiplicative headroom over `solOuterRadius` for the corona shells. Clamped upstream. */
  coronaHeadroom:   number
  quality?:         RenderQuality
}

/** Flat bag of every handle the planet path produces. */
export interface PlanetSceneGraph {
  group: THREE.Group
  strategy: BodyTypeStrategy
  smoothSphere:   ReturnType<typeof buildSmoothSphereMesh>
  displayMesh:    THREE.Mesh
  planetMaterial: ReturnType<typeof buildSmoothSphereMesh>['planetMaterial']
  interactive:    ReturnType<typeof buildLayeredInteractiveMesh>
  ctrl:           ReturnType<typeof makeInteractiveController>
  bodyHover:      ReturnType<typeof buildBodyHoverOverlay>
  coreMesh:       ReturnType<typeof buildCoreMesh>
  atmoShell:      AtmoShellHandle | null
  liquidCorona:   LiquidCoronaHandle | null
  shadowUniforms:   ShadowUniforms
  occluderUniforms: OccluderUniforms
}

/**
 * Assembles a non-stellar body's scene graph deterministically. No view
 * state, no tick loop — the caller wires those on top via
 * `createPlanetViewSwitcher` and the public factory.
 */
export function assemblePlanetSceneGraph(inputs: AssemblePlanetInputs): PlanetSceneGraph {
  const { config, sim, palette, variation, hoverChannel, graphicsUniforms, coronaHeadroom, quality } = inputs
  const strategy = strategyFor(config.type)

  const group = new THREE.Group()

  const shadowUniforms: ShadowUniforms = {
    pos:    { value: new THREE.Vector3() },
    radius: { value: 0.0 },
  }
  const occluderUniforms: OccluderUniforms = {
    pos:    { value: new THREE.Vector3() },
    radius: { value: 0.0 },
  }

  // Gas giants stretch the smooth sphere to `config.radius` so it doubles
  // as the atmospheric silhouette; rocky / metallic keep the default
  // `solOuterRadius` placement under their atmo shell halo.
  const smoothMeshRadius = strategy.displayMeshIsAtmosphere ? config.radius : undefined
  const smoothSphere     = buildSmoothSphereMesh(sim, palette, variation, { meshRadius: smoothMeshRadius, quality })
  const { mesh: displayMesh, planetMaterial } = smoothSphere
  const interactive      = buildLayeredInteractiveMesh(sim, palette, variation, { hoverChannel, graphicsUniforms, quality })
  // `manageDisplay: false` keeps the smooth sphere mounted at all times so
  // the view switcher can drive its visibility + depth flags directly.
  const ctrl = makeInteractiveController(
    group,
    displayMesh,
    interactive.getRaycastState,
    interactive,
    { manageDisplay: false },
  )
  const bodyHover = buildBodyHoverOverlay(group, config.radius)

  // Inner core — opaque sphere at `radius * coreRadiusRatio`, exposed only
  // when sol tiles are mined down to elevation 0. Pure-gas bodies skip the
  // mesh (coreRadius = 0).
  const coreMesh = buildCoreMesh({
    radius:          config.radius,
    coreRadiusRatio: resolveCoreRadiusRatio(config),
    quality,
  })
  group.add(coreMesh.mesh)

  injectPlanetShadows(planetMaterial.material as THREE.ShaderMaterial, occluderUniforms, shadowUniforms)
  if (variation.rings) {
    injectRingShadow(
      planetMaterial.material as THREE.ShaderMaterial,
      variation.rings,
      { planetRadius: config.radius },
    )
  }

  // Atmo shell — BackSide-rendered halo just outside the visible sol
  // silhouette. Mounted on bodies whose smooth sphere does NOT play the
  // role of atmosphere (i.e. not gas) and whose atmospheric opacity > 0.
  // Anchored to `solOuterRadius` so headroom reads as % of visible planet.
  const shaderAtmoOpacity = config.atmosphereOpacity ?? strategy.defaultAtmosphereOpacity
  const wantsCorona       = !strategy.displayMeshIsAtmosphere
  let atmoShell: AtmoShellHandle | null = null
  if (wantsCorona && shaderAtmoOpacity > 0) {
    const atmoFraction    = resolveAtmosphereThickness(config)
    const solOuterRadius  = config.radius * (1 - atmoFraction)
    const atmoShellRadius = solOuterRadius * (1 + coronaHeadroom)
    atmoShell = buildAtmoShell({
      config,
      radius:  atmoShellRadius,
      opacity: shaderAtmoOpacity,
      tiles:   sim.tiles,
      params: {
        turbulence: 0.70,
        bandiness:  0.30,
        bandFreq:   4.0,
        driftSpeed: 0.8,
        storms:     0.10,
        cloudAmount: variation.waveAmount ?? 0,
        cloudScale:  variation.waveScale  ?? 1.2,
      },
      quality,
    })
    atmoShell.mesh.visible = false
  }

  // Liquid corona — outer translucent halo tinted with `liquidColor`.
  // Mounted at the same radius as the atmoShell, with higher renderOrder
  // so it blends ON TOP at the silhouette ring. `hasSurfaceLiquid` already
  // encodes the rocky-only invariant.
  let liquidCorona: LiquidCoronaHandle | null = null
  if (hasSurfaceLiquid(config) && atmoShell) {
    const atmoFraction   = resolveAtmosphereThickness(config)
    const solOuterRadius = config.radius * (1 - atmoFraction)
    liquidCorona = buildLiquidCorona({
      radius:  solOuterRadius * (1 + coronaHeadroom),
      color:   config.liquidColor ?? '#2878d0',
      opacity: 0.3,
      quality,
    })
    liquidCorona.mesh.visible = false
    group.add(liquidCorona.mesh)
  }

  return {
    group, strategy,
    smoothSphere, displayMesh, planetMaterial,
    interactive, ctrl, bodyHover,
    coreMesh, atmoShell, liquidCorona,
    shadowUniforms, occluderUniforms,
  }
}
