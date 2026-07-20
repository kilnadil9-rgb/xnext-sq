import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../map/types'
import type { NavProgress, TravelMode } from './navTypes'
import { NavigationAnimator } from './NavigationAnimator'
import { offsetPoint, zoomForMode } from './routeEngine'

/**
 * CameraController — the Intelligent Dynamic Camera (Goal 2).
 *
 * While mounted it drives a continuous chase camera:
 *  - dynamic zoom from travel mode (walking 18–19 / city 16–17 / highway 14–15)
 *  - temporary zoom-in approaching a turn, easing back out afterwards
 *  - heading follows the ROUTE bearing (steadier than raw GPS heading)
 *  - ~50° tilt, user in the bottom third (camera centered ahead of the user)
 *  - every movement critically damped by NavigationAnimator — never snaps
 *
 * The user can drag to look around: dragging pauses the chase; the parent
 * shows a recenter control that re-engages it (`followEnabled`).
 */

/** Extra zoom applied as the next maneuver gets close. */
const TURN_ZOOM_BOOST = 1.6
/** Start boosting this many meters before the maneuver. */
const TURN_ZOOM_RANGE_M = 220
const NAV_TILT = 50

interface CameraControllerProps {
  animator: NavigationAnimator | null
  userPosition: LatLng | null
  progress: NavProgress | null
  travelMode: TravelMode
  /** False while the user is free-looking (drag) — chase paused. */
  followEnabled: boolean
}

export function CameraController({
  animator,
  userPosition,
  progress,
  travelMode,
  followEnabled,
}: CameraControllerProps) {
  const map = useMap()
  // Smoothed heading memory so route-bearing changes blend, not jump.
  const headingRef = useRef<number | null>(null)

  useEffect(() => {
    if (!animator || !map || !userPosition || !progress) return
    if (!followEnabled) {
      if (animator.isFollowing) animator.stop()
      return
    }

    const heading = progress.routeBearing
    headingRef.current = heading

    // Dynamic zoom: base per mode + smooth boost near the maneuver point.
    const base = zoomForMode(travelMode)
    const closeness = Math.max(0, 1 - progress.metersToNextManeuver / TURN_ZOOM_RANGE_M)
    const zoom = base + TURN_ZOOM_BOOST * closeness * closeness

    // User in the bottom third: center the camera AHEAD of the (snapped)
    // position along the heading, ~30% of the visible map height.
    const mapDiv = map.getDiv()
    const metersPerPixel = (156543.03392 * Math.cos((userPosition.lat * Math.PI) / 180)) / 2 ** zoom
    const aheadMeters = mapDiv.clientHeight * 0.3 * metersPerPixel
    const anchor = progress.offRouteMeters < 30 ? progress.snapped : userPosition
    const center = offsetPoint(anchor, heading, aheadMeters)

    const target = { center, zoom, heading, tilt: NAV_TILT }
    if (animator.isFollowing) animator.retarget(target)
    else animator.follow(target)
  }, [animator, map, userPosition, progress, travelMode, followEnabled])

  // Unmount → release the camera loop.
  useEffect(() => {
    return () => {
      animator?.stop()
    }
  }, [animator])

  return null
}
