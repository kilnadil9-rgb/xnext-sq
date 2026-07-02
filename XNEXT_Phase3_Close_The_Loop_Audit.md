# XNEXT Audit — "Close the Loop"
**Reviewer role:** Senior product architect + code reviewer
**Scope:** Home → discover → detail → route → complete → share, and whether Share / People / Pulse / Dream List / Completed feel like one product.
**Constraints honored:** one main screen, map stays hero, mobile beta readiness, no backend changes, no overbuilding.

---

## Executive summary

XNEXT is much closer to a real product than a prototype. The core discovery-to-completion path — the thing that actually matters — is genuinely good: Home *is* the map, the compact card → detail → route → complete → celebrate flow is tight, distance is honest, location handling is thoughtful, and Share is wired cleanly into all three surfaces (detail, route sheet, celebration).

The gap is not the loop's front half. It's the **"return" half**. The product loop you want is *Discover → Save → Route → Complete → Share → Community/Pulse → Return.* Today the app nails everything up to Share, then falls off a cliff: the two surfaces meant to pull people back — **Pulse and People — are static mockups**, the **Timeline filter does nothing** (buttons just close the sheet), and the **Home progress counters (Nearby / Completed / Dream List) are dead text.** Meanwhile *real, working* Pulse, Dream List, and Memories pages already exist — but they're hidden behind the hamburger sidebar, disconnected from the bottom nav the user actually lives in.

So the highest-impact next phase is not new features. It's **connecting what already exists** so the loop closes. This is almost entirely front-end wiring and can be done with no backend changes.

---

## What is working

- **One screen, map as hero.** `HomePage` renders `MapScreen cinematic`; `/map` and stray dashboard routes redirect home. The map genuinely owns the experience and the bottom nav overlays it. This is the right architecture and it's already in place.
- **The selected-experience flow is excellent.** `QuestPreviewCard` is a well-designed three-tier progression: compact card → detail sheet → route sheet, with the X always returning to compact so the user is never trapped. Save (Dream List), Route preview, Complete, and the celebration overlay all live here without ever leaving the map.
- **Honest, defensive UX.** Distance shows "Enable location for distance" instead of a fake "0 m"; approximate-location is disclosed; route failures degrade to a Google Maps hand-off; `shareQuest` never throws and falls back clipboard → silent. This is production-grade care.
- **Share is fully integrated.** The native-share-with-clipboard-fallback helper is reused on quest detail, route sheet, completion celebration, and the People "Share XNEXT" button. Toasts are consistent. This phase landed well.
- **Completion feels rewarding.** Confetti burst, XP, "+ Memory Added," and a direct "View in Memories" link give the loop a real payoff moment.
- **Discover submission is real.** Photo upload, layered GPS/pin location, immediate map refresh via `xnext-quest-created`. Not a placeholder.

---

## What still feels weak

1. **Pulse (bottom nav) is a static mockup.** The sheet renders three hardcoded cards ("Perfect weather window…", "Limited-time local event…", "A Dream List item is now within range"). It's honestly labeled "Beta Preview," but it's the single most important surface for *Return* and it shows nothing real — even though a working `pulseService` and `PulsePage` exist elsewhere in the app, and `usePulseQuestIds` already runs on the map.
2. **People (bottom nav) is entirely fake activity.** Three invented events ("Someone discovered a hidden viewpoint nearby"). For a community/social-proof surface, fabricated activity is the most prototype-feeling thing in the app and a small trust risk. It should either show real signal or be honestly empty.
3. **Timeline filter is non-functional.** Every button (`Today`, `Tonight`, `This Weekend`…) just calls `closeSheet()`. It looks like a feature and does nothing — the worst kind of placeholder because it silently fails.
4. **The Home progress row is dead.** `Nearby / Completed / Dream List` counters render real numbers but aren't tappable. They're the natural doorway back into Memories and Dream List and currently lead nowhere.
5. **Two disconnected navigations.** The bottom-nav sheets (Discover/Timeline/Pulse/People) and the hamburger sidebar (My Quests / Dream List / Pulse / Memories / …) are parallel universes. The *real* Pulse and Dream List live in the sidebar; the *fake* ones live in the nav the user actually uses. Same words, different (and worse) destinations.
6. **Vestigial completion inputs.** The completion form collects star rating, "Recommend," and "With friends," then discards them ("save in an upcoming update"). Honest, but it's UI that doesn't do anything yet.
7. **Minor naming drift.** "Memories" (sidebar + completion) vs "Completed" (route path) vs "Dream List" vs "Saved" — mostly fine, but Timeline's relationship to the map's `sortMode` isn't obvious.

---

## Do these feel like one product loop? — Not yet

| Loop stage | State | Notes |
|---|---|---|
| Discover | Strong | Real submission + real map surfacing |
| Save (Dream List) | Strong | Wired in the card; real service |
| Route | Strong | In-app preview + Google fallback |
| Complete | Strong | Celebration + Memory |
| Share | Strong | On all three surfaces |
| **Community/Pulse** | **Broken** | Static mockups, no real data |
| **Return** | **Broken** | No live hook pulls the user back; progress row is inert |

The first five stages are one product. The last two are a demo. **Closing that seam is the whole job of the next phase.**

---

## Highest-impact next phase — Phase 3: "Close the Loop"

Goal: make the *Return* half of the loop as real as the front half, using **only data the app already loads** and **zero backend changes**. Four moves, ranked by impact-per-effort:

**3.1 — Make Pulse real from local data (highest impact).**
The map already has `rankedQuests`, the user's `Dream List`, and `Completed` counts in memory. Compute Pulse cards client-side from that:
- "A Dream List item is within range" — cross-reference saved quest IDs against `rankedQuests` within radius. This is *literally* one of the current fake cards and is trivially real.
- "N new experiences near you since last visit" — compare `rankedQuests` count to a `localStorage` last-seen count.
- Keep the "Beta Preview" tag for anything genuinely not-yet-real (weather), but lead with at least one true, personalized card. If nothing qualifies, show an honest empty state, not fabricated cards.

**3.2 — Make Timeline actually filter.**
Wire the Timeline buttons to a real time filter on the ranked list (the app already has `starts_at` / `start_date` on quests and a `season` lib). Dispatch a `xnext-timeline-filter` event (same pattern as `xnext-next`) that `MapScreen` consumes to filter `rankedQuests`. If a full filter is too much for this phase, reduce Timeline to only the filters that work and remove the dead ones — never ship buttons that lie.

**3.3 — Make the Home progress row the return doorway.**
Turn `Nearby / Completed / Dream List` into three tap targets: Completed → `/dashboard/completed`, Dream List → `/dashboard/dream-list`, Nearby → focus the list. This is the cheapest, most direct "Return" mechanic in the app.

**3.4 — Make People honest.**
Replace fabricated activity with real, safe signal: the user's own recent completions/saves as a personal "Your recent activity" strip, plus the existing Share XNEXT CTA framed as "grow the community." No fake other-user events. Label the social layer as coming, honestly.

**Explicitly out of scope (do not overbuild):** real-time multi-user feeds, weather API, XP economy persistence, rating storage, new tables, push notifications. All of that is post-beta.

---

## Exact files likely involved

- `src/components/layouts/DashboardLayout.tsx` — **primary.** Owns all four bottom-nav sheets (Discover/Timeline/Pulse/People). Pulse (3.1), Timeline (3.2), People (3.4) all edited here.
- `src/components/map/MapScreen.tsx` — consume a new `xnext-timeline-filter` event to filter `rankedQuests`; make the `.radar-progress` counters tappable `Link`s (3.3); optionally expose Dream-List-in-range data for Pulse.
- `src/services/pulseService.ts` + `src/hooks/usePulseQuestIds.ts` — read to decide whether to surface any existing real Pulse data in the sheet (reuse before inventing).
- `src/services/dreamListService.ts` / `src/services/questCompletionService.ts` — already used on Home for counts; reuse for the in-range Pulse card and People "your activity."
- `src/lib/adventureRadar.ts` — ranking/filter helpers; extend for the time filter if needed.
- `src/lib/season.ts` — existing seasonal/date logic to power Timeline.
- `src/components/map/QuestList.tsx` — if Timeline filtering should also reflect in the docked list.
- `src/components/map/maps.css` (and wherever `.radar-progress` is styled) — tap affordance for the progress row.

No changes to `supabase/`, services' data contracts, or any migration.

---

## Claude / Sonnet build prompt

> **XNEXT Phase 3 — "Close the Loop." Front-end only. No backend, no schema, no new tables, no new dependencies. Keep XNEXT on one screen with the map as hero. Mobile-first.**
>
> Context: Home renders `MapScreen cinematic`. The bottom nav (`BottomNav` → `DashboardLayout`) opens four sheets: Discover (real, leave alone), Timeline, Pulse, People. Timeline/Pulse/People are currently static mockups. Real `pulseService`, `dreamListService`, and `questCompletionService` already exist and are already called on Home for the progress counters.
>
> Implement, in order, each as an independently shippable commit:
>
> 1. **Real Pulse from local data.** In the Pulse sheet in `DashboardLayout.tsx`, replace the three hardcoded cards with cards computed from data the app already has. At minimum: cross-reference the user's Dream List (`dreamListService.getMyDreamList`) against nearby ranked quests to render a real "'{title}' from your Dream List is within range" card when one qualifies. Add a "N new nearby since your last visit" card using a `localStorage` last-seen count. If zero real cards qualify, show a calm empty state ("Pulse is watching for the right moment — save experiences to your Dream List so it can alert you.") — never fabricated cards. Keep a small "Beta Preview" tag only on genuinely-future signals.
>
> 2. **Working Timeline filter.** Wire the Timeline buttons to filter experiences by time. Dispatch a `window` CustomEvent `xnext-timeline-filter` with the chosen range (`today | tonight | weekend | week | month | all`), consumed in `MapScreen.tsx` to filter `rankedQuests` (use `starts_at` / `start_date` and `src/lib/season.ts`). Reflect the active filter with a visible selected state and an easy "All / Clear." If a range can't be computed reliably, omit that button — do not ship a button that does nothing.
>
> 3. **Tappable Home progress row.** In `MapScreen.tsx`, make the `.radar-progress` counters navigable: Completed → `/dashboard/completed`, Dream List → `/dashboard/dream-list`, Nearby → scroll/focus the docked `QuestList`. Use `react-router` `Link`/`useNavigate`. Add obvious tap affordance (min 44px touch target) without disrupting the HUD layout.
>
> 4. **Honest People sheet.** Replace fabricated activity with the user's *own* recent completions and saves (reuse the services already imported) as a "Your recent adventures" strip, plus the existing "Share XNEXT" CTA. No invented other-user events. One honest line that the wider social layer is coming.
>
> Preserve: all existing event wiring (`xnext-next`, `xnext-quest-created`, `xnext-live-enter/exit`), the map-as-hero layout, and the Discover sheet. Match the existing dark/orange visual language and the `xnext-*` CustomEvent pattern. Keep diffs small and reversible.

---

## Testing checklist

**Pulse (3.1)**
- [ ] With a Dream List item inside the current radius, Pulse shows a real "within range" card naming that experience; tapping it selects/opens that quest on the map.
- [ ] With an empty Dream List, Pulse shows the calm empty state, not fake cards.
- [ ] "N new nearby" count changes correctly after adding a discovery and reopening Pulse.
- [ ] No fabricated activity remains anywhere in the sheet.

**Timeline (3.2)**
- [ ] Selecting "This Weekend" visibly reduces the map pins + docked list to weekend-eligible experiences.
- [ ] Active filter shows a selected state; "All"/Clear restores the full set.
- [ ] Quests with no date data behave predictably (documented: shown under "All," hidden under specific ranges).
- [ ] No Timeline button is a no-op.

**Progress row (3.3)**
- [ ] Tapping Completed opens Memories; Dream List opens Dream List; Nearby focuses the list.
- [ ] Touch targets ≥ 44px; HUD layout unbroken on a 360–390px viewport.

**People (3.4)**
- [ ] People shows the user's real recent completions/saves (or a true empty state), no invented users.
- [ ] Share XNEXT still triggers native share / clipboard fallback with the correct toast.

**Regression (whole loop, on a real phone / mobile Safari + Chrome)**
- [ ] Discover → Save → LET'S GO → route preview → Complete → celebration → View in Memories → NEXT all still work end to end.
- [ ] Map remains the hero; nothing full-screen traps the user (X always returns to compact card).
- [ ] Location denied path: distance/route degrade honestly; no "0 m."
- [ ] Share works from detail, route sheet, and celebration.
- [ ] No console errors; existing `xnext-*` events still fire; lazy routes still load.
- [ ] Safe-area insets respected on notched devices (bottom nav + sheets).
