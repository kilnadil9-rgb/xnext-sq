import { supabase } from '../lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthResult<T = null> {
  data: T | null
  error: string | null
}

export interface SignUpParams {
  email: string
  password: string
  fullName?: string
}

export interface SignInParams {
  email: string
  password: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMessage(error: AuthError | Error | unknown): string {
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Register a new user. On success, Supabase sends a confirmation email.
   * The profile row is created automatically via a database trigger on auth.users.
   */
  async signUp({ email, password, fullName }: SignUpParams): Promise<AuthResult<User>> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName ?? '',
        },
      },
    })

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data.user, error: null }
  },

  /**
   * Sign in with email and password.
   */
  async signIn({ email, password }: SignInParams): Promise<AuthResult<Session>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data.session, error: null }
  },

  /**
   * Sign out the current user and clear the local session.
   */
  async signOut(): Promise<AuthResult> {
    const { error } = await supabase.auth.signOut()
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Returns the currently authenticated user, or null if unauthenticated.
   * Uses getUser() which re-validates the JWT with Supabase Auth server —
   * do NOT use getSession().user for security-sensitive checks.
   */
  async getCurrentUser(): Promise<AuthResult<User>> {
    const { data, error } = await supabase.auth.getUser()
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data.user, error: null }
  },

  /**
   * Returns the current session (access token, refresh token, expiry).
   * Safe for non-security-sensitive UI gating (e.g. show/hide nav).
   */
  async getSession(): Promise<AuthResult<Session>> {
    const { data, error } = await supabase.auth.getSession()
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data.session, error: null }
  },

  /**
   * Send a password reset email to the given address.
   */
  async resetPassword(email: string): Promise<AuthResult> {
    const redirectTo = `${window.location.origin}/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Update the authenticated user's password.
   * Must be called from a reset-password page after the user follows the email link.
   */
  async updatePassword(newPassword: string): Promise<AuthResult<User>> {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data.user, error: null }
  },

  /**
   * Subscribe to auth state changes. Returns the unsubscribe function.
   * Use in app root to keep global auth state in sync.
   */
  onAuthStateChange(callback: (user: User | null, session: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null, session)
    })
    return data.subscription.unsubscribe
  },
}
