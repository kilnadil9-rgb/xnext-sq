import {
  createContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { authService } from '../services/authService'
import { profileService } from '../services/profileService'
import type { Profile } from '../lib/supabase/types'

// ─── State ────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
}

type AuthAction =
  | { type: 'LOADING' }
  | { type: 'READY'; user: User | null; session: Session | null; profile: Profile | null }
  | { type: 'PROFILE_LOADED'; profile: Profile }
  | { type: 'SIGNED_OUT' }
  | { type: 'ERROR'; error: string }

const initialState: AuthState = {
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,
}

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null }
    case 'READY':
      return {
        ...state,
        user: action.user,
        session: action.session,
        profile: action.profile,
        loading: false,
        error: null,
      }
    case 'PROFILE_LOADED':
      return { ...state, profile: action.profile }
    case 'SIGNED_OUT':
      return { ...initialState, loading: false }
    case 'ERROR':
      return { ...state, loading: false, error: action.error }
    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  /** Refresh the profile from the database */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data } = await profileService.getProfile(userId)
    return data
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!state.user) return
    const profile = await loadProfile(state.user.id)
    if (profile) dispatch({ type: 'PROFILE_LOADED', profile })
  }, [state.user, loadProfile])

  useEffect(() => {
    // 1. Resolve current session on mount
    let mounted = true

    authService.getSession().then(async ({ data: session }) => {
      if (!mounted) return

      if (session?.user) {
        const profile = await loadProfile(session.user.id)
        dispatch({
          type: 'READY',
          user: session.user,
          session,
          profile,
        })
      } else {
        dispatch({ type: 'READY', user: null, session: null, profile: null })
      }
    })

    // 2. Subscribe to future auth changes
    const unsubscribe = authService.onAuthStateChange(async (user, session) => {
      if (!mounted) return

      if (user && session) {
        const profile = await loadProfile(user.id)
        dispatch({ type: 'READY', user, session, profile })
      } else {
        dispatch({ type: 'SIGNED_OUT' })
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [loadProfile])

  return (
    <AuthContext.Provider value={{ ...state, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Internal export for useAuth ──────────────────────────────────────────────

export { AuthContext }
