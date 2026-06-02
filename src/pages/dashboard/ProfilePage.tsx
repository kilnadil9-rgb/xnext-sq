import { useState, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { profileService } from '../../services/profileService'
import type { ProfileUpdate } from '../../lib/supabase/types'

export function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [website, setWebsite] = useState(profile?.website ?? '')

  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return

    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    const updates: ProfileUpdate = {
      full_name: fullName.trim() || null,
      username: username.trim() || null,
      bio: bio.trim() || null,
      website: website.trim() || null,
    }

    const { error } = await profileService.updateProfile(user.id, updates)

    if (error) {
      setError(error)
    } else {
      await refreshProfile()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }

    setSaving(false)
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Avatar must be a JPG, PNG, or WebP image.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Avatar must be under 2 MB.')
      return
    }

    setUploadingAvatar(true)
    setError(null)

    const { error } = await profileService.uploadAvatar(user.id, file)

    if (error) {
      setError(error)
    } else {
      await refreshProfile()
    }

    setUploadingAvatar(false)
  }

  const initials = (profile?.full_name ?? user?.email ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your public identity on XNext.
        </p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground ring-2 ring-border">
              {initials}
            </div>
          )}
          {uploadingAvatar && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            disabled={uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {uploadingAvatar ? 'Uploading…' : 'Change photo'}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP · Max 2 MB</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-5">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {saveSuccess && (
          <div role="status" className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-600">
            Profile updated.
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
              placeholder="Your name"
            />
          </Field>

          <Field label="Username" htmlFor="username">
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              placeholder="@handle"
            />
          </Field>
        </div>

        <Field label="Bio" htmlFor="bio">
          <textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={inputCls}
            placeholder="Tell the world about your quest appetite"
          />
        </Field>

        <Field label="Website" htmlFor="website">
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className={inputCls}
            placeholder="https://yoursite.com"
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            value={user?.email ?? ''}
            disabled
            className={`${inputCls} cursor-not-allowed opacity-60`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Email is managed through your auth settings.
          </p>
        </Field>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
