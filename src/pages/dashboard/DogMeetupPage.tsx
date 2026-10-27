import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { dogMeetupService } from '../../services/dogMeetupService'
import { LocationPickerMap } from '../../components/map/LocationPickerMap'
import { useUserLocation } from '../../hooks/useUserLocation'
import type { LatLng } from '../../components/map/types'
import type { DogSize, Quest } from '../../lib/supabase/types'
import {
  DOG_SIZE_OPTIONS,
  MEETUP_DEFAULT_DURATION_HOURS,
  MEETUP_LIMITS,
  MEETUP_MAX_ADVANCE_DAYS,
  MEETUP_REVIEW_COPY,
  MEETUP_VISIBILITY_NOTICE,
  formatMeetupWhen,
  hasErrors,
  isMeetupExpired,
  meetupStatusLabel,
  resolveMeetupTimes,
  validateMeetupForm,
  type MeetupFormErrors,
} from '../../lib/dogMeetups'
import { PhotoError, prepareMeetupPhoto, type PreparedPhoto } from '../../lib/meetupPhoto'

const inputCls =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'mb-1 block text-sm font-medium text-foreground'
const errCls = 'mt-1 text-xs text-red-300'

function localDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * /dashboard/dog-meetups/new — propose a social dog playdate at a public place.
 * Every submission is reviewed by an admin before it appears. Not for breeding,
 * dog sales or services.
 */
export function DogMeetupPage() {
  const { position: userPos } = useUserLocation(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [locationName, setLocationName] = useState('')
  const [pin, setPin] = useState<LatLng | null>(null)
  const [dogSize, setDogSize] = useState<DogSize | ''>('')
  const [fenced, setFenced] = useState<'' | 'yes' | 'no'>('')
  const [leashInfo, setLeashInfo] = useState('')
  const [parkingInfo, setParkingInfo] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  // Date input bounds, fixed when the page opens.
  const [today] = useState(() => localDateInput(new Date()))
  const [maxDate] = useState(() => localDateInput(new Date(Date.now() + MEETUP_MAX_ADVANCE_DAYS * 86_400_000)))

  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [errors, setErrors] = useState<MeetupFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Quest | null>(null)
  const [mine, setMine] = useState<Quest[]>([])

  // Release the preview blob URL when it is replaced or the page unmounts.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.previewUrl) }, [photo])

  useEffect(() => {
    let alive = true
    void dogMeetupService.listMyMeetups().then((r) => { if (alive && r.data) setMine(r.data) })
    return () => { alive = false }
  }, [submitted])

  const handlePickPhoto = async (file: File | null | undefined) => {
    if (!file) return
    setPhotoError(null)
    setPhotoBusy(true)
    try {
      const prepared = await prepareMeetupPhoto(file)
      setPhoto(prepared)
    } catch (e) {
      setPhotoError(e instanceof PhotoError ? e.message : 'We could not use that photo. Please try another.')
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const location = pin ?? userPos

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const errs = validateMeetupForm({
      title, description, locationName,
      hasLocation: Boolean(location),
      date, startTime, endTime, dogSize, leashInfo, parkingInfo, acknowledged,
    })
    setErrors(errs)
    if (hasErrors(errs) || !location || !dogSize) return
    const times = resolveMeetupTimes(date, startTime, endTime)
    if (!times) return

    setSubmitting(true)
    const res = await dogMeetupService.submitMeetup({
      title, description, locationName, location,
      startsAt: times.startsAt, expiresAt: times.expiresAt,
      dogSize,
      fenced: fenced === '' ? null : fenced === 'yes',
      leashInfo, parkingInfo,
      photo: photo?.blob ?? null,
    })
    setSubmitting(false)
    if (res.error || !res.data) {
      setError(res.error ?? 'Could not submit your meetup.')
      return
    }
    setSubmitted(res.data)
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-xl font-semibold text-foreground">Meetup submitted</h1>
        <p className="rounded-md border border-border bg-card px-3 py-3 text-sm text-foreground" role="status">
          {MEETUP_REVIEW_COPY}
        </p>
        <p className="text-sm text-muted-foreground">
          {submitted.title} · {formatMeetupWhen(submitted) ?? ''}
        </p>
        <div className="flex gap-3">
          <Link to="/dashboard" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Back to the map
          </Link>
          <button
            type="button"
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
            onClick={() => {
              setSubmitted(null)
              setTitle(''); setDescription(''); setDate(''); setStartTime(''); setEndTime('')
              setLocationName(''); setDogSize(''); setFenced(''); setLeashInfo(''); setParkingInfo('')
              setAcknowledged(false); setPhoto(null); setErrors({})
            }}
          >
            Post another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Create a Dog Meetup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A friendly playdate at a public place. Social meetups only — no breeding, dog sales or services.
          Every meetup is reviewed before it appears on the map.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div>
          <label htmlFor="m-title" className={labelCls}>Title *</label>
          <input id="m-title" className={inputCls} value={title} maxLength={MEETUP_LIMITS.titleMax}
            placeholder="Saturday morning off-leash hour"
            onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} />
          {errors.title && <p className={errCls}>{errors.title}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="m-date" className={labelCls}>Date *</label>
            <input id="m-date" type="date" className={inputCls} min={today} max={maxDate}
              value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date)} />
            {errors.date && <p className={errCls}>{errors.date}</p>}
          </div>
          <div>
            <label htmlFor="m-start" className={labelCls}>Start time *</label>
            <input id="m-start" type="time" className={inputCls}
              value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-invalid={Boolean(errors.startTime)} />
            {errors.startTime && <p className={errCls}>{errors.startTime}</p>}
          </div>
          <div>
            <label htmlFor="m-end" className={labelCls}>End time</label>
            <input id="m-end" type="time" className={inputCls}
              value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-invalid={Boolean(errors.endTime)} />
            {errors.endTime && <p className={errCls}>{errors.endTime}</p>}
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Times are in your local time zone. Without an end time the meetup stays listed for {MEETUP_DEFAULT_DURATION_HOURS} hours after it starts.
        </p>

        <div>
          <label htmlFor="m-place" className={labelCls}>Public place *</label>
          <input id="m-place" className={inputCls} value={locationName} maxLength={MEETUP_LIMITS.locationNameMax}
            placeholder="Riverfront Dog Park, north gate"
            onChange={(e) => setLocationName(e.target.value)} aria-invalid={Boolean(errors.locationName)} />
          {errors.locationName && <p className={errCls}>{errors.locationName}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Use a public park or trail, never a private home.</p>
        </div>

        <div>
          <span className={labelCls}>Meeting spot *</span>
          <LocationPickerMap value={location} onChange={(loc) => setPin(loc)} />
          <p className="mt-1 text-xs text-muted-foreground">Drag the pin to the meeting spot.</p>
          {errors.location && <p className={errCls}>{errors.location}</p>}
        </div>

        <div>
          <label htmlFor="m-desc" className={labelCls}>Short description *</label>
          <textarea id="m-desc" className={inputCls} rows={3} maxLength={MEETUP_LIMITS.descriptionMax}
            placeholder="Relaxed hour for friendly dogs to play. Bring water and waste bags."
            value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(errors.description)} />
          {errors.description && <p className={errCls}>{errors.description}</p>}
        </div>

        <div>
          <span className={labelCls}>Dog size *</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Dog size">
            {DOG_SIZE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={dogSize === o.value}
                onClick={() => setDogSize(o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  dogSize === o.value
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {errors.dogSize && <p className={errCls}>{errors.dogSize}</p>}
        </div>

        <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs text-muted-foreground">Optional details</legend>
          <div>
            <label htmlFor="m-fenced" className={labelCls}>Fenced area?</label>
            <select id="m-fenced" className={inputCls} value={fenced}
              onChange={(e) => setFenced(e.target.value as '' | 'yes' | 'no')}>
              <option value="">Not sure / skip</option>
              <option value="yes">Fenced</option>
              <option value="no">Not fenced</option>
            </select>
          </div>
          <div>
            <label htmlFor="m-leash" className={labelCls}>Leash info</label>
            <input id="m-leash" className={inputCls} value={leashInfo} maxLength={MEETUP_LIMITS.infoMax}
              placeholder="Leashes required until the gate"
              onChange={(e) => setLeashInfo(e.target.value)} />
            {errors.leashInfo && <p className={errCls}>{errors.leashInfo}</p>}
          </div>
          <div>
            <label htmlFor="m-parking" className={labelCls}>Parking info</label>
            <input id="m-parking" className={inputCls} value={parkingInfo} maxLength={MEETUP_LIMITS.infoMax}
              placeholder="Free lot off Main St"
              onChange={(e) => setParkingInfo(e.target.value)} />
            {errors.parkingInfo && <p className={errCls}>{errors.parkingInfo}</p>}
          </div>
        </fieldset>

        <div>
          <span className={labelCls}>Dog photo (optional, one)</span>
          {photo ? (
            <div className="flex items-center gap-3">
              <img src={photo.previewUrl} alt="Selected dog photo preview" className="h-24 w-24 rounded-lg object-cover" />
              <div className="flex flex-col gap-2">
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
                  onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                  Replace
                </button>
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
                  onClick={() => { setPhoto(null); setPhotoError(null) }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              onClick={() => fileRef.current?.click()} disabled={photoBusy}>
              {photoBusy ? 'Preparing photo…' : 'Add a photo'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            data-testid="meetup-photo-input"
            onChange={(e) => void handlePickPhoto(e.target.files?.[0])}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Photos are resized on your device. Your photo stays private until an admin approves the meetup.
          </p>
          {photoError && <p className={errCls} role="alert">{photoError}</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-1" checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)} aria-invalid={Boolean(errors.acknowledged)} />
            <span>{MEETUP_VISIBILITY_NOTICE}</span>
          </label>
          {errors.acknowledged && <p className={errCls}>{errors.acknowledged}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting || photoBusy}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>

      {mine.length > 0 && (
        <section aria-label="Your dog meetups">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Your dog meetups</h2>
          <ul className="space-y-2">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{m.title}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {meetupStatusLabel(m.status, isMeetupExpired(m))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default DogMeetupPage
