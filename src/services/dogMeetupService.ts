/**
 * Dog Meetups service — submit, report, and admin moderation.
 *
 * Every submission is inserted as `pending_review`; the database (migration
 * 031 guard trigger + restrictive RLS) refuses anything else from non-admins.
 * The optional photo goes to the PRIVATE bucket `meetup-photos-pending`; only
 * after an admin approves is a copy placed in the public `meetup-photos`
 * bucket. A pending photo never has a public URL.
 */
import { supabase } from '../lib/supabase/client'
import type { DogSize, Quest } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { questSlug, toEwktPoint } from '../lib/geo'
import type { LatLng } from '../components/map/types'

export const PENDING_BUCKET = 'meetup-photos-pending'
export const PUBLIC_BUCKET = 'meetup-photos'

export interface SubmitMeetupInput {
  title: string
  description: string
  locationName: string
  location: LatLng
  startsAt: Date
  expiresAt: Date
  dogSize: DogSize
  fenced: boolean | null
  leashInfo: string
  parkingInfo: string
  /** Already resized/compressed JPEG from prepareMeetupPhoto, or null. */
  photo: Blob | null
}

function newFileName(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${id}.jpg`
}

/** Friendlier text for the errors the database guard can raise. */
function friendly(message: string): string {
  if (/in the past/i.test(message)) return 'The start time is in the past. Pick a time that has not happened yet.'
  if (/too far in the future/i.test(message)) return 'Meetups can be posted up to 90 days ahead.'
  if (/quests_dog_meetup_fields_chk/i.test(message)) return 'Please check the details: all required fields must be filled in and the end time must be after the start.'
  if (/invalid input value for enum/i.test(message) || /dog_meetup/i.test(message) && /enum/i.test(message))
    return 'Dog Meetups are not available yet. Please try again later.'
  if (/column .*(dog_|does not exist)|schema cache/i.test(message)) return 'Dog Meetups are not available yet. Please try again later.'
  return message
}

export const dogMeetupService = {
  /** Submit a meetup for review. Always lands as pending_review. */
  async submitMeetup(input: SubmitMeetupInput): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Sign in to create a dog meetup.' }

    let photoPath: string | null = null
    if (input.photo) {
      photoPath = `${user.id}/${newFileName()}`
      const { error: upErr } = await supabase.storage.from(PENDING_BUCKET).upload(photoPath, input.photo, {
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (upErr) {
        return {
          data: null,
          error: `The photo could not be uploaded (${upErr.message}). You can remove the photo and submit without it.`,
        }
      }
    }

    const { data, error } = await supabase
      .from('quests')
      .insert({
        created_by: user.id,
        slug: questSlug(input.title),
        title: input.title.trim(),
        description: input.description.trim(),
        experience_class: 'connection',
        listing_type: 'dog_meetup',
        status: 'pending_review', // the DB rejects anything else from non-admins
        location_name: input.locationName.trim(),
        location_point: toEwktPoint(input.location),
        location_radius_m: 100,
        tags: ['dog-meetup'],
        starts_at: input.startsAt.toISOString(),
        expires_at: input.expiresAt.toISOString(),
        dog_size: input.dogSize,
        dog_fenced: input.fenced,
        dog_leash_info: input.leashInfo.trim() || null,
        dog_parking_info: input.parkingInfo.trim() || null,
        dog_photo_pending_path: photoPath,
      } as never)
      .select('*')
      .single()

    if (error || !data) {
      // Do not leave an orphaned private upload behind.
      if (photoPath) await supabase.storage.from(PENDING_BUCKET).remove([photoPath]).catch(() => undefined)
      return { data: null, error: friendly(extractMessage(error)) }
    }
    return { data: data as Quest, error: null }
  },

  /** The signed-in user's own meetups (any status). */
  async listMyMeetups(): Promise<ServiceResult<Quest[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .eq('created_by', user.id)
      .eq('listing_type', 'dog_meetup')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data ?? []) as Quest[], error: null }
  },

  // ── Reporting ──────────────────────────────────────────────────────────────
  /** Returns true if recorded, false if the user had already reported it. */
  async reportQuest(
    questId: string,
    reason: QuestReportReason,
    details?: string,
  ): Promise<ServiceResult<boolean>> {
    const text = details?.trim() ?? ''
    if (text.length > 500) return { data: null, error: 'Please keep details under 500 characters.' }
    const { data, error } = await supabase.rpc('report_quest' as never, {
      p_quest_id: questId,
      p_reason: reason,
      p_details: text || null,
    } as never)
    if (error) {
      const msg = extractMessage(error)
      if (/sign in/i.test(msg)) return { data: null, error: 'Sign in to report a meetup.' }
      if (/too many/i.test(msg)) return { data: null, error: 'You have sent a lot of reports today. Please try again later.' }
      return { data: null, error: msg }
    }
    return { data: Boolean(data), error: null }
  },

  // ── Admin: review queue ────────────────────────────────────────────────────
  async listPendingMeetups(): Promise<ServiceResult<Quest[]>> {
    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .eq('listing_type', 'dog_meetup')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data ?? []) as Quest[], error: null }
  },

  /** Short-lived signed URL for an admin to look at a pending (private) photo. */
  async getPendingPhotoUrl(path: string): Promise<ServiceResult<string>> {
    const { data, error } = await supabase.storage.from(PENDING_BUCKET).createSignedUrl(path, 600)
    if (error || !data?.signedUrl) return { data: null, error: extractMessage(error) }
    return { data: data.signedUrl, error: null }
  },

  /**
   * Approve: copy the private photo (if any) into the public bucket, flip the
   * row to published via the admin-only RPC, then delete the private original.
   */
  async approveMeetup(quest: Pick<Quest, 'id' | 'dog_photo_pending_path'>): Promise<ServiceResult<null>> {
    let publicPath: string | null = null
    let publicUrl: string | null = null

    if (quest.dog_photo_pending_path) {
      const dl = await supabase.storage.from(PENDING_BUCKET).download(quest.dog_photo_pending_path)
      if (dl.error || !dl.data) {
        return { data: null, error: `Could not read the pending photo: ${extractMessage(dl.error)}` }
      }
      publicPath = `${quest.id}/${newFileName()}`
      const up = await supabase.storage.from(PUBLIC_BUCKET).upload(publicPath, dl.data, {
        contentType: dl.data.type || 'image/jpeg',
        upsert: false,
      })
      if (up.error) return { data: null, error: `Could not publish the photo: ${up.error.message}` }
      publicUrl = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath).data.publicUrl
    }

    const { data, error } = await supabase.rpc('approve_dog_meetup' as never, {
      p_quest_id: quest.id,
      p_public_photo_url: publicUrl,
    } as never)
    if (error) {
      if (publicPath) await supabase.storage.from(PUBLIC_BUCKET).remove([publicPath]).catch(() => undefined)
      return { data: null, error: extractMessage(error) }
    }
    const oldPath = (data as string | null) ?? quest.dog_photo_pending_path
    if (oldPath) await supabase.storage.from(PENDING_BUCKET).remove([oldPath]).catch(() => undefined)
    return { data: null, error: null }
  },

  /** Reject / take down: archives the row and deletes any private photo. */
  async rejectMeetup(questId: string): Promise<ServiceResult<null>> {
    const { data, error } = await supabase.rpc('reject_dog_meetup' as never, { p_quest_id: questId } as never)
    if (error) return { data: null, error: extractMessage(error) }
    const oldPath = data as string | null
    if (oldPath) await supabase.storage.from(PENDING_BUCKET).remove([oldPath]).catch(() => undefined)
    return { data: null, error: null }
  },

  // ── Admin: reports ─────────────────────────────────────────────────────────
  async listReports(status: QuestReportStatus | 'all' = 'open'): Promise<ServiceResult<QuestReportRow[]>> {
    let q = supabase
      .from('quest_reports' as never)
      .select('id, quest_id, reason, details, status, created_at, quest:quests(id, title, status, listing_type)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data ?? []) as unknown as QuestReportRow[], error: null }
  },

  async setReportStatus(id: string, status: 'reviewed' | 'dismissed'): Promise<ServiceResult<null>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { error } = await supabase
      .from('quest_reports' as never)
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() } as never)
      .eq('id', id)
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },
}

export type QuestReportReason =
  | 'inappropriate_content'
  | 'inappropriate_photo'
  | 'unsafe_or_not_dog_friendly'
  | 'spam_or_commercial'
  | 'wrong_location_or_time'
  | 'other'

export type QuestReportStatus = 'open' | 'reviewed' | 'dismissed'

export const REPORT_REASONS: ReadonlyArray<{ value: QuestReportReason; label: string }> = [
  { value: 'unsafe_or_not_dog_friendly', label: 'Unsafe or not dog-friendly' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'inappropriate_photo', label: 'Inappropriate photo' },
  { value: 'spam_or_commercial', label: 'Spam or selling something' },
  { value: 'wrong_location_or_time', label: 'Wrong place or time' },
  { value: 'other', label: 'Something else' },
]

export interface QuestReportRow {
  id: string
  quest_id: string
  reason: QuestReportReason
  details: string | null
  status: QuestReportStatus
  created_at: string
  quest: { id: string; title: string; status: string; listing_type: string | null } | null
}
