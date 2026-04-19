import * as THREE from 'three'

/**
 * Screen-space God Rays (Crytek radial blur method).
 *
 * Seeds rays exclusively from a dedicated mask texture (`tMask`) that
 * contains ONLY the star — rendered via a layer isolation pass. This prevents
 * bright non-stellar pixels (gas planets, surface highlights, lens flare glows)
 * near the sun UV from polluting the ray accumulation.
 *
 * Variable ray lengths: angular noise (overlapping sine harmonics) modulates
 * the weight per direction — some angles produce long bright rays, others
 * nearly nothing, giving an organic star-burst pattern.
 *
 * Pass order: RenderPass → GodRaysShaderPass → UnrealBloomPass → OutputPass
 * Rays are bloomed by UnrealBloomPass, giving them a soft organic glow.
 */
export const GodRaysShader = {
  name: 'GodRaysShader',

  uniforms: {
    tDiffuse:  { value: null as THREE.Texture | null },
    /** Star-only render (black everywhere else). Seeds all ray contributions. */
    tMask:     { value: null as THREE.Texture | null },
    /** Sun position in UV space [0,1]. Updated every frame from camera projection. */
    uSunUV:    { value: new THREE.Vector2(0.5, 0.5) },
    /** Overall brightness of rays */
    uExposure: { value: 0.7 },
    /** Attenuation per sample step (closer to 1 = longer rays) */
    uDecay:    { value: 0.5 },
    /** Step stretch factor */
    uDensity:  { value: 0.7 },
    /** Per-sample weight before angular modulation */
    uWeight:   { value: 0.4 },
    /** 0–1 fade: 0 when sun is off-screen or behind camera */
    uEnabled:  { value: 1.0 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform vec2      uSunUV;
    uniform float     uExposure;
    uniform float     uDecay;
    uniform float     uDensity;
    uniform float     uWeight;
    uniform float     uEnabled;

    varying vec2 vUv;

    const int SAMPLES = 40;

    // Angular noise: overlapping sine harmonics at different frequencies.
    // Produces an irregular spoke pattern — some directions are bright (long
    // rays), others near-zero (gaps), giving a natural star-burst look.
    float rayStrengthAtAngle(float a) {
      float s = sin(a *  3.0)        * 0.40
              + sin(a *  7.0 + 1.20) * 0.25
              + sin(a * 13.0 + 2.50) * 0.20
              + sin(a * 19.0 + 0.80) * 0.10
              + sin(a * 31.0 + 3.70) * 0.05;
      // Remap [-1,1] → [0,1], then soft-clip quiet directions toward zero
      return smoothstep(0.05, 0.90, s * 0.5 + 0.5);
    }

    void main() {
      vec2 dir = vUv - uSunUV;

      // Ray strength for this screen direction — constant along the whole ray
      float angle     = atan(dir.y, dir.x);
      float rayFactor = rayStrengthAtAngle(angle);

      vec2  pos   = vUv;
      vec2  delta = dir * (1.0 / float(SAMPLES)) * uDensity;

      float decay = 1.0;
      vec3  rays  = vec3(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        // Early exit when accumulated decay drops below perceptual threshold
        if (decay < 0.01) break;

        pos -= delta;

        // Sample the isolated star mask — tMask is black everywhere except the
        // star, so any non-zero value is guaranteed to come from the sun itself.
        vec4 s = texture2D(tMask, clamp(pos, 0.001, 0.999));

        float bright     = max(s.r, max(s.g, s.b));
        float distToSun  = length(pos - uSunUV);
        float proxWeight = 1.0 - smoothstep(0.05, 0.14, distToSun);
        float mask       = smoothstep(0.02, 0.30, bright) * proxWeight;

        rays  += s.rgb * mask * decay * uWeight * rayFactor;
        decay *= uDecay;
      }

      vec4 scene   = texture2D(tDiffuse, vUv);
      gl_FragColor = scene + vec4(rays * uExposure * uEnabled, 0.0);
    }
  `,
}
