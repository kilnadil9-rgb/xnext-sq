import type { CameraTarget } from './navTypes'
import { angleDeltaDegrees } from './routeEngine'

/**
 * NavigationAnimator — the only place that touches the map camera during
 * Adventure Navigation Mode.
 *
 * Two modes:
 *  - flyTo():  a one-shot cinematic tween (eased, cancellable) used by the
 *              route preview and the enter/exit transitions.
 *  - follow(): a continuous critically-damped chase used while navigating —
 *              every frame the camera eases toward a moving target, so GPS
 *              ticks NEVER snap the view. 60 fps via requestAnimationFrame,
 *              one moveCamera() call per frame, no React re-renders.
 */

/** Minimal surface of google.maps.Map we drive (keeps this testable). */
export interface CameraMap {
  moveCamera(camera: {
    center: { lat: number; lng: number }
    zoom: number
    heading: number
    tilt: number
  }): void
}

export type Easing = (t: number) => number

/** Smooth cinematic ease — gentle start, gentle landing. */
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpolate headings along the SHORTEST arc (no 350°→10° spin-arounds). */
function lerpHeading(from: number, to: number, t: number): number {
  return (from + angleDeltaDegrees(from, to) * t + 360) % 360
}

function interpolate(from: CameraTarget, to: CameraTarget, t: number): CameraTarget {
  return {
    center: {
      lat: lerp(from.center.lat, to.center.lat, t),
      lng: lerp(from.center.lng, to.center.lng, t),
    },
    zoom: lerp(from.zoom, to.zoom, t),
    heading: lerpHeading(from.heading, to.heading, t),
    tilt: lerp(from.tilt, to.tilt, t),
  }
}

export class NavigationAnimator {
  private map: CameraMap
  private raf: number | null = null
  /** The camera pose we last wrote — the source of truth for interpolation. */
  private current: CameraTarget
  /** Moving target for follow mode (updated from GPS between frames). */
  private followTarget: CameraTarget | null = null
  private lastFrameTs = 0
  /** Pending flyTo resolver — resolved false when the tween is interrupted. */
  private tweenResolve: ((completed: boolean) => void) | null = null

  constructor(map: CameraMap, initial: CameraTarget) {
    this.map = map
    this.current = initial
  }

  /** Latest pose the animator has written to the map. */
  get pose(): CameraTarget {
    return this.current
  }

  private apply(pose: CameraTarget): void {
    this.current = pose
    this.map.moveCamera({
      center: { lat: pose.center.lat, lng: pose.center.lng },
      zoom: pose.zoom,
      heading: pose.heading,
      tilt: pose.tilt,
    })
  }

  /** Stop whatever is running (tween or follow loop). */
  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.followTarget = null
    if (this.tweenResolve) {
      const resolve = this.tweenResolve
      this.tweenResolve = null
      resolve(false)
    }
  }

  /**
   * One-shot cinematic tween to `to` over `durationMs`. Resolves true when it
   * completes, false when interrupted (stop/flyTo/follow started mid-flight).
   */
  flyTo(to: CameraTarget, durationMs: number, easing: Easing = easeInOutCubic): Promise<boolean> {
    this.stop()
    const from = this.current
    const start = performance.now()
    return new Promise((resolve) => {
      this.tweenResolve = resolve
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        this.apply(interpolate(from, to, easing(t)))
        if (t >= 1) {
          this.raf = null
          this.tweenResolve = null
          resolve(true)
          return
        }
        this.raf = requestAnimationFrame(frame)
      }
      this.raf = requestAnimationFrame(frame)
    })
  }

  /**
   * Continuous chase mode. Call retarget() whenever GPS updates; the loop
   * critically damps toward the latest target every frame. `stiffness` ≈ how
   * fast the camera closes the gap (1/s) — higher = tighter follow.
   */
  follow(initialTarget: CameraTarget, stiffness = 2.2): void {
    this.stop()
    this.followTarget = initialTarget
    this.lastFrameTs = performance.now()
    const frame = (now: number) => {
      if (!this.followTarget) {
        this.raf = null
        return
      }
      const dt = Math.min(0.1, (now - this.lastFrameTs) / 1000)
      this.lastFrameTs = now
      // Exponential smoothing: frame-rate independent, never overshoots.
      const t = 1 - Math.exp(-stiffness * dt)
      this.apply(interpolate(this.current, this.followTarget, t))
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  /** Update the follow-mode target (no-op unless follow() is running). */
  retarget(target: CameraTarget): void {
    if (this.followTarget) this.followTarget = target
  }

  get isFollowing(): boolean {
    return this.followTarget !== null
  }
}
