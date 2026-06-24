import { useState, type FormEvent } from 'react'
import type { ExperienceClass, Quest } from '../../lib/supabase/types'
import type { CreateQuestInput } from '../../services/questService'
import type { LatLng } from '../map/types'
import { LocationPickerMap } from '../map/LocationPickerMap'
import { parseWkbHexPoint } from '../../lib/geo'
import {
  SEASON_TAGS,
  SEASON_BADGES,
  monthsForSeasons,
  seasonsForMonths,
  type SeasonTag,
} from '../../lib/season'

const EXPERIENCE_CLASSES: { value: ExperienceClass; label: string }[] = [
  { value: 'wonder', label: 'Wonder' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'transformation', label: 'Transformation' },
  { value: 'connection', label: 'Connection' },
]

export type QuestFormValues = CreateQuestInput

interface Props {
  /** Existing quest when editing; omit when creating. */
  initialQuest?: Quest
  /** Seed a coordinate when creating (e.g. "Create Experience Here" from a POI). */
  initialLocation?: LatLng | null
  /** Seed the place name alongside initialLocation. */
  initialLocationName?: string
  submitLabel: string
  submitting: boolean
  onSubmit: (values: QuestFormValues) => void
}

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'

const labelClass = 'mb-1 block text-sm font-medium text-foreground'

/** ISO timestamp → yyyy-mm-dd for <input type="date">. */
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** yyyy-mm-dd → ISO at start (or end) of that day in UTC. */
function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null
  return endOfDay ? `${value}T23:59:59.000Z` : `${value}T00:00:00.000Z`
}

/** Shared create/edit quest form (mobile-first, single column). */
export function QuestForm({
  initialQuest,
  initialLocation = null,
  initialLocationName,
  submitLabel,
  submitting,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initialQuest?.title ?? '')
  const [description, setDescription] = useState(
    initialQuest?.description ?? '',
  )
  const [experienceClass, setExperienceClass] = useState<ExperienceClass>(
    initialQuest?.experience_class ?? 'wonder',
  )
  const [location, setLocation] = useState<LatLng | null>(
    initialQuest ? parseWkbHexPoint(initialQuest.location_point) : initialLocation,
  )
  const [locationName, setLocationName] = useState(
    initialQuest?.location_name ?? initialLocationName ?? '',
  )
  const [city, setCity] = useState(initialQuest?.city ?? '')
  const [countryCode, setCountryCode] = useState(
    initialQuest?.country_code ?? '',
  )
  const [tagsInput, setTagsInput] = useState(
    (initialQuest?.tags ?? []).join(', '),
  )
  const [externalUrl, setExternalUrl] = useState(
    initialQuest?.external_url ?? '',
  )

  // ── Seasonal (Phase 1.8) ──────────────────────────────────────────────────
  const initialSeasons: SeasonTag[] = (() => {
    const tags = (initialQuest?.season_tags ?? []).filter((t): t is SeasonTag =>
      (SEASON_TAGS as string[]).includes(t),
    )
    if (tags.length > 0) return tags
    if (initialQuest?.active_months?.length) {
      return seasonsForMonths(initialQuest.active_months)
    }
    return []
  })()
  const initialSpecificDates = Boolean(
    initialQuest?.start_date && initialQuest?.end_date,
  )
  const [seasons, setSeasons] = useState<Set<SeasonTag>>(
    new Set(initialSeasons),
  )
  const [yearRound, setYearRound] = useState(
    initialQuest
      ? Boolean(initialQuest.is_evergreen) &&
          initialSeasons.length === 0 &&
          !initialSpecificDates
      : true,
  )
  const [specificDates, setSpecificDates] = useState(initialSpecificDates)
  const [startDate, setStartDate] = useState(
    isoToDateInput(initialQuest?.start_date),
  )
  const [endDate, setEndDate] = useState(isoToDateInput(initialQuest?.end_date))

  // ── Parking coordinate (Phase 1.8 Part 4) ─────────────────────────────────
  const initialParking = initialQuest
    ? parseWkbHexPoint(initialQuest.parking_point)
    : null
  const [hasParking, setHasParking] = useState(Boolean(initialParking))
  const [parking, setParking] = useState<LatLng | null>(initialParking)

  const [validationError, setValidationError] = useState<string | null>(null)

  const handlePick = (loc: LatLng, placeName?: string) => {
    setLocation(loc)
    if (placeName && !locationName) setLocationName(placeName)
  }

  const toggleSeason = (tag: SeasonTag) => {
    setSeasons((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else {
        next.add(tag)
        setYearRound(false) // picking a season means it's not purely evergreen
      }
      return next
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim().length < 3) {
      setValidationError('Title must be at least 3 characters.')
      return
    }
    if (!location) {
      setValidationError(
        'Pick a location on the map — quests surface on the Adventure Radar by proximity.',
      )
      return
    }
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode.trim())) {
      setValidationError('Country code must be 2 letters (e.g. ES).')
      return
    }
    if (specificDates) {
      if (!startDate || !endDate) {
        setValidationError('Add both a start and end date, or untick Specific Dates.')
        return
      }
      if (startDate > endDate) {
        setValidationError('Start date must be on or before the end date.')
        return
      }
    }
    setValidationError(null)

    const seasonTags = [...seasons]
    const activeMonths = monthsForSeasons(seasonTags)
    // Evergreen when explicitly chosen, or when nothing time-bound is set.
    const isEvergreen =
      yearRound || (seasonTags.length === 0 && !specificDates)

    onSubmit({
      title,
      description: description || null,
      experience_class: experienceClass,
      location,
      location_name: locationName || null,
      city: city || null,
      country_code: countryCode || null,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
      external_url: externalUrl || null,
      season_tags: seasonTags,
      active_months: activeMonths,
      start_date: specificDates ? dateInputToIso(startDate) : null,
      end_date: specificDates ? dateInputToIso(endDate, true) : null,
      is_evergreen: isEvergreen,
      parking: hasParking ? parking : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="quest-title" className={labelClass}>
          Title *
        </label>
        <input
          id="quest-title"
          className={inputClass}
          value={title}
          maxLength={120}
          required
          placeholder="Sunrise swim at the hidden cove"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="quest-class" className={labelClass}>
          Experience class *
        </label>
        <select
          id="quest-class"
          className={inputClass}
          value={experienceClass}
          onChange={(e) =>
            setExperienceClass(e.target.value as ExperienceClass)
          }
        >
          {EXPERIENCE_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="quest-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="quest-description"
          className={inputClass}
          rows={4}
          maxLength={2000}
          placeholder="What makes this worth someone's morning?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <span className={labelClass}>Location *</span>
        <LocationPickerMap value={location} onChange={handlePick} />
        <p className="mt-1 text-xs text-muted-foreground">
          {location
            ? `Pinned at ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : 'Tap the map, search a place, or use your position.'}
        </p>
      </div>

      {/* ── Best Time To Experience This (Phase 1.8) ──────────────────────── */}
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium text-foreground">
          Best Time To Experience This
        </legend>
        <p className="mb-2 text-xs text-muted-foreground">
          Helps XNEXT surface this when it&rsquo;s actually worth the trip. Pick
          year-round, one or more seasons, or a specific date window.
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              className="accent-primary"
              checked={yearRound}
              onChange={(e) => {
                setYearRound(e.target.checked)
                if (e.target.checked) {
                  setSeasons(new Set())
                  setSpecificDates(false)
                }
              }}
            />
            {SEASON_BADGES.evergreen.emoji} Year Round
          </label>

          {SEASON_TAGS.map((tag) => (
            <label
              key={tag}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={seasons.has(tag)}
                onChange={() => toggleSeason(tag)}
              />
              {SEASON_BADGES[tag].emoji} {SEASON_BADGES[tag].label}
            </label>
          ))}

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              className="accent-primary"
              checked={specificDates}
              onChange={(e) => {
                setSpecificDates(e.target.checked)
                if (e.target.checked) setYearRound(false)
              }}
            />
            📅 Specific Dates
          </label>
        </div>

        {specificDates && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="quest-start-date" className={labelClass}>
                Start date
              </label>
              <input
                id="quest-start-date"
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quest-end-date" className={labelClass}>
                End date
              </label>
              <input
                id="quest-end-date"
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Parking / drive-to coordinate (Phase 1.8 Part 4) ──────────────── */}
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium text-foreground">
          Parking
        </legend>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="accent-primary"
            checked={hasParking}
            onChange={(e) => {
              setHasParking(e.target.checked)
              if (!e.target.checked) setParking(null)
            }}
          />
          This experience has a separate parking area
        </label>
        {hasParking && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Drop the spot people should drive to. LET&rsquo;S GO will navigate
              here; the experience itself stays at the pin above.
            </p>
            <LocationPickerMap value={parking} onChange={(loc) => setParking(loc)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {parking
                ? `Parking at ${parking.lat.toFixed(5)}, ${parking.lng.toFixed(5)}`
                : 'Tap the map or search the parking area / trailhead.'}
            </p>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="quest-location-name" className={labelClass}>
            Place name
          </label>
          <input
            id="quest-location-name"
            className={inputClass}
            value={locationName}
            maxLength={120}
            placeholder="Cala Granadella"
            onChange={(e) => setLocationName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="quest-city" className={labelClass}>
            City
          </label>
          <input
            id="quest-city"
            className={inputClass}
            value={city}
            maxLength={80}
            placeholder="Jávea"
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="quest-country" className={labelClass}>
            Country code
          </label>
          <input
            id="quest-country"
            className={inputClass}
            value={countryCode}
            maxLength={2}
            placeholder="ES"
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label htmlFor="quest-tags" className={labelClass}>
            Tags (comma-separated)
          </label>
          <input
            id="quest-tags"
            className={inputClass}
            value={tagsInput}
            placeholder="swimming, sunrise, free"
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="quest-url" className={labelClass}>
          External link
        </label>
        <input
          id="quest-url"
          className={inputClass}
          type="url"
          value={externalUrl}
          placeholder="https://…"
          onChange={(e) => setExternalUrl(e.target.value)}
        />
      </div>

      {validationError && (
        <p
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {validationError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
