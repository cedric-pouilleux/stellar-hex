import { Timer } from 'three'

/**
 * Lightweight animation-frame loop with FPS sampling.
 * Returns a stop function.
 */
export function startRenderLoop(
  step: (dt: number, elapsed: number) => void,
  onFps?: (fps: number) => void,
): () => void {
  const timer = new Timer()
  if (typeof document !== 'undefined') timer.connect(document)

  let raf = 0
  let acc = 0
  let frames = 0

  const tick = (ts: number) => {
    raf = requestAnimationFrame(tick)
    timer.update(ts)
    const dt = timer.getDelta()
    step(dt, timer.getElapsed())
    frames += 1
    acc += dt
    if (acc >= 0.5) {
      onFps?.(Math.round(frames / acc))
      acc = 0; frames = 0
    }
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    timer.dispose()
  }
}
