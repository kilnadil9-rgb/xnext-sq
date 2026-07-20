import { speak, stopSpeaking, isVoiceMuted, setVoiceMuted, voiceSupported } from '../../lib/voiceNav'

/**
 * VoiceController — the XNEXT adventure companion (Goal 5).
 *
 * Builds on lib/voiceNav (speechSynthesis, mute persistence, graceful
 * degradation) and adds personality + anti-chatter discipline:
 *  - phrase pools with light variety (never robotic repetition)
 *  - a global cooldown so guidance assists without nagging
 *  - priority phrases (turns, reroutes) always cut through
 */

export { isVoiceMuted, setVoiceMuted, voiceSupported, stopSpeaking }

/** Minimum silence between NON-critical phrases. */
const CASUAL_COOLDOWN_MS = 12_000

let lastSpokeAt = 0

function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Critical guidance (turns, reroutes, arrival) — always speaks. */
function sayNow(phrase: string): void {
  lastSpokeAt = Date.now()
  speak(phrase)
}

/** Companion color — skipped entirely inside the cooldown window. */
function sayCasual(phrase: string): void {
  if (Date.now() - lastSpokeAt < CASUAL_COOLDOWN_MS) return
  sayNow(phrase)
}

// ── Adventure moments ────────────────────────────────────────────────────────

export function sayAdventureStart(): void {
  sayNow(pick(['Adventure starts now.', "Let's explore."]))
}

export function sayDestination(title: string | null): void {
  if (!title) return
  sayCasual(pick([`Taking you to ${title}.`, `Next stop: ${title}.`]))
}

export function sayArrival(title: string | null): void {
  sayNow(
    title
      ? pick([`Welcome to ${title}.`, `You've reached today's adventure. Welcome to ${title}.`])
      : "You've reached today's adventure.",
  )
}

export function sayRerouting(): void {
  sayNow(pick(["No worries. Let's find another way.", "Recalculating. Let's find another way."]))
}

export function sayLongStraight(distanceText: string): void {
  sayCasual(pick([`Continue for ${distanceText}.`, `Continue for ${distanceText}. Enjoy the drive.`]))
}

// ── Turn guidance ────────────────────────────────────────────────────────────

const MANEUVER_WORDS: Record<string, string> = {
  'turn-left': 'turn left',
  'turn-sharp-left': 'turn sharp left',
  'turn-right': 'turn right',
  'turn-sharp-right': 'turn sharp right',
  'turn-slight-left': 'bear left',
  'fork-left': 'bear left',
  'ramp-left': 'take the ramp on the left',
  'keep-left': 'keep left',
  'turn-slight-right': 'bear right',
  'fork-right': 'bear right',
  'ramp-right': 'take the ramp on the right',
  'keep-right': 'keep right',
  'uturn-left': 'make a U-turn',
  'uturn-right': 'make a U-turn',
  'roundabout-left': 'take the roundabout',
  'roundabout-right': 'take the roundabout',
  merge: 'merge',
  straight: 'continue straight',
}

export function maneuverWords(maneuver: string): string {
  return MANEUVER_WORDS[maneuver] ?? 'continue'
}

/** "In a quarter mile, turn left onto Road 68." */
export function sayUpcomingTurn(maneuver: string, streetName: string, meters: number): void {
  const dist = spokenDistance(meters)
  const street = streetName ? ` onto ${streetName}` : ''
  sayNow(`In ${dist}, ${maneuverWords(maneuver)}${street}.`)
}

/** Spoken at the maneuver point: "Turn left onto Road 68." */
export function sayTurnNow(maneuver: string, streetName: string): void {
  const words = maneuverWords(maneuver)
  const street = streetName ? ` onto ${streetName}` : ''
  sayNow(`${words.charAt(0).toUpperCase()}${words.slice(1)}${street}.`)
}

/** Human-friendly spoken distances (imperial, matching the app's mi labels). */
export function spokenDistance(meters: number): string {
  const feet = meters * 3.28084
  if (feet < 800) return `${Math.round(feet / 100) * 100} feet`
  const miles = meters / 1609.34
  if (miles < 0.35) return 'a quarter mile'
  if (miles < 0.65) return 'half a mile'
  if (miles < 1.2) return 'one mile'
  return `${miles.toFixed(miles < 3 ? 1 : 0)} miles`
}
