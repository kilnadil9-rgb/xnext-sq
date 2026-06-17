/**
 * HomePage — Phase 2: one living map experience
 *
 * Home is now the primary XNEXT screen. Rather than a second, static
 * "hover map", it reuses the proven Adventure Radar engine (MapScreen)
 * as the single source of truth for map behavior:
 *   - centers on the user's real location, then follows the camera
 *   - natural move/zoom (greedy gestures)
 *   - real clustered XNEXT quest pins + marker preview + directions
 *   - radius control + ranked nearby panel + helpful empty state
 *
 * The `cinematic` flag layers the XNEXT identity on top of that engine
 * (radar sweep/ring on the user dot + floating Adventure Radar HUD) and
 * trims chrome that the bottom nav already provides on Home.
 *
 * Discover / Timeline / Pulse / People sheets and the hero NEXT button are
 * provided by DashboardLayout's bottom nav, which overlays this screen — so
 * the whole flow (discover, submit, filter, preview, route) happens here
 * without navigating away.
 */
import MapScreen from '../../components/map/MapScreen'

export function HomePage() {
  return <MapScreen cinematic />
}

export default HomePage
