import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  APIProvider,
  Map,
  useMap,
  type MapCameraChangedEvent,
} from '@vis.gl/react-google-maps'
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
} from '@googlemaps/markerclusterer'
import { useAuth } from '../../hooks/useAuth'
import {
  listingService,
  listingNeedsAttention,
  type AdminMapListing,
} from '../../services/listingService'
import { MAPS_API_KEY, MAPS_MAP_ID, XNEXT_MAP_STYLES } from '../../components/map/mapsConfig'
import { MapErrorBoundary } from '../../components/map/MapErrorBoundary'
import { VerifiedBadge } from '../../components/ui/VerifiedBadge'

/**
 * XNEXT Command Center — the admin operations dashboard (formerly the
 * Discovery Map). Admin-only. Everything is computed from REAL rows returned
 * by admin_map_listings (migrations 024/025) — no fake numbers anywhere.
 *
 *  - Summary cards: live platform counts across the top
 *  - National map: every listing/quest, any status, clustered + color-coded
 *  - Global search: venue / city / quest / business / partner → instant zoom
 *  - Timeline: Today / Yesterday / 7d / 30d upload windows
 *  - Market statistics: per-city live/pending/verified/partner counts
 *  - Travel Here: camera-only Adventure Radar market preview (QA/moderation)
 */

const US_CENTER = { lat: 39.5, lng: -98.35 }
const US_ZOOM = 4

// ── Status filters ────────────────────────────────────────────────────────────

type MapFilter =
  | 'all'
  | 'pending'
  | 'published'
  | 'paid'
  | 'partner'
  | 'yard_sale'
  | 'events'
  | 'verified'
  | 'attention'

const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'published', label: 'Published' },
  { value: 'paid', label: 'Paid' },
  { value: 'partner', label: 'Monthly Partner' },
  { value: 'yard_sale', label: 'Yard Sales' },
  { value: 'events', label: 'Events' },
  { value: 'verified', label: 'Verified' },
  { value: 'attention', label: 'Needs Attention' },
]

function matchesFilter(l: AdminMapListing, f: MapFilter): boolean {
  switch (f) {
    case 'all':
      return true
    case 'pending':
      return l.status === 'pending_review'
    case 'published':
      return l.status === 'published'
    case 'paid':
      return l.is_paid_listing
    case 'partner':
      return l.tier === 'monthly_partner'
    case 'yard_sale':
      return l.listing_type === 'yard_sale'
    case 'events':
      return (
        l.listing_type === 'local_event' ||
        l.listing_type === 'community_event' ||
        l.listing_type === 'market_show'
      )
    case 'verified':
      return l.verified_location
    case 'attention':
      return listingNeedsAttention(l)
    default:
      return true
  }
}

// ── Timeline (upload windows — platform growth lens) ─────────────────────────

type TimeRange = 'all' | 'today' | 'yesterday' | '7d' | '30d'

const TIMELINES: { value: TimeRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
]

function startOfDay(offsetDays = 0): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.getTime()
}

function inTimeRange(iso: string, range: TimeRange): boolean {
  if (range === 'all') return true
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  switch (range) {
    case 'today':
      return t >= startOfDay(0)
    case 'yesterday':
      return t >= startOfDay(-1) && t < startOfDay(0)
    case '7d':
      return t >= Date.now() - 7 * 86_400_000
    case '30d':
      return t >= Date.now() - 30 * 86_400_000
    default:
      return true
  }
}

// ── Visual helpers ────────────────────────────────────────────────────────────

function pinColor(l: AdminMapListing): string {
  if (listingNeedsAttention(l) && l.status !== 'pending_review') return '#ef4444'
  if (l.status === 'pending_review') return '#f97316'
  if (l.status === 'published') return '#22c55e'
  return '#6b7280'
}

function photoCount(l: AdminMapListing): number {
  return Array.isArray(l.media_urls) ? l.media_urls.length : 0
}

function placeLabel(l: AdminMapListing): string {
  return (
    [l.city, l.country_code].filter(Boolean).join(', ') ||
    l.location_name ||
    `${l.lat.toFixed(3)}, ${l.lng.toFixed(3)}`
  )
}

// ── Market statistics (grouped by city — the location field we store) ────────

interface MarketStats {
  city: string
  lat: number
  lng: number
  total: number
  live: number
  pending: number
  verified: number
  partners: number
  today: number
  last7: number
}

function buildMarkets(listings: AdminMapListing[]): MarketStats[] {
  const byCity = new globalThis.Map<string, AdminMapListing[]>()
  for (const l of listings) {
    const city = l.city?.trim()
    if (!city) continue
    const rows = byCity.get(city)
    if (rows) rows.push(l)
    else byCity.set(city, [l])
  }
  const markets: MarketStats[] = []
  byCity.forEach((rows, city) => {
    markets.push({
      city,
      lat: rows.reduce((s, r) => s + r.lat, 0) / rows.length,
      lng: rows.reduce((s, r) => s + r.lng, 0) / rows.length,
      total: rows.length,
      live: rows.filter((r) => r.status === 'published').length,
      pending: rows.filter((r) => r.status === 'pending_review').length,
      verified: rows.filter((r) => r.verified_location).length,
      partners: rows.filter((r) => r.tier === 'monthly_partner').length,
      today: rows.filter((r) => inTimeRange(r.created_at, 'today')).length,
      last7: rows.filter((r) => inTimeRange(r.created_at, '7d')).length,
    })
  })
  return markets.sort((a, b) => b.total - a.total)
}

// ── Global search: venue / city / quest / business / partner ─────────────────

function searchListings(listings: AdminMapListing[], query: string): AdminMapListing[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return listings
    .filter((l) => {
      const haystack = [
        l.title,
        l.city,
        l.country_code,
        l.location_name,
        l.business_name,
        l.listing_type,
        l.tier === 'monthly_partner' ? 'monthly partner' : l.tier,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
    .slice(0, 8)
}

// ── Clustered, status-colored admin pins ─────────────────────────────────────

function AdminPinsLayer({
  listings,
  selectedId,
  onSelect,
}: {
  listings: AdminMapListing[]
  selectedId: string | null
  onSelect: (l: AdminMapListing) => void
}) {
  const map = useMap()
  const clusterer = useRef<MarkerClusterer | null>(null)

  useEffect(() => {
    if (!map || clusterer.current) return
    clusterer.current = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({ radius: 70, maxZoom: 15 }),
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

    const markers = listings
      .map((l) => {
        if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return null

        const pin = document.createElement('div')
        pin.style.cssText =
          'position:relative;width:18px;height:18px;border-radius:50%;' +
          `background:${pinColor(l)};border:2px solid #fff;` +
          'box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:pointer;' +
          (l.id === selectedId ? 'transform:scale(1.5);z-index:5;' : '')
        if (l.verified_location) {
          const check = document.createElement('span')
          check.textContent = '✓'
          check.style.cssText =
            'position:absolute;top:-7px;right:-7px;width:13px;height:13px;' +
            'border-radius:50%;background:#3b82f6;color:#fff;font-size:9px;' +
            'line-height:13px;text-align:center;font-weight:700;'
          pin.appendChild(check)
        }
        if (l.is_featured || l.tier === 'monthly_partner') {
          const star = document.createElement('span')
          star.textContent = '★'
          star.style.cssText =
            'position:absolute;bottom:-8px;right:-7px;color:#fbbf24;' +
            'font-size:11px;text-shadow:0 1px 2px rgba(0,0,0,0.6);'
          pin.appendChild(star)
        }

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: l.lat, lng: l.lng },
          content: pin,
          title: `${l.title} — ${l.status}`,
        })
        marker.addListener('click', () => onSelect(l))
        return marker
      })
      .filter((m): m is google.maps.marker.AdvancedMarkerElement => m !== null)

    c.clearMarkers()
    c.addMarkers(markers)
    return () => {
      c.clearMarkers()
    }
  }, [map, listings, selectedId, onSelect])

  return null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminDiscoveryMapPage() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  const [listings, setListings] = useState<AdminMapListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MapFilter>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AdminMapListing | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<MarketStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [camera, setCamera] = useState<{
    center: { lat: number; lng: number }
    zoom: number
  }>({ center: US_CENTER, zoom: US_ZOOM })

  // Redirect non-admins once the profile resolves (mirrors AdminReviewPage).
  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_admin) navigate('/dashboard', { replace: true })
  }, [profile, authLoading, navigate])

  // All setState happens AFTER the await so effect calls never set state
  // synchronously during render.
  const load = useCallback(async () => {
    const res = await listingService.adminMapListings()
    if (res.error) {
      setError(res.error)
      setLoading(false)
      return
    }
    setError(null)
    setListings(res.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading && profile?.is_admin) void load()
  }, [authLoading, profile, load])

  // ── Derived data (all from real rows) ───────────────────────────────────────

  const summary = useMemo(
    () => ({
      pending: listings.filter((l) => l.status === 'pending_review').length,
      live: listings.filter((l) => l.status === 'published').length,
      verified: listings.filter((l) => l.verified_location).length,
      partners: listings.filter((l) => l.tier === 'monthly_partner').length,
      attention: listings.filter(listingNeedsAttention).length,
      today: listings.filter((l) => inTimeRange(l.created_at, 'today')).length,
    }),
    [listings],
  )

  const visible = useMemo(
    () =>
      listings.filter(
        (l) => matchesFilter(l, filter) && inTimeRange(l.created_at, timeRange),
      ),
    [listings, filter, timeRange],
  )

  const markets = useMemo(() => buildMarkets(listings), [listings])
  const searchResults = useMemo(
    () => searchListings(listings, search),
    [listings, search],
  )

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelect = useCallback((l: AdminMapListing) => {
    setSelected(l)
  }, [])

  const focusListing = useCallback((l: AdminMapListing) => {
    setSelected(l)
    setCamera((cam) => ({
      center: { lat: l.lat, lng: l.lng },
      zoom: Math.max(cam.zoom, 11),
    }))
  }, [])

  const focusMarket = useCallback((m: MarketStats) => {
    setSelectedMarket(m)
    setCamera({ center: { lat: m.lat, lng: m.lng }, zoom: 10 })
  }, [])

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCamera({ center: ev.detail.center, zoom: ev.detail.zoom })
  }, [])

  const applyModeration = useCallback(
    async (l: AdminMapListing, approve: boolean) => {
      setBusy(true)
      const res = await listingService.updateListing(l.id, {
        status: approve ? 'published' : 'archived',
        published_at: approve ? new Date().toISOString() : undefined,
      })
      setBusy(false)
      if (res.error) {
        setError(res.error)
        return
      }
      setListings((prev) =>
        prev.map((row) =>
          row.id === l.id
            ? {
                ...row,
                status: approve ? 'published' : 'archived',
                published_at: approve ? new Date().toISOString() : row.published_at,
              }
            : row,
        ),
      )
      setSelected((cur) =>
        cur && cur.id === l.id
          ? { ...cur, status: approve ? 'published' : 'archived' }
          : cur,
      )
      window.dispatchEvent(new CustomEvent('xnext-quest-created'))
    },
    [],
  )

  // Admin-only market preview: camera-only, never touches real GPS.
  const travelHere = useCallback(
    (l: AdminMapListing) => {
      sessionStorage.setItem(
        'xnext-admin-travel',
        JSON.stringify({ lat: l.lat, lng: l.lng, label: placeLabel(l) }),
      )
      navigate('/dashboard')
    },
    [navigate],
  )

  if (authLoading || !profile?.is_admin) return null

  if (!MAPS_API_KEY) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Map is not configured (VITE_GOOGLE_MAPS_API_KEY missing).
      </p>
    )
  }

  const summaryCards: { label: string; value: number; accent?: string }[] = [
    { label: 'Pending Review', value: summary.pending, accent: '#f97316' },
    { label: 'Live Listings', value: summary.live, accent: '#22c55e' },
    { label: 'Verified Locations', value: summary.verified, accent: '#3b82f6' },
    { label: 'Monthly Partners', value: summary.partners, accent: '#fbbf24' },
    { label: 'Needs Attention', value: summary.attention, accent: '#ef4444' },
    { label: "Today's Uploads", value: summary.today },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">XNEXT Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operations dashboard for moderators — every listing nationwide, live counts, market stats.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {/* ── Dashboard summary (live counts, no fake numbers) ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-lg font-bold text-foreground" style={c.accent ? { color: c.accent } : undefined}>
              {loading ? '—' : c.value}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── Global search + timeline ── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative w-full max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search venue, city, quest, business, partner…"
            aria-label="Global search"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchResults.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-xl">
              {searchResults.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      focusListing(l)
                      setSearch('')
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent"
                  >
                    <span className="flex items-center gap-1.5">
                      <span style={{ color: pinColor(l) }}>●</span>
                      <span className="truncate font-medium text-foreground">{l.title}</span>
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {placeLabel(l)}
                      {l.business_name ? ` · ${l.business_name}` : ''}
                      {l.tier === 'monthly_partner' ? ' · ★ Partner' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Timeline">
          {TIMELINES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={timeRange === t.value}
              onClick={() => setTimeRange(t.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                timeRange === t.value
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Status filters ── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f.value
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            {f.label}
            {f.value === 'pending' && summary.pending > 0 && ` (${summary.pending})`}
            {f.value === 'attention' && summary.attention > 0 && ` (${summary.attention})`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Legend */}
      <p className="text-[11px] text-muted-foreground">
        <span className="text-[#f97316]">●</span> Pending{' · '}
        <span className="text-[#22c55e]">●</span> Live{' · '}
        <span className="text-[#ef4444]">●</span> Needs attention{' · '}
        <span className="text-[#6b7280]">●</span> Draft/archived{' · '}
        <span className="text-[#3b82f6]">✓</span> Verified{' · '}
        <span className="text-[#fbbf24]">★</span> Featured/Partner
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── National map ── */}
        <div className="relative h-[62vh] overflow-hidden rounded-xl border border-border">
          <MapErrorBoundary>
            <APIProvider apiKey={MAPS_API_KEY} libraries={['marker']}>
              <Map
                mapId={MAPS_MAP_ID}
                center={camera.center}
                zoom={camera.zoom}
                gestureHandling="greedy"
                disableDefaultUI={false}
                reuseMaps
                onCameraChanged={handleCameraChanged}
                className="h-full w-full"
                styles={XNEXT_MAP_STYLES}
              >
                <AdminPinsLayer
                  listings={visible}
                  selectedId={selected?.id ?? null}
                  onSelect={handleSelect}
                />
              </Map>
            </APIProvider>
          </MapErrorBoundary>

          {loading && (
            <div className="absolute left-3 top-3 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white">
              Loading listings…
            </div>
          )}

          {/* Lightweight preview card (tap a pin) */}
          {selected && (
            <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-md rounded-xl border border-border bg-card/95 p-3 text-sm shadow-xl backdrop-blur">
              <div className="flex items-start gap-2.5">
                {photoCount(selected) > 0 && (
                  <img
                    src={(selected.media_urls ?? [])[0]}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">
                      {selected.title}
                      {selected.verified_location && (
                        <>
                          {' '}
                          <VerifiedBadge size={14} />
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      aria-label="Close preview"
                      onClick={() => setSelected(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {placeLabel(selected)}
                    {' · '}
                    {selected.listing_type ?? 'organic quest'}
                    {' · '}
                    <span className="capitalize">{selected.status.replace('_', ' ')}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {new Date(selected.created_at).toLocaleDateString()}
                    {selected.tier ? ` · ${selected.tier}` : ''}
                    {` · ${photoCount(selected)} photo${photoCount(selected) !== 1 ? 's' : ''}`}
                    {selected.creator_trust_score != null
                      ? ` · trust ${selected.creator_trust_score}`
                      : ''}
                  </p>
                </div>
              </div>

              {(selected.external_url || selected.ticket_url) && (
                <p className="mt-1 flex gap-3 text-xs">
                  {selected.external_url && (
                    <a href={selected.external_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      🔗 Website
                    </a>
                  )}
                  {selected.ticket_url && (
                    <a href={selected.ticket_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      🎟️ Tickets
                    </a>
                  )}
                </p>
              )}

              {photoCount(selected) > 1 && (
                <div className="mt-2 flex gap-1.5">
                  {(selected.media_urls ?? []).slice(1, 3).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {selected.status === 'pending_review' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyModeration(selected, true)}
                    className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                  >
                    ✓ Approve
                  </button>
                )}
                {selected.status !== 'archived' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyModeration(selected, false)}
                    className="rounded border border-red-500/50 px-2.5 py-1 font-semibold text-red-400 disabled:opacity-50"
                  >
                    ✕ Reject
                  </button>
                )}
                <Link
                  to={selected.listing_type ? '/dashboard/admin/listings' : '/dashboard/admin/review'}
                  className="rounded border border-border px-2.5 py-1 hover:bg-accent"
                >
                  Review
                </Link>
                <button
                  type="button"
                  onClick={() => travelHere(selected)}
                  className="rounded border border-primary/60 px-2.5 py-1 font-semibold text-primary"
                  title="Preview Adventure Radar as if you were in this market (QA only)"
                >
                  🧭 Travel Here
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar: market statistics + newest-first queue ── */}
        <aside className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-2">
          {/* Selected market stats */}
          {selectedMarket && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">{selectedMarket.city}</p>
                <button
                  type="button"
                  aria-label="Clear market"
                  onClick={() => setSelectedMarket(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>Live Listings</dt><dd className="font-semibold text-[#22c55e]">{selectedMarket.live}</dd></div>
                <div className="flex justify-between"><dt>Pending</dt><dd className="font-semibold text-[#f97316]">{selectedMarket.pending}</dd></div>
                <div className="flex justify-between"><dt>Verified</dt><dd className="font-semibold text-[#3b82f6]">{selectedMarket.verified}</dd></div>
                <div className="flex justify-between"><dt>Partners</dt><dd className="font-semibold text-[#fbbf24]">{selectedMarket.partners}</dd></div>
                <div className="flex justify-between"><dt>Today's Uploads</dt><dd className="font-semibold text-foreground">{selectedMarket.today}</dd></div>
                <div className="flex justify-between"><dt>Last 7 Days</dt><dd className="font-semibold text-foreground">{selectedMarket.last7}</dd></div>
              </dl>
            </div>
          )}

          {/* Top markets (grouped by stored city) */}
          {markets.length > 0 && (
            <div>
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Markets
              </p>
              <ul className="flex flex-wrap gap-1 px-1">
                {markets.slice(0, 8).map((m) => (
                  <li key={m.city}>
                    <button
                      type="button"
                      onClick={() => focusMarket(m)}
                      aria-pressed={selectedMarket?.city === m.city}
                      className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                        selectedMarket?.city === m.city
                          ? 'border-primary bg-primary/15 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {m.city} ({m.total})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Newest-first queue */}
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Newest first · {visible.length}
          </p>
          {!loading && visible.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              Nothing matches this filter/time window.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {visible.slice(0, 100).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => focusListing(l)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${
                    selected?.id === l.id ? 'bg-accent' : ''
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span style={{ color: pinColor(l) }}>●</span>
                    <span className="truncate font-medium text-foreground">{l.title}</span>
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {placeLabel(l)} · {new Date(l.created_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

export default AdminDiscoveryMapPage
