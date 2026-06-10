import { useEffect, useRef, useState } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { LatLng } from './types'

interface Props {
  onPlaceSelected?: (location: LatLng, name: string) => void
}

/** Debounced Places autocomplete with session tokens (billing-efficient). */
export function PlaceSearch({ onPlaceSelected }: Props) {
  const map = useMap()
  const places = useMapsLibrary('places')

  const [input, setInput] = useState('')
  const [predictions, setPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([])
  const [open, setOpen] = useState(false)

  const autocomplete = useRef<google.maps.places.AutocompleteService | null>(
    null,
  )
  const details = useRef<google.maps.places.PlacesService | null>(null)
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  )

  useEffect(() => {
    if (!places || !map) return
    autocomplete.current = new places.AutocompleteService()
    details.current = new places.PlacesService(map)
    session.current = new places.AutocompleteSessionToken()
  }, [places, map])

  useEffect(() => {
    if (!autocomplete.current || input.trim().length < 3) {
      setPredictions([])
      return
    }
    const timer = window.setTimeout(() => {
      autocomplete.current?.getPlacePredictions(
        {
          input,
          sessionToken: session.current ?? undefined,
          locationBias: map?.getBounds() ?? undefined,
        },
        (preds) => {
          setPredictions(preds ?? [])
          setOpen(true)
        },
      )
    }, 300)
    return () => window.clearTimeout(timer)
  }, [input, map])

  const select = (p: google.maps.places.AutocompletePrediction) => {
    if (!details.current) return
    details.current.getDetails(
      {
        placeId: p.place_id,
        fields: ['geometry.location', 'name'],
        sessionToken: session.current ?? undefined,
      },
      (place, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          return
        }
        const loc = place.geometry.location.toJSON()
        map?.panTo(loc)
        map?.setZoom(16)
        onPlaceSelected?.(loc, place.name ?? p.description)
        setInput(place.name ?? p.description)
        setPredictions([])
        setOpen(false)
        // A details call closes the session; start a new token.
        if (places) {
          session.current = new places.AutocompleteSessionToken()
        }
      },
    )
  }

  return (
    <div className="place-search">
      <input
        type="search"
        inputMode="search"
        placeholder="Search places…"
        value={input}
        aria-label="Search places"
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
      />
      {open && predictions.length > 0 && (
        <ul className="place-search__results" role="listbox">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button type="button" onClick={() => select(p)}>
                <strong>{p.structured_formatting.main_text}</strong>
                <span>{p.structured_formatting.secondary_text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
