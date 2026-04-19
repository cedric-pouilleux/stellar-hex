// ── Lava / molten flow ────────────────────────────────────────────────────────
// Viscous lava channel network with domain-warped flow simulation.
// Shared by rocky and metallic shaders.
//
// Requires: gnoise(), fbm(), voronoiEdge() — include noise.glsl before this file.
//
// Parameters:
//   netScale  — voronoi scale for the channel network
//               (rocky: uCrackScale, metallic: uLavaScale)
//   netWidth  — base channel width
//               (rocky: mix(0.015, 0.22, uLavaAmount), metallic: uLavaWidth)
//   crackMask — crack mask from computeCracks() to seed channel placement
//               (pass 0.0 if cracks are disabled)
//
// Returns the HDR emissive lava contribution (add to final lit color).
vec3 computeLava(
  inout vec3 baseColor,
  vec3  p,
  float time,
  float amount,
  float netScale,
  float netWidth,
  float crackMask,
  vec3  lavaColor,
  float lavaEmissive
) {
  float tSlow = time * 0.015; // slow network morphing
  float tFast = time * 0.22;  // fast flow through channels

  // Channel network — domain-warped voronoi, morphs very slowly.
  // Highest frequency uses voronoiEdgeFast (8-cell) — detail is sub-pixel.
  vec3 pNet = p + gnoise(p * 0.8 + tSlow) * 0.08;
  float le1 = voronoiEdge(pNet * 1.8  * netScale);
  float le2 = voronoiEdge(pNet * 4.5  * netScale + vec3(3.1, 7.2, 1.4));
  float le3 = voronoiEdgeFast(pNet * 11.0 * netScale + vec3(9.3, 2.1, 5.7));

  float lm1 = smoothstep(netWidth,        0.0, le1);
  float lm2 = smoothstep(netWidth * 0.65, 0.0, le2);
  float lm3 = smoothstep(netWidth * 0.38, 0.0, le3);
  // crackMask seeds the network: lava preferentially fills existing fractures
  float lavaNet = clamp(lm1 + lm2 * 0.7 + lm3 * 0.4 + crackMask, 0.0, 1.0);

  // Internal flow — directional double warp simulates viscous fluid in motion
  vec3 q = vec3(
    fbm3(p * 3.0 + vec3(tFast,        0.0, 0.0), 2.0, 0.55),
    fbm3(p * 3.0 + vec3(tFast * 0.8,  1.7, 0.0), 2.0, 0.55),
    fbm3(p * 2.5 + vec3(0.0, tFast * 0.6, 0.9),  2.0, 0.55)
  ) * 2.0 - 1.0;
  float flux   = fbm3(p * 5.0 + q * 0.7 + vec3(tFast * 1.4, 0.0, 0.0), 2.0, 0.5);

  // High-frequency micro-bubbling layer
  float bubble  = fbm2(p * 12.0 + vec3(tFast * 2.5, tFast * 1.8, 0.0), 2.0, 0.5);
  float flowPat = flux * 0.7 + bubble * 0.3;

  // Hot spots: intense localized peaks where flux is highest (pow collapses mid-range)
  float hotSpots = pow(clamp(flux, 0.0, 1.0), 2.5);

  // Multi-frequency organic pulsation (breathing lava)
  float pulse = 0.85 + sin(time * 2.2) * 0.10 + sin(time * 0.7 + 1.3) * 0.05;

  // 3-tone thermal color mapping: dark crust → orange → white-hot core
  vec3 lavaWhite  = clamp(lavaColor * vec3(2.0, 1.5, 0.5) + vec3(0.4, 0.15, 0.0), 0.0, 2.0);
  vec3 lavaOrange = lavaColor;
  vec3 lavaDark   = lavaColor * vec3(0.3, 0.07, 0.01);

  vec3 lavaCol;
  if (flowPat > 0.6) {
    lavaCol = mix(lavaOrange, lavaWhite, (flowPat - 0.6) / 0.4);
  } else {
    lavaCol = mix(lavaDark, lavaOrange, flowPat / 0.6);
  }
  lavaCol = mix(lavaCol, lavaWhite, hotSpots * 0.6) * pulse;

  // Volcanic crust darkens between channels; lava fills channels
  baseColor = mix(baseColor, baseColor * (1.0 - amount * 0.55), 1.0 - lavaNet);
  baseColor = mix(baseColor, lavaCol, lavaNet);

  return lavaCol * lavaEmissive * lavaNet * pulse;
}
