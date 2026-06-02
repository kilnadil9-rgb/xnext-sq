import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authService } from '../../services/authService'
import { AuthLayout } from '../../components/layouts/AuthLayout'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authService.signIn({ email, password })

    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your XNext account">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <Link
              to="/auth/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link to="/auth/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
