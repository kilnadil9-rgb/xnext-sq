import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { LatLng } from '../map/types'
import type { RankedQuest } from '../../lib/adventureRadar'
import type { CameraTarget } from './navTypes'
import { NavigationAnimator } from './NavigationAnimator'
import { useNavigationSession } from './useNavigationSession'
import { CameraController } from './CameraController'
import { RouteController } from './RouteController'
import { TurnCard } from './TurnCard'
import { NavigationHUD } from './NavigationHUD'
import { ArrivalPanel } from './ArrivalPanel'
import { ExploreAlongRoute } from './ExploreAlongRoute'
import { bearingDegrees, offsetPoint, zoomForMode } from './routeEngine'
import { isVoiceMuted, setVoiceMuted, stopSpeaking } from './VoiceController'
import './navigation.css'

/**
 * AdventureNavigation — the Adventure Navigation Mode orchestrator (Goal 1).
 *
 * Mounted by MapScreen when LET'S GO is pressed; unmounted when the journey
 * ends. Composes the modular pieces (Goal 12): session engine, camera,
 * route renderer, turn card, HUD, voice, arrival celebration, discoveries.
 *
 * Cinematic entry (Goals 1 + 8, skippable):
 *   dim UI → fly to route overview → route draws itself → fly behind the
 *   user (heading-aligned, ~50° tilt) → "Adventure starts now." → chase cam.
 */

/** Preview pacing (total ≈ 3.6 s, within the 3–5 s target). */
const OVERVIEW_FLY_MS = 1100
const BEHIND_FLY_MS = 1400
const EXIT_FLY_MS = 800

/** Speed below which we consider the traveller stopped (arrival panel gate). */
const STOPPED_MPS = 1.5

interface AdventureNavigationProps {
  destination: LatLng
  destinationTitle: string
  /** The quest being navigated to (null for bare POI destinations). */
  quest: RankedQuest | null
  /** Radar quests already in memory — fuels Explore Along Route. */
  nearbyQuests: RankedQuest[]
  userPosition: LatLng | null
  userSpeed: number | null
  accuracy: number | null
  /** Journey over (completed or abandoned) — parent restores discovery UI. */
  onExit: () => void
  /** A discovery card was tapped — parent opens that quest. */
  onSelectDiscovery: (questId: string) => void
  /** Route could not be fetched (API denied / error) — parent shows fallback. */
  onRouteError: (kind: 'denied' | 'error') => void
}

export function AdventureNavigation({
  destination,
  destinationTitle,
  quest,
  nearbyQuests,
  userPosition,
  userSpeed,
  accuracy,
  onExit,
  onSelectDiscovery,
  onRouteError,
}: AdventureNavigationProps) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')

  const session = useNavigationSession({
    routesLib,
    destination,
    destinationTitle,
    userPosition,
    userSpeed,
    accuracy,
    onRouteError,
  })
  const { phase, route, progress, travelMode, rerouting, routeVersion } = session

  const [followEnabled, setFollowEnabled] = useState(true)
  const [dimming, setDimming] = useState(true)
  const [muted, setMuted] = useState(isVoiceMuted)
  const [routeDrawn, setRouteDrawn] = useState(false)
  const previewDoneRef = useRef(false)

  // ── Animator lifecycle — one animator per map instance. ────────────────────
  const animator = useMemo(() => {
    if (!map) return null
    return new NavigationAnimator(map, {
      center: map.getCenter()?.toJSON() ?? destination,
      zoom: map.getZoom() ?? 14,
      heading: map.getHeading() ?? 0,
      tilt: map.getTilt() ?? 0,
    })
    // The animator binds to the map only — destination is just the initial pose fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    return () => {
      animator?.stop()
      stopSpeaking()
    }
  }, [animator])

  /** The chase pose behind the user — shared by preview landing and skip. */
  const behindUserPose = useCallback((): CameraTarget | null => {
    if (!map || !userPosition || !route) return null
    const heading = bearingDegrees(route.path[0], route.path[Math.min(8, route.path.length - 1)])
    const zoom = zoomForMode(travelMode)
    const metersPerPixel =
      (156543.03392 * Math.cos((userPosition.lat * Math.PI) / 180)) / 2 ** zoom
    const ahead = map.getDiv().clientHeight * 0.3 * metersPerPixel
    return { center: offsetPoint(userPosition, heading, ahead), zoom, heading, tilt: 50 }
  }, [map, userPosition, route, travelMode])

  /** Compute a camera pose that frames the whole route (overview shot). */
  const overviewPose = useCallback((): CameraTarget | null => {
    if (!map || !route) return null
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const p of route.path) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }
    const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
    const div = map.getDiv()
    const latMeters = (maxLat - minLat) * 111_320 * 1.4 || 500
    const lngMeters =
      (maxLng - minLng) * 111_320 * Math.cos((center.lat * Math.PI) / 180) * 1.4 || 500
    const zoomFor = (span: number, px: number) =>
      Math.log2((156543.03392 * Math.cos((center.lat * Math.PI) / 180) * px) / span)
    const zoom = Math.min(
      17,
      Math.max(4, Math.min(zoomFor(lngMeters, div.clientWidth), zoomFor(latMeters, div.clientHeight))),
    )
    return { center, zoom, heading: 0, tilt: 0 }
  }, [map, route])

  const finishPreview = useCallback(() => {
    if (previewDoneRef.current) return
    previewDoneRef.current = true
    setDimming(false)
    session.beginNavigating()
  }, [session])

  // ── Cinematic entry: overview fly → (route draws) → fly behind user. ───────
  useEffect(() => {
    if (!animator || !route || phase !== 'preview' || previewDoneRef.current) return
    const overview = overviewPose()
    if (!overview) return
    let cancelled = false
    void (async () => {
      const done = await animator.flyTo(overview, OVERVIEW_FLY_MS)
      if (!done || cancelled || previewDoneRef.current) return
      // RouteController is drawing the line meanwhile; give it its moment.
      // (routeDrawn flips when the draw-on animation completes.)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animator, route, phase])

  // Route finished drawing → descend behind the user and start the adventure.
  useEffect(() => {
    if (!animator || phase !== 'preview' || !routeDrawn || previewDoneRef.current) return
    const behind = behindUserPose()
    if (!behind) {
      finishPreview()
      return
    }
    let cancelled = false
    void animator.flyTo(behind, BEHIND_FLY_MS).then(() => {
      if (!cancelled) finishPreview()
    })
    return () => {
      cancelled = true
    }
  }, [animator, phase, routeDrawn, behindUserPose, finishPreview])

  // Skip: jump straight into the chase (Goal 8 — always skippable).
  const handleSkipPreview = useCallback(() => {
    if (!animator) return
    animator.stop()
    const behind = behindUserPose()
    if (behind) {
      void animator.flyTo(behind, 450).then(() => finishPreview())
    } else {
      finishPreview()
    }
  }, [animator, behindUserPose, finishPreview])

  // ── Free-look: dragging pauses the chase; recenter resumes it. ─────────────
  useEffect(() => {
    if (!map || phase !== 'navigating') return
    const listener = map.addListener('dragstart', () => setFollowEnabled(false))
    return () => listener.remove()
  }, [map, phase])

  const handleRecenter = useCallback(() => setFollowEnabled(true), [])

  const handleToggleMute = useCallback(() => {
    setMuted((m) => {
      setVoiceMuted(!m)
      return !m
    })
  }, [])

  // ── Exit: gently settle the camera flat, then hand back to discovery. ──────
  const exitingRef = useRef(false)
  const handleEnd = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    session.endSession()
    const settle = async () => {
      if (animator && userPosition) {
        await animator.flyTo(
          { center: userPosition, zoom: 14, heading: 0, tilt: 0 },
          EXIT_FLY_MS,
        )
      }
      onExit()
    }
    void settle()
  }, [animator, userPosition, session, onExit])

  // ── Arrival panel gating (Goal 6): only after the traveller stops. ─────────
  // Stopped → celebrate almost immediately; still rolling → wait it out.
  // Never interrupts driving.
  const [showArrival, setShowArrival] = useState(false)
  useEffect(() => {
    if (phase !== 'arrived') return
    const stopped = userSpeed === null || userSpeed <= STOPPED_MPS
    const t = window.setTimeout(() => setShowArrival(true), stopped ? 250 : 4000)
    return () => window.clearTimeout(t)
  }, [phase, userSpeed])

  const showPreviewChrome = phase === 'preview'
  const showNavChrome = phase === 'navigating'

  const destPin = useMemo(
    () => (
      <AdvancedMarker position={destination} title={destinationTitle}>
        <div className="nav2-dest-pin" aria-label={`Destination: ${destinationTitle}`} />
      </AdvancedMarker>
    ),
    [destination, destinationTitle],
  )

  return (
    <>
      {/* Map-layer children */}
      {destPin}
      <RouteController
        route={route}
        routeVersion={routeVersion}
        animateDraw={phase === 'preview'}
        onDrawComplete={() => setRouteDrawn(true)}
      />
      {showNavChrome && (
        <CameraController
          animator={animator}
          userPosition={userPosition}
          progress={progress}
          travelMode={travelMode}
          followEnabled={followEnabled}
        />
      )}

      {/* Screen-layer chrome */}
      <div className="nav2-root">
        {showPreviewChrome && (
          <>
            {dimming && <div className="nav2-dim" aria-hidden />}
            <button type="button" className="nav2-preview-skip" onClick={handleSkipPreview}>
              Skip ▸
            </button>
          </>
        )}

        {showNavChrome && route && progress && <TurnCard route={route} progress={progress} />}

        {showNavChrome && (
          <NavigationHUD
            progress={progress}
            speedMps={userSpeed}
            muted={muted}
            onToggleMute={handleToggleMute}
            showRecenter={!followEnabled}
            onRecenter={handleRecenter}
            onEnd={handleEnd}
            rerouting={rerouting}
          />
        )}

        {showNavChrome && (
          <ExploreAlongRoute
            quests={nearbyQuests}
            route={route}
            progress={progress}
            destinationId={quest?.id ?? null}
            onSelect={onSelectDiscovery}
          />
        )}

        {phase === 'arrived' && showArrival && (
          <ArrivalPanel
            quest={quest}
            destinationTitle={destinationTitle}
            onComplete={handleEnd}
          />
        )}
      </div>
    </>
  )
}
