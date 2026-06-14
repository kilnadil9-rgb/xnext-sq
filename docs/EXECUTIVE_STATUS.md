# XNEXT Executive Status

**Prepared for:** Founders / non-technical stakeholders  
**Date of audit:** Current repository state (post recent service + page work + 014 RPC)  
**Important:** This document reports *only* what is present and working in the checked-in code and filesystem. No future promises or speculation.

## What currently works?

You can log in (or sign up), see a personalized dashboard, browse and save real quests, maintain a dream list with status changes, and see time-sensitive "Pulse" alerts.

**Concrete, shippable flows today:**
- **Auth:** Sign up / log in / reset password / protected dashboard. Session survives refresh.
- **Home dashboard:** Shows three live preview sections (top active Pulse alerts, your saved Dream List items with quest titles, top published Quests). Click "View all" to go to full pages. Loading + error states with retry. Works even if one section fails.
- **Quests (discovery):** Browse published quests, filter by experience class (Wonder / Opportunity / Transformation / Connection), see cards with SQ score, location, short description. Click into detail page that shows all fields + "Save to Dream List" button (prevents duplicates).
- **Dream List:** See everything you've saved, filter by status (Saved / Planned / Completed / Dismissed), change status or remove items. Joined quest titles and scores are shown when available.
- **Pulse:** See active high-value alerts (triggered by score, deadline, weather, etc.), mark read or dismiss. Unread count badge on the page and referenced from Home.
- **Profile:** Edit your name, username, bio, website + upload/change avatar (stored in Supabase).
- **Organizations (basic):** See organizations you belong to + button to create new ones (core membership via DB transaction).
- **Backend for discovery "near me" (Adventure Radar foundation):** There is a working database function that can find published quests within X km of a lat/lng point and return them sorted by distance + SQ score. The code to call it exists but is not yet shown on any screen.

All of the above uses real data from Supabase (when the project is connected) and has proper loading, error, and empty states.

## What can be demonstrated today?

A 5-10 minute demo for an investor or early user:

1. Sign up / log in.
2. Land on Home — see personalized greeting + three preview cards with real (or seeded) data.
3. Go to Quests → filter by class → click a card → see full details → click "Save to Dream List".
4. Go to Dream List → see the saved item → change its status to "Planned" or "Completed".
5. Go to Pulse → see alerts → mark one read or dismiss it.
6. (If data exists) Show that the Home previews update after actions.
7. Show Profile edit + avatar upload.

This demonstrates the core loop: **Discover → Save/Plan → Get alerted**.

The "near me" capability can be shown by calling the backend function from the browser console if a developer is present, but there is no pretty map or "Radar" screen yet.

## What remains before beta?

Beta = "people outside the core team can use it for real without us holding their hand, and it doesn't fall over."

**Must-haves still missing or broken:**
- Ability for users or organizations to *create* new quests (currently you can only browse published ones that someone else seeded via database).
- A working "Adventure Radar" or map experience (the smart "show me high-SQ things near me" feature is 80% backend-complete but has no user interface).
- Organizations feel incomplete (creating is started, managing members/permissions/audit is not visible to users).
- Admin / moderation tools are not built (you can't review or publish quests, see audit logs, etc.).
- No automated tests — we have no safety net if we change code.
- Real production Supabase project with all migrations applied, storage buckets, correct RLS policies, and the geospatial (PostGIS) extension + indexes.
- Basic notification delivery for Pulse (right now alerts exist in the database but nothing pushes them to the user outside the app).
- Polish on error cases, empty states for new users, and mobile experience.

Estimated remaining work for a minimal beta: 4–8 weeks of focused engineering depending on team size and how much of the prior schema/migrations already exist in the live Supabase project.

## What remains before launch?

Launch = public availability, marketing site, paid users or significant organic growth, reliability under load.

In addition to beta items:
- Full quest authoring + rich location input (users must be able to drop a pin or enter an address).
- A beautiful map or list-based Radar experience (this is the "wow" feature in the vision).
- Quest Chains (guided sequences of experiences) — data layer exists, UI does not.
- Notifications, email digests, or push.
- Payments / sponsorship model for quests or premium radar features.
- AI-powered recommendations or personalized radar (mentioned in long-term vision).
- Admin dashboard that actually works.
- Performance, monitoring, support flows, legal (privacy, terms), marketing site, onboarding for non-technical users.
- Mobile app or at least excellent PWA experience.
- Real usage data + iteration on SQ scoring and Pulse triggers.

This is likely 4–6+ months after a solid beta, assuming the team stays focused.

## Estimated overall completion percentage

**~40% toward a coherent core MVP.**

- Authentication + profiles: ~90%
- Quests (read + save) + Dream Lists + Pulse: ~75%
- Organizations (basic): ~40%
- Adventure Radar / Maps / Geospatial UI: ~15% (strong backend, no UI)
- Quest creation + full lifecycle: ~5%
- Admin, notifications, AI, payments, chains UI, tests: ~0–10%

The foundation (data models, services, auth, three core user-facing apps with real data) is solid and was the right thing to build first. The next big visible leaps are (1) letting people create quests and (2) showing the smart "near me" radar on screen.

We are past "throwaway prototype" and into "real product with gaps." The gaps are clear and prioritized in the accompanying PROJECT_STATUS.md and MVP_PROGRESS.md.
