import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
} from '@googlemaps/markerclusterer'
import type { NearbyQuest } from '../../lib/supabase/types'

interface Props {
  quests: NearbyQuest[]
  selectedId: string | null
  onSelect: (quest: NearbyQuest) => void
  isLive?: boolean
}

/** Renders quest markers through MarkerClusterer (SuperCluster algorithm). */
export function QuestClusterer({ quests, selectedId, onSelect, isLive }: Props) {
  const map = useMap()
  const clusterer = useRef<MarkerClusterer | null>(null)

  useEffect(() => {
    if (!map || clusterer.current) return
    clusterer.current = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 16 }),
    })
    return () => {
      clusterer.current?.clearMarkers()
      clusterer.current?.setMap(null)
      clusterer.current = null
    }
  }, [map])

  useEffect(() => {
    const c = clusterer.current
    if (!map || !c) return

    const markers = quests
      .map((quest) => {
        // Defensive: a quest with a missing/invalid coordinate (e.g. an RPC
        // that doesn't return lat/lng, or null geometry) must never crash the
        // whole map. Coerce and skip anything that isn't a finite number.
        const lat = Number(quest.lat)
        const lng = Number(quest.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          if (import.meta.env.DEV) {
            console.warn(
              '[QuestClusterer] skipping quest with invalid coords',
              quest.id,
              quest.lat,
              quest.lng,
            )
          }
          return null
        }

        const pin = document.createElement('div')
        pin.className =
          'quest-pin' + (quest.id === selectedId ? ' quest-pin--selected' : '') + (isLive ? ' live-glow' : '')
        pin.dataset.category = quest.experience_class

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          content: pin,
          title: quest.title,
        })
        marker.addListener('click', () => onSelect(quest))
        return marker
      })
      .filter(
        (m): m is google.maps.marker.AdvancedMarkerElement => m !== null,
      )

    c.clearMarkers()
    c.addMarkers(markers)

    return () => {
      c.clearMarkers()
    }
  }, [map, quests, selectedId, onSelect])

  return null
}
