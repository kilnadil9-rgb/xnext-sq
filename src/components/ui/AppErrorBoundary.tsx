import { Component, type ErrorInfo, type ReactNode } from 'react'
import { report } from '../../lib/crashLog'

/**
 * App-level error boundary (RC1). Before this, any render error anywhere
 * white-screened the whole app on a beta device with no recovery. Now the
 * user gets a branded fallback with a reload action, and the error lands in
 * the crash log ring buffer.
 *
 * Deliberately style-inlined: if CSS failed to load, the fallback still works.
 */

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    report('react-boundary', error)
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary]', error, info.componentStack)
    }
  }

  private handleReload = (): void => {
    // Full reload — clears whatever transient state caused the crash.
    window.location.assign('/')
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          background: '#0d0e14',
          color: '#f4f5f7',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 40 }} aria-hidden="true">🧭</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          XNEXT hit a snag
        </h1>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
          Something went wrong on this screen. Your memories and progress are
          safe — reload to keep exploring.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: 8,
            minHeight: 44,
            padding: '0 24px',
            borderRadius: 12,
            border: 'none',
            background: '#f97316',
            color: '#0d0e14',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload XNEXT
        </button>
      </div>
    )
  }
}
