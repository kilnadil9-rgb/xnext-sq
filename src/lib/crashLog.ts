/**
 * Crash / error logging for beta builds (RC1).
 *
 * No external service (no DSN to provision yet): errors land in a small
 * localStorage ring buffer so beta testers' devices carry their own black box.
 * Retrieval: chrome://inspect (WebView) → `window.__xnextCrashLog()`, or a
 * future Settings surface. When a Sentry/PostHog DSN exists, `report()` is
 * the single seam to wire it into.
 *
 * Deliberately dependency-free and defensive: the crash logger must never
 * itself crash the app.
 */

export interface CrashEntry {
  ts: string
  kind: 'error' | 'unhandledrejection' | 'react-boundary'
  message: string
  stack?: string
  url: string
}

const STORAGE_KEY = 'xnext-crash-log'
const MAX_ENTRIES = 25
const MAX_STACK_CHARS = 2000

function read(): CrashEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as CrashEntry[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(entries: CrashEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    /* storage full/unavailable — logging must never throw */
  }
}

/** Record one error. Safe to call from anywhere, including error paths. */
export function report(kind: CrashEntry['kind'], error: unknown): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const entry: CrashEntry = {
      ts: new Date().toISOString(),
      kind,
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, MAX_STACK_CHARS),
      url: typeof location !== 'undefined' ? location.pathname : '',
    }
    write([...read(), entry])
    if (import.meta.env.DEV) {
      console.error('[crashLog]', kind, err)
    }
  } catch {
    /* never throw from the logger */
  }
}

export function getCrashLog(): CrashEntry[] {
  return read()
}

export function clearCrashLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Install global listeners. Idempotent. Call once at startup, before render,
 * so even render-time crashes are captured.
 */
let installed = false
export function initCrashLog(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => {
    report('error', e.error ?? e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    report('unhandledrejection', e.reason)
  })

  // Debug access for beta triage via remote WebView inspection.
  ;(window as unknown as Record<string, unknown>).__xnextCrashLog = getCrashLog
}
