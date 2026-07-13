/**
 * Minimal analytics abstraction (first one in the project — nothing existed
 * before this). Events are structural product signals only:
 *
 *   NEVER send private note text, exact coordinates, or personal data.
 *
 * Today: dev console + a window CustomEvent so a future provider (or the
 * native shell) can subscribe without touching call sites. Swap the body of
 * `track` to wire a real provider later.
 */

export type AnalyticsEventName =
  | 'people_sheet_opened'
  | 'people_tab_selected'
  | 'marker_inventory_viewed'
  | 'marker_placement_started'
  | 'marker_placement_confirmed'
  | 'marker_placement_cancelled'
  | 'marker_discovered'
  | 'marker_added_to_journey'
  | 'legacy_marker_started'
  | 'legacy_marker_confirmed'
  | 'marker_reported'
  | 'journey_pulse_viewed'
  | 'journey_pulse_details_opened'
  | 'journey_pulse_discover_nearby_selected'

/** Payloads must stay non-sensitive: tiers, tab names, coarse ids only. */
export type AnalyticsPayload = Record<string, string | number | boolean | null>

export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  try {
    if (import.meta.env.DEV) {
      console.debug(`[analytics] ${event}`, payload)
    }
    window.dispatchEvent(
      new CustomEvent('xnext-analytics', { detail: { event, payload, at: Date.now() } }),
    )
  } catch {
    // Analytics must never break the product.
  }
}
