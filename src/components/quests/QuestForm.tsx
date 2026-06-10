import { useState, type FormEvent } from 'react'
import type { ExperienceClass, Quest } from '../../lib/supabase/types'
import type { CreateQuestInput } from '../../services/questService'
import type { LatLng } from '../map/types'
import { LocationPickerMap } from '../map/LocationPickerMap'
import { parseWkbHexPoint } from '../../lib/geo'

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
  submitLabel: string
  submitting: boolean
  onSubmit: (values: QuestFormValues) => void
}

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'

const labelClass = 'mb-1 block text-sm font-medium text-foreground'

/** Shared create/edit quest form (mobile-first, single column). */
export function QuestForm({
  initialQuest,
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
    initialQuest ? parseWkbHexPoint(initialQuest.location_point) : null,
  )
  const [locationName, setLocationName] = useState(
    initialQuest?.location_name ?? '',
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
  const [validationError, setValidationError] = useState<string | null>(null)

  const handlePick = (loc: LatLng, placeName?: string) => {
    setLocation(loc)
    if (placeName && !locationName) setLocationName(placeName)
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
    setValidationError(null)

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
        <p className="text-sm text-red-600" role="alert">
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
