import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  userQuestPreferencesService,
  DEFAULT_PREFERENCES,
} from '../../services/userQuestPreferencesService'
import type {
  ExperienceClass,
  PulseFrequency,
} from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

const CLASSES: { value: ExperienceClass; label: string; hint: string }[] = [
  { value: 'wonder', label: 'Wonder', hint: 'Awe, nature, the unexpected' },
  { value: 'opportunity', label: 'Opportunity', hint: 'Rare chances, openings' },
  { value: 'transformation', label: 'Transformation', hint: 'Growth, challenge' },
  { value: 'connection', label: 'Connection', hint: 'People, community' },
]

const RADIUS_OPTIONS_KM = [1, 2.5, 5, 10, 25, 50]
const FREQUENCIES: { value: PulseFrequency; label: string }[] = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
]

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-primary'
const labelClass = 'mb-1 block text-sm font-medium text-foreground'

/** /dashboard/preferences — tune what the Adventure Radar surfaces. */
export function PreferencesPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [classes, setClasses] = useState<ExperienceClass[]>([])
  const [radiusKm, setRadiusKm] = useState<number>(
    DEFAULT_PREFERENCES.max_distance_km ?? 50,
  )
  const [tagsInput, setTagsInput] = useState('')
  const [pulseEnabled, setPulseEnabled] = useState(true)
  const [pulseMinSq, setPulseMinSq] = useState(70)
  const [pulseFrequency, setPulseFrequency] = useState<PulseFrequency>('daily')

  useEffect(() => {
    let cancelled = false
    userQuestPreferencesService.getMyPreferences().then((result) => {
      if (cancelled) return
      if (result.error) {
        setLoadError(result.error)
      } else if (result.data) {
        setClasses(result.data.preferred_classes)
        setRadiusKm(Number(result.data.max_distance_km))
        setTagsInput(result.data.preferred_tags.join(', '))
        setPulseEnabled(result.data.pulse_enabled)
        setPulseMinSq(Number(result.data.pulse_min_sq_score))
        setPulseFrequency(result.data.pulse_frequency)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleClass = (value: ExperienceClass) => {
    setSaved(false)
    setClasses((prev) =>
      prev.includes(value)
        ? prev.filter((c) => c !== value)
        : [...prev, value],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)

    const result = await userQuestPreferencesService.saveMyPreferences({
      preferred_classes: classes,
      preferred_tags: tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 15),
      max_distance_km: radiusKm,
      pulse_enabled: pulseEnabled,
      pulse_min_sq_score: pulseMinSq,
      pulse_frequency: pulseFrequency,
    })

    setSaving(false)
    if (result.error) {
      setSaveError(result.error)
      return
    }
    setSaved(true)
  }

  if (loading) return <LoadingState message="Loading preferences…" />
  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => location.reload()} />
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Your adventure preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Adventure Radar uses these to decide what to surface first.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <fieldset>
          <legend className={labelClass}>
            What kind of experiences are you after?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLASSES.map((c) => {
              const active = classes.includes(c.value)
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleClass(c.value)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-accent'
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">
                    {active ? '✓ ' : ''}
                    {c.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.hint}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave all unselected to see everything equally.
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pref-radius" className={labelClass}>
              Default search radius
            </label>
            <select
              id="pref-radius"
              className={inputClass}
              value={radiusKm}
              onChange={(e) => {
                setSaved(false)
                setRadiusKm(Number(e.target.value))
              }}
            >
              {RADIUS_OPTIONS_KM.map((r) => (
                <option key={r} value={r}>
                  {r < 1 ? `${r * 1000} m` : `${r} km`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pref-tags" className={labelClass}>
              Favorite tags (comma-separated)
            </label>
            <input
              id="pref-tags"
              className={inputClass}
              value={tagsInput}
              placeholder="hiking, food, photography"
              onChange={(e) => {
                setSaved(false)
                setTagsInput(e.target.value)
              }}
            />
          </div>
        </div>

        <fieldset className="rounded-xl border border-border bg-card p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            Pulse alerts
          </legend>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={pulseEnabled}
              onChange={(e) => {
                setSaved(false)
                setPulseEnabled(e.target.checked)
              }}
            />
            Alert me when a high-SQ quest appears nearby
          </label>

          {pulseEnabled && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pref-min-sq" className={labelClass}>
                  Minimum SQ score: {pulseMinSq}
                </label>
                <input
                  id="pref-min-sq"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pulseMinSq}
                  className="w-full"
                  onChange={(e) => {
                    setSaved(false)
                    setPulseMinSq(Number(e.target.value))
                  }}
                />
              </div>
              <div>
                <label htmlFor="pref-frequency" className={labelClass}>
                  Frequency
                </label>
                <select
                  id="pref-frequency"
                  className={inputClass}
                  value={pulseFrequency}
                  onChange={(e) => {
                    setSaved(false)
                    setPulseFrequency(e.target.value as PulseFrequency)
                  }}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </fieldset>

        {saveError && (
          <p
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            {saveError}
          </p>
        )}
        {saved && (
          <p
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
            role="status"
          >
            Preferences saved — the{' '}
            <Link to="/dashboard/map" className="underline">
              Adventure Radar
            </Link>{' '}
            will use them from now on.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  )
}

export default PreferencesPage
