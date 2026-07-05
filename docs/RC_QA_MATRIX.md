# XNEXT — RC Device QA Matrix (Priority 8: attempt to break everything)

Run on: 1 low-end Android (Go/2GB), 1 mid Android, 1 recent Pixel/Samsung,
plus mobile Chrome + FB in-app browser for the web path. Every row = pass/fail
+ notes. Items marked ⚙ can only be verified on hardware.

## Location

- [ ] Fresh install → tap Enable → native prompt appears (permission = prompt)
- [ ] Deny once → Enable again → prompt re-appears (soft deny path)
- [ ] Block permanently → blocked guidance copy shows; no dead Enable button
- [ ] Grant in OS settings after block → app recovers via Permissions API listener
- [ ] ⚙ "Allow this time" (one-time grant) → expires mid-session → app keeps
      last fix, no banner spam; re-prompt on next Enable tap
- [ ] ⚙ GPS drift: walk indoors — user dot doesn't teleport; transient errors
      do NOT flip UI back to "approximate" (keep-last-fix logic)
- [ ] FB/Instagram in-app browser: Enable tap fires prompt (gesture-safe path)

## Offline / network

- [ ] Airplane mode with app open → offline banner appears; radar keeps last
      results (stale cache); banner clears on reconnect
- [ ] Cold start offline → cached radar renders if cache < 24h and < 10 km
- [ ] Slow 3G (Chrome throttle / real): skeletons show; no infinite spinners
- [ ] Dead zone during LET'S GO route → route line survives; voice stays silent
      rather than erroring

## Lifecycle (⚙ Capacitor shell)

- [ ] Hardware Back from quest detail → returns to map (not app exit)
- [ ] Hardware Back at Home → exits app
- [ ] Background 10+ min → resume → radar refreshes (xnext-app-resume)
- [ ] Process death (developer setting "don't keep activities") → relaunch
      lands on Home cleanly; no white screen (error boundary as last resort)
- [ ] Rotation (if enabled): map + sheets survive without state loss

## Flows

- [ ] Discover → NEXT loop cycles; skip works with 0/1/many quests
- [ ] Complete → celebration → Explorer Note: 9-word cap enforced, over-limit
      blocks Share, tags toggle on/off, Skip path never blocks
- [ ] Complete same quest twice → idempotent (no duplicate completion)
- [ ] Memories + Dream List render with 0 items (empty states)
- [ ] Paid listing: submit → Stripe checkout → CANCEL at Stripe → listing
      stays pending+unpaid, never appears on map
- [ ] Paid listing: pay → webhook marks paid → still hidden until admin approve
- [ ] Partner listing: 3 photos upload; ticket/website links appear ONLY after
      approval; Buy Tickets opens externally
- [ ] Photo upload failure (airplane mode mid-upload) → clear error, form
      state preserved, retry works
- [ ] Yard Sale Route: press-hold NEXT → popup; no location → Enable path;
      0 yard sales → honest empty message; 3+ → route + ordered stops;
      Directions API denied → stop list still usable
- [ ] Voice: route ready announced; mute persists across routes; arrival
      announces once; no speech when muted
- [ ] Verified badge: appears on 3rd unique completer (test with 3 accounts);
      does NOT appear at 2
- [ ] Fake completion probe: complete a quest 3× from ONE account → stays
      unverified (unique-user rule)
- [ ] Command Center: counts match reality; approve from map appears on radar
      within one refresh; Travel Here → pill → Return restores GPS view
- [ ] Multi-device: complete on phone A → count updates on phone B after
      refresh

## Memory / performance (⚙)

- [ ] 30-min map session on low-end device: no crash, no severe jank
      (watch for marker leak — clusterer clears on unmount)
- [ ] Battery: 15-min LET'S GO route with voice — drain comparable to
      Google Maps preview usage (watchPosition is the main cost)
- [ ] chrome://inspect → `window.__xnextCrashLog()` returns [] after a clean
      session; force an error (dev) and confirm it's captured

## Data integrity probes (attempt to break)

- [ ] Expired listing (expires_at past) → gone from radar, still in
      Command Center with correct status
- [ ] Listing starting tomorrow → hidden from radar until start
- [ ] Cancelled payment listing → red pin (needs attention) in Command Center
- [ ] Direct PostgREST probe with a user JWT: attempt to set
      status='published' / payment_status='paid' / verified_location=true on
      own row — MUST fail once the column-protection migration lands
      (**currently the known P0 gap — verify after fix**)
