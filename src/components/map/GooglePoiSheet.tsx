import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LatLng } from './types'
import { googleMapsDirectionsUrl } from './DirectionsLayer'

export interface GooglePoiSelection {
  placeId: string
  /** Coordinate from the click event — used as a fallback before details load. */
  location: LatLng
  /** Name from the click event when available (Google sometimes provides it). */
  name?: string
}

interface Props {
  poi: GooglePoiSelection
  onClose: () => void
}

interface ResolvedPoi {
  name: string
  category: string | null
  location: LatLng
}

/**
 * Phase 1.8 Part 3 — lightweight bottom sheet for a tapped Google POI.
 *
 * Google POIs are NOT XNEXT experiences; this sheet just makes the underlying
 * map useful (directions + a shortcut to seed a new experience here). It fetches
 * display details via the Places API (New); if that API isn't enabled it falls
 * back gracefully to the name/coordinate from the click event.
 */
export function GooglePoiSheet({ poi, onClose }: Props) {
  const navigate = useNavigate()
  const [resolved, setResolved] = useState<ResolvedPoi>({
    name: poi.name ?? 'Loading…',
    category: null,
    location: poi.location,
  })

  useEffect(() => {
    let cancelled = false
    setResolved({ name: poi.name ?? 'Loading…', category: null, location: poi.location })

    async function loadDetails() {
      try {
        const lib = (await google.maps.importLibrary(
          'places',
        )) as google.maps.PlacesLibrary
        const place = new lib.Place({ id: poi.placeId })
        await place.fetchFields({
          fields: ['displayName', 'primaryTypeDisplayName', 'location'],
        })
        if (cancelled) return
        const loc = place.location
        setResolved({
          name: place.displayName ?? poi.name ?? 'Map location',
          category: place.primaryTypeDisplayName ?? null,
          location: loc
            ? { lat: loc.lat(), lng: loc.lng() }
            : poi.location,
        })
      } catch {
        if (cancelled) return
        // Places API (New) may not be enabled — degrade gracefully.
        setResolved({
          name: poi.name ?? 'Map location',
          category: null,
          location: poi.location,
        })
      }
    }
    loadDetails()
    return () => {
      cancelled = true
    }
  }, [poi.placeId, poi.name, poi.location])

  const handleCreateHere = () => {
    navigate('/dashboard/quests/new', {
      state: {
        prefillLocation: resolved.location,
        prefillName: resolved.name === 'Loading…' ? '' : resolved.name,
      },
    })
  }

  return (
    <div className="poi-sheet" role="dialog" aria-label={resolved.name}>
      <button
        type="button"
        className="poi-sheet__close"
        aria-label="Close"
        onClick={onClose}
      >
        ✕
      </button>

      <div className="poi-sheet__head">
        <span className="poi-sheet__pin" aria-hidden="true">
          📍
        </span>
        <div className="poi-sheet__info">
          <span className="poi-sheet__name">{resolved.name}</span>
          {resolved.category && (
            <span className="poi-sheet__category">{resolved.category}</span>
          )}
          <span className="poi-sheet__source">On Google Maps</span>
        </div>
      </div>

      <div className="poi-sheet__actions">
        <a
          className="poi-sheet__btn"
          href={googleMapsDirectionsUrl(resolved.location)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Directions
        </a>
        <button
          type="button"
          className="poi-sheet__btn poi-sheet__btn--primary"
          onClick={handleCreateHere}
        >
          Create Experience Here
        </button>
      </div>
    </div>
  )
}
