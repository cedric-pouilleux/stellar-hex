import * as THREE from 'three'
import { type BodyHoverConfig, DEFAULT_BODY_HOVER } from '../config/render'

// ── Silhouette-plane ring shaders ────────────────────────────────────────────
// The ring is placed on the EXACT silhouette plane of the sphere.
//
// Background — why a simple billboard ring never matches a sphere:
//   A perspective-projected sphere is NOT centered at the projection of its 3D
//   center. The visible silhouette is the tangent cone from the camera to the
//   sphere; the silhouette circle lies on a plane perpendicular to the
//   camera→sphere direction, shifted closer to the camera. When projected, this
//   circle becomes an ellipse matching the sphere's visible outline exactly.
//
// Approach:
//   Each frame (CPU, onBeforeRender) we compute the silhouette circle in world
//   space — center, normal, radius — and pass them as uniforms. The vertex
//   shader transforms them to view space, builds a tangent frame in the
//   silhouette plane, and places the PlaneGeometry vertices there.
//   The perspective projection matrix then distorts the ring identically to the
//   sphere mesh, producing a ring that always matches the sphere outline.
//
// uOuterRadiusWorld and uInnerFrac are recomputed every frame so that margin
// and stroke width remain constant in screen pixels at any zoom level.

const RING_VERT = /* glsl */`
  // Silhouette circle center in world space (shifted toward camera from sphere center)
  uniform vec3  uSilCenterWorld;
  // Camera-to-sphere direction in world space (silhouette plane normal), normalized
  uniform vec3  uSilNormalWorld;
  // Outer ring radius in world units (silhouette radius + margin + stroke)
  uniform float uOuterRadiusWorld;

  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Transform silhouette geometry to view (camera) space
    vec3 centerV = (viewMatrix * vec4(uSilCenterWorld, 1.0)).xyz;
    vec3 normalV = normalize((viewMatrix * vec4(uSilNormalWorld, 0.0)).xyz);

    // Build an orthonormal tangent frame in the silhouette plane (view space).
    // Pick a reference vector not parallel to normalV to avoid degenerate cross products.
    vec3 ref   = (abs(normalV.y) < 0.9) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(ref, normalV));
    vec3 up    = normalize(cross(normalV, right));

    // position.xy ∈ [-1, 1] (PlaneGeometry 2×2).
    // Expand the vertex onto the silhouette plane — perspective then distorts
    // the ring exactly like the sphere silhouette.
    vec3 pos = centerV + uOuterRadiusWorld * (position.x * right + position.y * up);

    gl_Position = projectionMatrix * vec4(pos, 1.0);
  }
`

const RING_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  // Inner boundary as a fraction of outer radius [0,1]:
  //   innerFrac = (silRadius + marginPx*wPerPx) / (silRadius + marginPx*wPerPx + widthPx*wPerPx)
  uniform float uInnerFrac;

  varying vec2 vUv;

  void main() {
    // Remap uv to [-1, 1] centered coordinates
    vec2  c = vUv * 2.0 - 1.0;
    float d = length(c);

    if (d > 1.0) discard;

    float aa    = 0.025;
    float outer = smoothstep(1.0, 1.0 - aa, d);
    float inner = smoothstep(uInnerFrac - aa, uInnerFrac, d);
    float alpha = outer * inner * uOpacity;

    if (alpha < 0.001) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`

// ── Scratch allocations (avoid GC in per-frame callbacks) ─────────
const _camToSphere    = new THREE.Vector3()
const _silCenterWorld = new THREE.Vector3()
const _silNormalWorld = new THREE.Vector3()

// ── Public interface ──────────────────────────────────────────────

export interface BodyHoverOverlay {
  /** Show or hide the ring. */
  setVisible(visible: boolean): void
  /** Remove mesh from parent group and release GPU resources. */
  dispose(): void
}

/**
 * Builds a selection ring for a celestial body that matches the sphere's
 * perspective-projected silhouette exactly.
 *
 * The ring is placed on the sphere's silhouette plane each frame:
 *   - Center: sphere_center + shift toward camera = P*(1 - r²/d²)
 *   - Radius: r * sqrt(1 - r²/d²)
 *   - Normal: camera→sphere direction
 *
 * This makes the ring distort identically to the sphere mesh under perspective
 * projection, eliminating any shape/position mismatch.
 *
 * `cfg.ringMarginPx` and `cfg.ringWidthPx` remain constant in screen pixels
 * at any zoom level.
 *
 * @param group  - The body's THREE.Group.
 * @param radius - Body radius in world units.
 * @param cfg    - Visual parameters.
 */
export function buildBodyHoverOverlay(
  group:  THREE.Group,
  radius: number,
  cfg:    BodyHoverConfig = DEFAULT_BODY_HOVER,
): BodyHoverOverlay {
  const geo = new THREE.PlaneGeometry(2, 2)
  const mat = new THREE.ShaderMaterial({
    vertexShader:   RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uColor:           { value: new THREE.Color(cfg.ringColor) },
      uOpacity:         { value: cfg.ringOpacity },
      uInnerFrac:       { value: 0.9 },                // overwritten each frame
      uSilCenterWorld:  { value: new THREE.Vector3() }, // overwritten each frame
      uSilNormalWorld:  { value: new THREE.Vector3() }, // overwritten each frame
      uOuterRadiusWorld:{ value: 0.0 },                // overwritten each frame
    },
    transparent: true,
    depthWrite:  false,
    // depthTest: false — the ring must stay visible even when the camera is close
    // to the planet (the planet's own depth values would occlude the ring otherwise).
    // Inter-body occlusion is handled by the raycaster in AnimationController:
    // only the frontmost body under the cursor gets its ring shown.
    depthTest:   false,
    side:        THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder   = 2
  mesh.raycast       = () => {}
  mesh.visible       = false
  mesh.frustumCulled = false  // vertex position is controlled by the shader

  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    // ── Sphere center in world space ──────────────────────────
    group.getWorldPosition(_silCenterWorld) // reuse as temp — overwritten below
    const sphereWorldPos = _silCenterWorld.clone()

    // ── Camera-to-sphere vector ───────────────────────────────
    _camToSphere.copy(sphereWorldPos).sub(camera.position)
    const d = _camToSphere.length()
    if (d <= radius) return  // camera inside sphere — skip

    // ── Silhouette circle geometry (world space) ──────────────
    // The silhouette plane is perpendicular to camToSphere,
    // shifted from sphere center toward camera by r²/d.
    //   sil_center = camera + camToSphere * (d²-r²)/d²
    //   sil_radius = r * sqrt(d²-r²) / d
    const d2 = d * d
    const r2 = radius * radius
    const silFrac   = (d2 - r2) / d2
    const silRadius = radius * Math.sqrt(d2 - r2) / d

    _silCenterWorld.copy(camera.position).addScaledVector(_camToSphere, silFrac)
    _silNormalWorld.copy(_camToSphere).divideScalar(d)  // normalized direction

    // ── World units per pixel at silhouette depth ─────────────
    // depth = signed distance from camera along the view axis to sil center
    // Approximation: use silFrac * d (the distance from camera to sil center)
    const fovY     = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
    const fbHeight = _renderer.domElement.height
    const silDist  = d * silFrac
    const wPerPx   = (Math.tan(fovY * 0.5) * silDist) / (fbHeight * 0.5)

    // ── Ring radii ────────────────────────────────────────────
    const outerRadius = silRadius + (cfg.ringMarginPx + cfg.ringWidthPx) * wPerPx
    const innerRadius = silRadius + cfg.ringMarginPx * wPerPx

    mat.uniforms.uSilCenterWorld.value.copy(_silCenterWorld)
    mat.uniforms.uSilNormalWorld.value.copy(_silNormalWorld)
    mat.uniforms.uOuterRadiusWorld.value = outerRadius
    mat.uniforms.uInnerFrac.value        = innerRadius / outerRadius
  }

  group.add(mesh)

  function setVisible(visible: boolean): void {
    mesh.visible = visible
  }

  function dispose(): void {
    group.remove(mesh)
    geo.dispose()
    mat.dispose()
  }

  return { setVisible, dispose }
}
