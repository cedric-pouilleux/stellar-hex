// ── Crack network ─────────────────────────────────────────────────────────────
// Multi-scale voronoi edge crack network shared by rocky and metallic shaders.
//
// Requires: gnoise(), voronoiEdge(), applyBlend() — include noise.glsl and
// lighting.glsl before this file.
//
// Returns the crack mask [0..1] which is used downstream to seed lava channels.
float computeCracks(
  inout vec3 baseColor,
  vec3  p,
  float amount,
  float scale,
  float width,
  float depth,
  vec3  color,
  float blend
) {
  // Multi-scale network: large cracks + secondary + micro-cracks
  // Scale factors (1.8 / 4.5 / 11.0) give a fractal frequency ratio of ~2.5x
  // Highest frequency uses voronoiEdgeFast (8-cell) — detail is sub-pixel.
  float e1 = voronoiEdge(p * 1.8  * scale);
  float e2 = voronoiEdge(p * 4.5  * scale + vec3(3.1, 7.2, 1.4));
  float e3 = voronoiEdgeFast(p * 11.0 * scale + vec3(9.3, 2.1, 5.7));

  // Noise modulation breaks geometric regularity of the voronoi grid
  float crackNoise = gnoise(p * 6.0) * 0.3 + gnoise(p * 14.0) * 0.15;
  e1 += crackNoise * width * 0.5;
  e2 += crackNoise * width * 0.3;

  // Effective width per scale — smaller cracks are proportionally thinner
  float w1 = width;
  float w2 = width * 0.6;
  float w3 = width * 0.3;

  float mask1 = smoothstep(w1, 0.0, e1);
  float mask2 = smoothstep(w2, 0.0, e2);
  float mask3 = smoothstep(w3, 0.0, e3);

  // Secondary/micro cracks are weighted down for a coherent hierarchical network
  float crackMask = clamp(mask1 + mask2 * 0.6 + mask3 * 0.3, 0.0, 1.0) * amount;

  // Interior: dark color with FBM depth variation
  float depthVar   = gnoise(p * 8.0) * 0.3 + 0.7;
  vec3  innerColor = color * depthVar;

  // Edges slightly brighter (rock tension on crack walls)
  float edgeHighlight = smoothstep(w1 * 1.8, w1 * 1.0, e1) * (1.0 - mask1) * 0.4;
  baseColor = mix(baseColor, baseColor * 1.3, edgeHighlight * amount);

  baseColor = applyBlend(baseColor, innerColor, crackMask * depth, blend);

  return crackMask;
}
