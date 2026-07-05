/**
 * Voice navigation (RC4) — simple spoken guidance for the in-app route
 * preview using the browser SpeechSynthesis API. Deliberately NOT
 * conversational AI: short fixed phrases only (turn left / turn right /
 * continue / arrived / recalculating), mute/resume, nothing else.
 *
 * Works in Chrome, Android WebView (Capacitor), and Safari. Degrades to
 * silence when speechSynthesis is unavailable — never throws.
 */

const MUTE_KEY = 'xnext-voice-muted'

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  } catch {
    return null
  }
}

export function voiceSupported(): boolean {
  return synth() !== null
}

export function isVoiceMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setVoiceMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* best-effort */
  }
  if (muted) stopSpeaking()
}

/** Speak one short phrase, cancelling anything mid-utterance first. */
export function speak(phrase: string): void {
  const s = synth()
  if (!s || isVoiceMuted()) return
  try {
    s.cancel()
    const u = new SpeechSynthesisUtterance(phrase)
    u.rate = 1
    u.pitch = 1
    u.lang = 'en-US'
    s.speak(u)
  } catch {
    /* speech must never break navigation */
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel()
  } catch {
    /* ignore */
  }
}

// ── Fixed navigation phrases ──────────────────────────────────────────────────

export function announceRouteReady(durationText: string, distanceText: string): void {
  speak(`Route ready. ${durationText}, ${distanceText}.`)
}

export function announceArrived(): void {
  speak('You have arrived.')
}

export function announceRecalculating(): void {
  speak('Recalculating.')
}

/**
 * Map a Google Directions maneuver string onto a short spoken phrase.
 * Unknown/empty maneuvers become "Continue".
 */
export function maneuverPhrase(maneuver: string | undefined): string {
  switch (maneuver) {
    case 'turn-left':
    case 'turn-sharp-left':
      return 'Turn left'
    case 'turn-right':
    case 'turn-sharp-right':
      return 'Turn right'
    case 'turn-slight-left':
    case 'fork-left':
    case 'ramp-left':
    case 'keep-left':
      return 'Bear left'
    case 'turn-slight-right':
    case 'fork-right':
    case 'ramp-right':
    case 'keep-right':
      return 'Bear right'
    case 'uturn-left':
    case 'uturn-right':
      return 'Make a U-turn'
    case 'roundabout-left':
    case 'roundabout-right':
      return 'Take the roundabout'
    case 'merge':
      return 'Merge'
    default:
      return 'Continue'
  }
}
