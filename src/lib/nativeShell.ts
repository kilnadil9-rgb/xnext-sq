/**
 * Native shell bridge (RC2) — Capacitor Android integration without a
 * build-time dependency.
 *
 * Why no `import { App } from '@capacitor/app'`: the web build must compile
 * and run with zero Capacitor packages installed. Inside the Android shell,
 * Capacitor injects `window.Capacitor` with its plugin registry; we talk to
 * it through that runtime bridge. On the plain web this file no-ops entirely.
 *
 * Behaviors provided in the shell:
 *  - Hardware Back: navigate back through history; at the Home root, let
 *    Android exit the app (standard platform behavior).
 *  - App resume: dispatch `xnext-app-resume` so live surfaces (radar) can
 *    refresh stale data and re-check location.
 *  - Status bar: dark style so the orange-on-black UI doesn't sit behind a
 *    light status bar.
 */

interface CapacitorPluginBridge {
  addListener?: (
    event: string,
    cb: (state: { canGoBack?: boolean; isActive?: boolean }) => void,
  ) => void
  exitApp?: () => void
  setStyle?: (opts: { style: string }) => Promise<void>
  setBackgroundColor?: (opts: { color: string }) => Promise<void>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, CapacitorPluginBridge | undefined>
}

function capacitor(): CapacitorGlobal | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap ?? null
}

/** True when running inside the Capacitor Android/iOS shell. */
export function isNativeShell(): boolean {
  try {
    return capacitor()?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/** Routes where hardware Back should exit the app instead of navigating. */
const ROOT_PATHS = new Set(['/', '/dashboard', '/auth/login'])

let initialized = false

/**
 * Install shell listeners. Idempotent; safe (and a no-op) on the plain web.
 * Call once at startup.
 */
export function initNativeShell(): void {
  if (initialized || typeof window === 'undefined') return
  const cap = capacitor()
  if (!cap?.isNativePlatform?.()) return
  initialized = true

  const app = cap.Plugins?.App
  const statusBar = cap.Plugins?.StatusBar

  // Hardware back button (Android): history-back unless we're at a root.
  app?.addListener?.('backButton', () => {
    if (ROOT_PATHS.has(window.location.pathname)) {
      app.exitApp?.()
    } else {
      window.history.back()
    }
  })

  // Resume: let live surfaces refresh (radar re-query, location re-check).
  app?.addListener?.('appStateChange', (state) => {
    if (state.isActive) {
      window.dispatchEvent(new CustomEvent('xnext-app-resume'))
    }
  })

  // Match the dark brand chrome.
  void statusBar?.setStyle?.({ style: 'DARK' })
  void statusBar?.setBackgroundColor?.({ color: '#0d0e14' })
}
