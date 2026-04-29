/**
 * GLSL sources for the procedural atmosphere shell.
 *
 * Kept in their own module so {@link buildAtmoShell} stays focused on
 * orchestration. The vertex shader simply forwards world position +
 * normal + colour attribute; the fragment shader carries the entire
 * look (FBm + warped FBm + latitude bands + storm cells + cloud cover
 * + per-tile paint mask + rim-only mode).
 *
 * Uniform contract — every uniform name used by the fragment shader is
 * also listed in the {@link ATMO_SHELL_UNIFORM_NAMES} array, so the
 * factory can build the uniform map from a single source of truth
 * without typoing a name in two places.
 */

export const ATMO_SHELL_VERTEX_SHADER = /* glsl */ `
  attribute vec3 color;
  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying vec3  vObjectDir;
  varying vec3  vTileColor;

  void main() {
    vec4 wp      = modelMatrix * vec4(position, 1.0);
    vWorldPos    = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vObjectDir   = normalize(position);
    vTileColor   = color;
    gl_Position  = projectionMatrix * viewMatrix * wp;
  }
`

export const ATMO_SHELL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3  uTint;
  uniform vec3  uLightDir;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uBandiness;
  uniform float uBandFreq;
  uniform float uDriftSpeed;
  uniform float uStorms;
  uniform float uCloudAmount;
  uniform vec3  uCloudColor;
  uniform float uCloudScale;
  uniform float uTileColorMix;
  uniform float uFlatLighting;
  // Rim-only mode: collapses the alpha to a thin fresnel-driven liseré at
  // the silhouette and forces the colour to the pure body tint. Used by
  // setHaloMode(true) so the playable-sol view sees the atmosphere's full
  // outer radius as a hint, without any band/cloud content covering the
  // body's centre. 0 = default volumetric look, 1 = pure rim.
  uniform float uRimOnly;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vObjectDir;
  varying vec3 vTileColor;

  // 3D hash + value-noise — cheap, deterministic, wraps trig.
  float _hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  float _vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = _hash(i + vec3(0,0,0));
    float n100 = _hash(i + vec3(1,0,0));
    float n010 = _hash(i + vec3(0,1,0));
    float n110 = _hash(i + vec3(1,1,0));
    float n001 = _hash(i + vec3(0,0,1));
    float n101 = _hash(i + vec3(1,0,1));
    float n011 = _hash(i + vec3(0,1,1));
    float n111 = _hash(i + vec3(1,1,1));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }
  // FBm — five octaves give finer roiling without pricing the fragment
  // shader out of frame budget at typical viewport sizes.
  float _fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * _vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return s;
  }

  // Domain-warped FBm — feeds an FBm gradient back into the sample point,
  // producing the roiling-fluid look you get on gas giants and storm-rich
  // atmospheres. \`strength\` scales the warp; 0 collapses back to plain FBm.
  float _warpedFbm(vec3 p, float strength) {
    vec3 w = vec3(
      _fbm(p + vec3(0.7, 1.3, 2.1)),
      _fbm(p + vec3(5.2, 1.3, 2.8)),
      _fbm(p + vec3(2.4, 4.7, 1.1))
    );
    return _fbm(p + (w - 0.5) * 2.0 * strength);
  }

  // Storm-cell field — three rotating "spots" advected by uTime. Returns
  // 0 outside cells, peaks at ~1 inside. uStorms gates the contribution.
  float _stormField(vec3 dir, float t) {
    if (uStorms < 0.001) return 0.0;
    vec3 c0 = normalize(vec3(sin(t * 0.04 + 0.0), 0.35, cos(t * 0.04 + 0.0)));
    vec3 c1 = normalize(vec3(sin(t * 0.03 + 2.7), -0.20, cos(t * 0.03 + 2.7)));
    vec3 c2 = normalize(vec3(sin(t * 0.05 + 4.9),  0.55, cos(t * 0.05 + 4.9)));
    float s = 0.0;
    s += smoothstep(0.92, 1.0, dot(dir, c0)) * 1.0;
    s += smoothstep(0.94, 1.0, dot(dir, c1)) * 0.7;
    s += smoothstep(0.95, 1.0, dot(dir, c2)) * 0.5;
    return s * uStorms;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    // BackSide rendering — flip toward the viewer. Use gl_FrontFacing
    // (not a dot test) so silhouette fragments with marginally
    // negative interpolated dot values don't get mis-flipped on
    // FrontSide rendering, which would leak band tint onto the dark
    // hemisphere's limb.
    if (!gl_FrontFacing) N = -N;

    // Drifting object-space sample point. Speed is uniform-driven so a
    // playground slider can freeze / accelerate the animation live.
    float t = uTime * uDriftSpeed;
    vec3  q = vObjectDir * 2.4 + vec3(t * 0.04, t * 0.02, 0.0);

    // Multi-scale warped FBm — macro features (cloud masses) on top of
    // mid-scale turbulence and a fine-grain layer that catches the eye
    // when the camera zooms in. \`uTurbulence\` scales the domain warp.
    float macro = _warpedFbm(q * 0.6, uTurbulence);
    float meso  = _fbm(q * 1.6 + vec3(0.0, t * 0.05, 0.0));
    float micro = _fbm(q * 4.5 + vec3(t * 0.08, 0.0, 0.0));
    float turb  = clamp(macro * 0.6 + meso * 0.3 + micro * 0.1, 0.0, 1.0);

    // Adaptive latitude bands — the FBm offset gives the belts a wavy,
    // organic edge instead of mathematical sine perfection.
    float lat       = vObjectDir.y;
    float bandPhase = lat * uBandFreq + (macro - 0.5) * 1.8;
    float bands     = sin(bandPhase) * 0.5 + 0.5;
    // Slight asymmetry per band — alternating belts read darker / lighter.
    bands = mix(bands, bands * 0.65 + 0.18, 0.35 + 0.30 * sin(lat * uBandFreq * 0.5));

    // Combine turbulence and bands with the configured ratio. Storm cells
    // punch through any blend.
    float density = mix(turb, bands, clamp(uBandiness, 0.0, 1.0));
    density       = clamp(density + _stormField(vObjectDir, t) * 0.6, 0.0, 1.0);

    // Per-tile painted colour blended over the body-level tint. The
    // mask uses a smoothstep ramp instead of a hard step so adjacent
    // tiles with different paint values fade into each other rather
    // than producing visible polygon boundaries on the icosphere — the
    // procedural FBm pattern then breaks up any residual hex shape.
    float tileEnergy  = max(max(vTileColor.r, vTileColor.g), vTileColor.b);
    float tileMask    = smoothstep(0.005, 0.15, tileEnergy);
    vec3  baseTint    = mix(uTint, vTileColor, tileMask * uTileColorMix);
    float colorEnergy = (vTileColor.r + vTileColor.g + vTileColor.b) / 3.0;
    density           = mix(density, max(density, 0.5 + colorEnergy * 0.5), tileMask);

    // Bands also tint the base — alternating belts pick up a slightly
    // tinted shade so the silhouette breaks out of mono-tint flatness.
    vec3 bandTint = mix(baseTint * 0.85, baseTint * 1.15, bands);

    // ── High-altitude clouds ──────────────────────────────────────
    // Lives on the atmospheric shell instead of the body's surface
    // shader — keeps the playable sol clean while the cloud cover
    // animates on the atmosphere layer that wraps it. Driven by
    // uCloudAmount (slider) so the user can dial coverage live.
    //
    // Pattern shaping : the cloud layer follows the same bandiness /
    // storms / turbulence archetype as the base atmo, so the user
    // perceives a coherent identity when switching the playground
    // cloud pattern preset (Dispersé / Bandes / Cyclones / Voile).
    // At default values (Dispersé) the formula collapses back to the
    // legacy FBm-only mask.
    float cloudWeight = 0.0;
    if (uCloudAmount > 0.001) {
      vec3 cp = vObjectDir * max(0.1, uCloudScale) * 1.4 + vec3(t * 0.05, t * 0.02, 0.0);
      vec3 cq = vec3(
        _fbm(cp + vec3(0.7, 1.3, 2.1)),
        _fbm(cp + vec3(5.2, 1.3, 2.8)),
        _fbm(cp + vec3(2.4, 4.7, 1.1))
      ) * 2.0 - 1.0;
      float cloudNoise = _fbm(cp * 1.5 + cq * 1.8 + vec3(t * 0.07, 0.0, 0.0));
      // Bandes : pulls clouds into latitude stripes when uBandiness > 0.
      float bandStripe = sin(lat * uBandFreq) * 0.5 + 0.5;
      float patterned  = mix(cloudNoise, max(cloudNoise, bandStripe), uBandiness * 0.85);
      // Cyclones : boosts coverage near the storm cells (gated by uStorms inside).
      patterned       += _stormField(vObjectDir, t) * 0.45;
      // Voile : when turbulence collapses (bandiness/storms also low), widen
      // the smoothstep window so coverage reads as a dense overcast.
      float coverageLo = mix(0.20, 0.45, smoothstep(0.10, 0.45, uTurbulence));
      cloudWeight      = pow(smoothstep(coverageLo, 0.65, patterned), 1.3) * uCloudAmount;
    }
    vec3 withClouds = mix(bandTint, uCloudColor, cloudWeight);

    // Rim falloff — atmo reads thicker at the silhouette than at the
    // sub-camera point.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.6);

    // Lambertian shading. Color carries a tiny ambient floor so the
    // shaded face stays barely visible; alpha gates HARDER (no floor)
    // via smoothstep on the raw cosine, so the dark hemisphere fades
    // to fully transparent at the silhouette and no thin warm line
    // forms at the limb. uFlatLighting=1 (Sol view dome) collapses
    // both to uniform 1.
    float ndl       = max(dot(N, normalize(uLightDir)), 0.0);
    float colorDiff = mix(0.05 + 0.95 * ndl, 1.0, uFlatLighting);
    float alphaGate = mix(smoothstep(0.0, 0.15, ndl), 1.0, uFlatLighting);

    float baseAlpha = mix(0.55, 1.0, fres) * (0.40 + 0.60 * density);
    // Rim-only collapse — keeps only the geometric silhouette opaque
    // and fades to 0 toward the body's centre. The shader's fres
    // varies poorly on BackSide rendering (caps at ~0.32 at the
    // limb), so we derive the rim from the outward normal directly:
    // |dot(N_outward, V)| is 0 at the limb and 1 at the sub-camera /
    // sub-anti-camera point; the smoothstep window is widened to the
    // [0.5, 0.85] band so the rim is visibly thick at typical camera
    // distances while still discarding the body's centre.
    float silhouetteDot = abs(dot(normalize(vWorldNormal), V));
    // Tight rim concentrated near the geometric silhouette, scaled
    // down so the additive glow stays subtle. Going wider or stronger
    // reads as a thick coloured ring rather than a discreet "presence"
    // hint at the atmosphere's outer edge.
    float rimAlpha      = (1.0 - smoothstep(0.5, 0.95, silhouetteDot)) * 0.4;
    baseAlpha        = mix(baseAlpha, rimAlpha, uRimOnly);
    // Cloud contribution is inhibited in rim-only mode so the centre
    // stays clean even when a stale cloudAmount lingers in the uniforms.
    float cloudGate  = (1.0 - uRimOnly) * cloudWeight * 0.85;
    float alpha      = uOpacity * max(baseAlpha, cloudGate) * alphaGate;
    if (alpha <= 0.001) discard;

    // Rim-only mode forces the pure tint — strips bands, painted-tile
    // colours and clouds from the visible liseré.
    vec3 finalColor = mix(withClouds, uTint, uRimOnly);
    gl_FragColor = vec4(finalColor * colorDiff, alpha);
  }
`
