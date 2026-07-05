import { useOnlineStatus } from '../../hooks/useOnlineStatus'

/**
 * Global offline banner (RC3). Renders nothing while online. While offline,
 * a slim fixed banner tells the user why data stopped moving — the radar
 * keeps showing its last cached results (see useNearbyQuests).
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '6px 12px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'system-ui, sans-serif',
        background: '#7c2d12',
        color: '#fed7aa',
      }}
    >
      📡 You’re offline — showing your last loaded experiences.
    </div>
  )
}
