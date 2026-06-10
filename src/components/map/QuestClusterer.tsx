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
}

/** Renders quest markers through MarkerClusterer (SuperCluster algorithm). */
export function QuestClusterer({ quests, selectedId, onSelect }: Props) {
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

    const markers = quests.map((quest) => {
      const pin = document.createElement('div')
      pin.className =
        'quest-pin' + (quest.id === selectedId ? ' quest-pin--selected' : '')
      pin.dataset.category = quest.experience_class

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: quest.lat, lng: quest.lng },
        content: pin,
        title: quest.title,
      })
      marker.addListener('click', () => onSelect(quest))
      return marker
    })

    c.clearMarkers()
    c.addMarkers(markers)

    return () => {
      c.clearMarkers()
    }
  }, [map, quests, selectedId, onSelect])

  return null
}
