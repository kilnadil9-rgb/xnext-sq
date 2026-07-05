import { useEffect, useState } from 'react'

/**
 * Online/offline awareness (RC3). Backed by navigator.onLine + events —
 * imperfect (a connected-but-dead network still reads "online") but exactly
 * right for the beta cases that matter: airplane mode, dead zones, tunnels.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
