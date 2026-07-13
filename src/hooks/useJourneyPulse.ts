/**
 * Journey Pulse hook — loads the private momentum indicator for the current
 * user. Failure never blocks the People sheet: the pill renders its own
 * unavailable state and the tabs keep working.
 */
import { useEffect, useState } from 'react'
import {
  journeyPulseService,
  type JourneyPulseData,
} from '../services/journeyPulseService'

export function useJourneyPulse(enabled = true) {
  const [data, setData] = useState<JourneyPulseData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    journeyPulseService.getMyJourneyPulse().then((res) => {
      if (cancelled) return
      if (res.data) setData(res.data)
      setError(res.error)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { pulse: data, loading: enabled && !loaded, error }
}
