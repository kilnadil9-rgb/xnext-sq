/**
 * MarkerPlacementFlow — "Leave a Marker" at a completed experience.
 *
 * Steps: choose tier (from real inventory) → optional note + photo →
 * explicit confirmation (Legacy gets its own weightier warning) → place.
 *
 * Every rule is re-validated server-side (place_explorer_marker); this UI is
 * honest about scarcity but is never the security boundary.
 */
import { useMemo, useState } from 'react'
import { markerService } from '../../services/markerService'
import { useMarkerInventory } from '../../hooks/useExplorerMarkers'
import {
  MARKER_NOTE_MAX_CHARS,
  MARKER_TIER_LABEL,
  MARKER_TIER_MEANING,
  MARKER_TIER_ORDER,
  validateMarkerNote,
  type ExplorerMarkerTier,
} from '../../lib/explorerMarkers'
import { MarkerTierIcon } from './MarkerTierIcon'
import { track } from '../../lib/analytics'
import {
  MARKER_CONTRIBUTION_TYPES,
  markerCommunity,
  markerTypeConfig,
  type MarkerContributionType,
} from '../../lib/discoveryCommunities'

interface Props {
  questId: string
  questTitle: string
  /** Existing experience photos the explorer may attach (no new upload in v1). */
  experiencePhotos: string[]
  onPlaced: () => void
  onCancel: () => void
}

type Step = 'tier' | 'details' | 'confirm'

export function MarkerPlacementFlow({
  questId,
  questTitle,
  experiencePhotos,
  onPlaced,
  onCancel,
}: Props) {
  const { inventory, loading } = useMarkerInventory()
  const [step, setStep] = useState<Step>('tier')
  const [tier, setTier] = useState<ExplorerMarkerTier | null>(null)
  // The Chase (2.0): what KIND of contribution this is — exactly one.
  const [markerType, setMarkerType] = useState<MarkerContributionType>('favorite_spot')
  const [note, setNote] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = useMemo(
    () => inventory.filter((r) => r.available > 0),
    [inventory],
  )
  const noteError = validateMarkerNote(note)

  const startCancel = () => {
    track('marker_placement_cancelled', { step })
    onCancel()
  }

  const chooseTier = (t: ExplorerMarkerTier) => {
    setTier(t)
    setStep('details')
    if (t === 'legacy') track('legacy_marker_started', {})
  }

  const confirm = async () => {
    if (!tier || placing) return
    setPlacing(true)
    setError(null)
    const res = await markerService.placeMarker({
      questId,
      tier,
      note: note.trim() || null,
      photoUrl,
      markerType,
      community: markerCommunity({ title: questTitle }, markerType),
    })
    setPlacing(false)
    if (res.error) {
      setError(res.error)
      return
    }
    track('marker_placement_confirmed', { tier })
    if (tier === 'legacy') track('legacy_marker_confirmed', {})
    onPlaced()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leave a Marker"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={startCancel}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-white/10 bg-[#0c1420] p-4 sm:rounded-3xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-black tracking-wide text-white">
              Leave a Marker
            </h3>
            <p className="text-xs text-white/50">{questTitle}</p>
          </div>
          <button
            type="button"
            onClick={startCancel}
            aria-label="Cancel"
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-white/50 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        {/* ── Step 1: choose a tier from real inventory ── */}
        {step === 'tier' && (
          <div>
            <p className="mb-3 text-sm text-white/60">
              Markers are limited — each one you place becomes part of your
              explorer journey.
            </p>
            {loading ? (
              <div className="h-32 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none" />
            ) : available.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
                No markers available yet. Your first Trail Markers unlock after
                your first verified experience.
              </div>
            ) : (
              <div className="space-y-2">
                {MARKER_TIER_ORDER.slice()
                  .reverse()
                  .map((t) => {
                    const row = available.find((r) => r.tier === t)
                    if (!row) return null
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => chooseTier(t)}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-[#f97316]/40 motion-reduce:transition-none"
                      >
                        <MarkerTierIcon tier={t} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white">
                            {MARKER_TIER_LABEL[t]}
                          </span>
                          <span className="block truncate text-[11px] text-white/45">
                            {MARKER_TIER_MEANING[t]}
                          </span>
                        </span>
                        <span className="rounded-full bg-[#f97316]/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-[#fdba74]">
                          {row.available} left
                        </span>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: note + optional photo ── */}
        {step === 'details' && tier && (
          <div>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <MarkerTierIcon tier={tier} />
              <div>
                <p className="text-sm font-semibold text-white">
                  {MARKER_TIER_LABEL[tier]} Marker
                </p>
                <p className="text-[11px] text-white/45">{MARKER_TIER_MEANING[tier]}</p>
              </div>
            </div>

            {/* The Chase: choose what KIND of contribution you're leaving. */}
            <p className="mb-1 text-xs text-white/50">
              What are you leaving for the next explorer?
            </p>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {MARKER_CONTRIBUTION_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setMarkerType(t.type)}
                  aria-pressed={markerType === t.type}
                  className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                    markerType === t.type
                      ? 'border-[#f97316] bg-[#f97316]/15 text-[#fdba74]'
                      : 'border-white/15 bg-white/5 text-white/60'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <label htmlFor="marker-note" className="mb-1 block text-xs text-white/50">
              {markerTypeConfig(markerType).prompt}
            </label>
            <textarea
              id="marker-note"
              value={note}
              maxLength={MARKER_NOTE_MAX_CHARS + 20}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What made this place matter to you?"
              className="h-20 w-full rounded-xl border border-white/20 bg-white/5 p-2.5 text-sm text-white placeholder:text-white/30"
            />
            <p
              className={`mt-0.5 text-right text-[11px] ${
                noteError ? 'text-red-400' : 'text-white/35'
              }`}
            >
              {note.trim().length}/{MARKER_NOTE_MAX_CHARS}
            </p>
            {noteError && (
              <p className="text-xs text-red-400" role="alert">
                {noteError}
              </p>
            )}

            {experiencePhotos.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-white/50">Attach a photo (optional)</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {experiencePhotos.slice(0, 4).map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPhotoUrl(photoUrl === url ? null : url)}
                      aria-pressed={photoUrl === url}
                      className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${
                        photoUrl === url ? 'border-[#f97316]' : 'border-white/15'
                      }`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('tier')}
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 px-3 text-sm text-white/60 hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!!noteError}
                onClick={() => {
                  setStep('confirm')
                  track('marker_placement_started', { tier })
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: explicit confirmation ── */}
        {step === 'confirm' && tier && (
          <div>
            <div
              className={`rounded-xl border p-4 ${
                tier === 'legacy'
                  ? 'border-[#f97316]/50 bg-[#f97316]/10'
                  : 'border-white/15 bg-white/5'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <MarkerTierIcon tier={tier} size={26} />
                <p className="text-sm font-semibold text-white">
                  {MARKER_TIER_LABEL[tier]} Marker at {questTitle}
                </p>
              </div>
              {tier === 'legacy' ? (
                <>
                  <p className="text-sm leading-relaxed text-[#fdba74]">
                    You only receive one Legacy Marker. Choose a place that
                    represents your journey.
                  </p>
                  <p className="mt-2 text-xs text-white/50">
                    You can change your mind for 24 hours. After that, this
                    marker becomes a permanent part of your legacy here.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-white/70">
                    You are leaving one of your limited{' '}
                    {MARKER_TIER_LABEL[tier]} Markers here. This marker will
                    become part of your explorer journey.
                  </p>
                  <p className="mt-2 text-xs text-white/50">
                    You can cancel within 24 hours. After that, it becomes a
                    permanent part of this place's trail.
                  </p>
                </>
              )}
              {note.trim() && (
                <p className="mt-2 border-t border-white/10 pt-2 text-xs italic text-white/60">
                  “{note.trim()}”
                </p>
              )}
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 px-3 text-sm text-white/60 hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={confirm}
                className="min-h-[44px] flex-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {placing
                  ? 'Placing…'
                  : tier === 'legacy'
                    ? 'Leave my Legacy Marker'
                    : 'Place Marker'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
