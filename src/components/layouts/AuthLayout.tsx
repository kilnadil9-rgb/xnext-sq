import type { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
  /** Optional page title shown above the form card */
  title?: string
  /** Optional subtitle */
  subtitle?: string
}

/**
 * Centered single-column layout for auth pages:
 * Login, Sign Up, Forgot Password, Reset Password.
 */
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {/* Logo / Brand */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
          SQ
        </div>
        <span className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
          XNext
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        {(title || subtitle) && (
          <div className="mb-6 text-center">
            {title && (
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
