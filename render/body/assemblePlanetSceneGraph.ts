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
import type { PlanetConfig } from '../../types/body.types'
import type { TerrainLevel } from '../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from './bodyVariation'
import {
  resolveCoreRadiusRatio,
  resolveAtmosphereThickness,
  hasAtmosphere,
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
import { buildAtmoBoardMesh, type AtmoBoardMesh } from '../atmo/buildAtmoBoardMesh'
import { makeInteractiveController } from './interactiveController'
import { injectPlanetShadows } from '../lighting/shadowInjection'
import { injectRingShadow } from '../shells/ringShadowInjection'
import { strategyFor, type BodyTypeStrategy } from './bodyTypeStrategy'

/** Inputs needed by the planet assembler. */
export interface AssemblePlanetInputs {
  config:    PlanetConfig
  sim:       BodySimulation
  palette:   TerrainLevel[]
  variation: BodyVariation
  hoverChannel:     HoverChannel
  graphicsUniforms: GraphicsUniforms
  quality?:         RenderQuality
}

/** Flat bag of every handle the planet path produces. */
export interface PlanetSceneGraph {
  group: THREE.Group
  strategy: BodyTypeStrategy
  smoothSphere:   ReturnType<typeof buildSmoothSphereMesh>
  displayMesh:    THREE.Mesh
  planetMaterial: ReturnType<typeof buildSmoothSphereMesh>['planetMaterial']
  /** Sol interactive mesh (single-band hex prisms). */
  interactive:    ReturnType<typeof buildLayeredInteractiveMesh>
  /** Sol-side interactive controller. Atmo board has its own controller. */
  ctrl:           ReturnType<typeof makeInteractiveController>
  bodyHover:      ReturnType<typeof buildBodyHoverOverlay>
  coreMesh:       ReturnType<typeof buildCoreMesh>
  atmoShell:      AtmoShellHandle | null
  /**
   * Atmosphere board — playable hex grid spanning `[solOuterRadius,
   * config.radius]`, built from its own hexasphere (independent
   * subdivision count from the sol mesh). `null` on bodies without an
   * atmosphere (`atmosphereThickness === 0`). Carries its own raycast
   * proxy (`atmoBoard.queryHover`) so the public `Body.interactive` can
   * route hover queries to the right board based on the active view.
   */
  atmoBoard:      AtmoBoardMesh | null
  shadowUniforms:   ShadowUniforms
  occluderUniforms: OccluderUniforms
}

/**
 * Assembles a non-stellar body's scene graph deterministically. No view
 * state, no tick loop — the caller wires those on top via
 * `createPlanetViewSwitcher` and the public factory.
 */
export function assemblePlanetSceneGraph(inputs: AssemblePlanetInputs): PlanetSceneGraph {
  const { config, sim, palette, variation, hoverChannel, graphicsUniforms, quality } = inputs
  const strategy = strategyFor(config)

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
  const smoothSphere     = buildSmoothSphereMesh(sim, palette, variation, { meshRadius: smoothMeshRadius, quality, strategy })
  const { mesh: displayMesh, planetMaterial } = smoothSphere
  const interactive      = buildLayeredInteractiveMesh(sim, palette, variation, { hoverChannel, graphicsUniforms })
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

  // Atmo shell — translucent BackSide halo for the `'shader'` overview view.
  // Mounted on bodies whose smooth sphere does NOT play the role of
  // atmosphere (i.e. not gas), whose `atmosphereThickness > 0` and whose
  // atmospheric opacity > 0. Anchored on `config.radius` (the planet's
  // total silhouette) so the halo wraps the atmospheric envelope exactly.
  const shaderAtmoOpacity = config.atmosphereOpacity ?? strategy.defaultAtmosphereOpacity
  const wantsCorona       = !strategy.displayMeshIsAtmosphere && hasAtmosphere(config)
  let atmoShell: AtmoShellHandle | null = null
  if (wantsCorona && shaderAtmoOpacity > 0) {
    atmoShell = buildAtmoShell({
      config,
      radius:  config.radius,
      opacity: shaderAtmoOpacity,
      // Anchor the shader-view halo on the **atmo board** hexasphere so
      // `paintAtmoShell` can project per-tile gas colours by atmo tile id
      // (the only meaningful identity for atmospheric resources). Falling
      // back to `sim.tiles` (sol) would mismatch ids and the halo would
      // ignore any paint coming from the playable atmo grid.
      tiles:   sim.atmoTiles.length > 0 ? sim.atmoTiles : sim.tiles,
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

  // Atmosphere board — playable hex grid floating between the sol surface
  // and the atmospheric silhouette. Only mounted on bodies that actually
  // carry an atmosphere (`atmosphereThickness > 0`); the sim already
  // populates `sim.atmoTiles` accordingly.
  let atmoBoard: AtmoBoardMesh | null = null
  if (hasAtmosphere(config) && sim.atmoTiles.length > 0) {
    const atmoFraction   = resolveAtmosphereThickness(config)
    const solOuterRadius = config.radius * (1 - atmoFraction)
    atmoBoard = buildAtmoBoardMesh({
      tiles:       sim.atmoTiles,
      innerRadius: solOuterRadius,
      outerRadius: config.radius,
    })
    group.add(atmoBoard.group)
    // Hidden by default — the view switcher reveals it on
    // `setView('atmosphere')`.
    atmoBoard.setVisible(false)
  }

  return {
    group, strategy,
    smoothSphere, displayMesh, planetMaterial,
    interactive, ctrl, bodyHover,
    coreMesh, atmoShell,
    atmoBoard,
    shadowUniforms, occluderUniforms,
  }
}
