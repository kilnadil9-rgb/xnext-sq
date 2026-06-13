import { supabase } from '../lib/supabase/client'
import type { Profile, ProfileUpdate } from '../lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = null> {
  data: T | null
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred'
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const profileService = {
  /**
   * Fetch a user profile by ID.
   * RLS ensures users can only read their own profile unless they have users.read permission.
   */
  async getProfile(userId: string): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update the authenticated user's own profile.
   */
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', userId)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Upload a user avatar to the `avatars` storage bucket and update the profile.
   * Returns the public URL of the uploaded avatar.
   *
   * Storage bucket: `avatars` (public) — defined in 007_storage.sql
   * File path pattern: `{userId}/avatar.{ext}`
   */
  async uploadAvatar(userId: string, file: File): Promise<ServiceResult<string>> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filePath = `${userId}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type })

    if (uploadError) return { data: null, error: extractMessage(uploadError) }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const avatarUrl = urlData.publicUrl

    // Persist the new URL on the profile row
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() } as never)
      .eq('id', userId)

    if (updateError) return { data: null, error: extractMessage(updateError) }

    return { data: avatarUrl, error: null }
  },
}
