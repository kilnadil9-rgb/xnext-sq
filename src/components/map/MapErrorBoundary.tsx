import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[XNEXT Map]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="map-fallback" role="alert">
          <p>The map could not be loaded.</p>
          <p className="map-fallback__detail">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
