# XNEXT — Phase 2 Roadmap Notes

Target: after Phase 1 stabilization (location fix, Verified Locations, Verified
Adventure System, paid listings + Monthly Local Partner, Yard Sale Route Mode).

## Phase 2 candidate features

- ⭐ **Live Mode** — promote the Phase 1 MVP (long-press quick action) into a
  full real-time discovery mode: live radius, live yard sales/events, presence.
- 🎄 **Seasonal Experiences** — Christmas lights routes, Halloween houses,
  pumpkin patches; builds on the seasonal fields from migration 019 and the
  Yard Sale Route engine (same multi-stop pattern, different listing filter).
- 🏷️ **Paid Listings** — expand beyond Phase 1: self-serve partner dashboard,
  recurring billing for Monthly Local Partner, listing analytics.
- 🧠 **AI Recommendations** — personalized "next adventure" ranking on top of
  Adventure Radar (preferences, history, trust signals, time of day).
- 👥 **Social Explorer profiles** — public profiles built on trust_score +
  completions + verified uploads (migration 022 already tracks the data).
- 🏅 **Explorer Levels and achievements** — XP economy (completion XP already
  displayed), levels, badges for verified-location contributions.

## Notes

- Trust groundwork is already live: `profiles.trust_score` accrues quietly
  (+1 per completion, +5 per verified upload) — Phase 2 can read it for
  faster approvals and Explorer Levels without new backfills.
- Yard Sale Route Mode's `MultiStopRouteLayer` is reusable for any themed
  route (Christmas lights, food trucks, art walks).
- Future trust/safety: user "wrong location" reports; too many reports sends
  a quest back to review.
