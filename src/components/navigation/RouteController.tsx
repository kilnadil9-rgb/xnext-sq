import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import type { NavRoute } from './navTypes'

/**
 * RouteController — renders the Adventure Mode route with a soft glow
 * (Goal 10) and a cinematic draw-on animation for the preview (Goal 8).
 *
 * Two stacked polylines: a wide low-opacity halo + the bright core line.
 * Rerenders only when the route itself changes (`routeVersion`), never on
 * GPS ticks. Unmounting removes both lines.
 */

const CORE_COLOR = '#f97316' // XNEXT orange (matches the existing route line)
const GLOW_COLOR = '#fb923c'

interface RouteControllerProps {
  route: NavRoute | null
  /** Bump to re-draw (new route / reroute). */
  routeVersion: number
  /** Animate the line drawing itself in (preview); false = instant. */
  animateDraw: boolean
  /** Called once the draw-on animation finishes. */
  onDrawComplete?: () => void
}

export function RouteController({
  route,
  routeVersion,
  animateDraw,
  onDrawComplete,
}: RouteControllerProps) {
  const map = useMap()
  const coreRef = useRef<google.maps.Polyline | null>(null)
  const glowRef = useRef<google.maps.Polyline | null>(null)
  const rafRef = useRef<number | null>(null)
  const onDrawCompleteRef = useRef(onDrawComplete)
  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete
  }, [onDrawComplete])

  useEffect(() => {
    if (!map || !route) return

    const glow = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: GLOW_COLOR,
      strokeOpacity: 0.25,
      strokeWeight: 12,
      zIndex: 40,
      clickable: false,
    })
    const core = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: CORE_COLOR,
      strokeOpacity: 0.95,
      strokeWeight: 5,
      zIndex: 41,
      clickable: false,
    })
    glowRef.current = glow
    coreRef.current = core

    const fullPath = route.path
    if (!animateDraw) {
      glow.setPath(fullPath)
      core.setPath(fullPath)
      onDrawCompleteRef.current?.()
    } else {
      // Draw-on: reveal the path over ~1.2 s, eased, at 60 fps.
      const DURATION = 1200
      const start = performance.now()
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION)
        const eased = 1 - Math.pow(1 - t, 3)
        const count = Math.max(2, Math.round(eased * fullPath.length))
        const partial = fullPath.slice(0, count)
        glow.setPath(partial)
        core.setPath(partial)
        if (t >= 1) {
          rafRef.current = null
          onDrawCompleteRef.current?.()
          return
        }
        rafRef.current = requestAnimationFrame(frame)
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      glow.setMap(null)
      core.setMap(null)
      glowRef.current = null
      coreRef.current = null
    }
    // Redraw only on route changes — never GPS ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeVersion, route === null])

  return null
}
