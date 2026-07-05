# XNEXT — Android APK Release Runbook (RC2)

Everything in the repo compiles with **zero Capacitor packages installed**
(the shell bridge in `src/lib/nativeShell.ts` talks to `window.Capacitor` at
runtime). The steps below are run **locally on your machine** — they install
native tooling and generate the `android/` project, which cannot be done from
the sandboxed session.

## 1. One-time setup

```bash
npm i @capacitor/core @capacitor/cli @capacitor/app @capacitor/status-bar
npm i -D @capacitor/assets
npx cap add android
```

`capacitor.config.ts` is already in the repo (appId `app.xnext`, webDir `dist`,
https androidScheme).

## 2. Icons + splash (already generated)

Brand masters live in `resources/` (icon, adaptive foreground/background,
splash — derived from the XNEXT map marker). Generate all densities:

```bash
npx capacitor-assets generate --android
```

## 3. Android manifest — permissions

After `cap add android`, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

Notes:
- Camera/storage permissions are NOT needed yet — photo upload uses the file
  picker (`<input type="file">`), which requires no runtime permission.
- Push notifications are Phase 2 — do not add POST_NOTIFICATIONS yet.
- `navigator.geolocation` inside the WebView needs the runtime permission
  grant; Capacitor's default `BridgeWebChromeClient` forwards the WebView
  permission request once the manifest permissions above exist. **Test the
  grant/deny/blocked paths on-device** — the app already has UI for all three.

## 4. Deep links (optional for first APK)

To open `https://xnext.app/...` links in the app, add an intent filter with
`android:autoVerify="true"` for the `xnext.app` host + the
`assetlinks.json` on the domain. Recommended after first beta, not before.

## 5. Share behavior

`shareQuest` uses `navigator.share` with a clipboard fallback. Android WebView
does not implement the Web Share API → beta builds will silently use the
clipboard fallback (works, just less pretty). If native share matters for
beta, add `@capacitor/share` and branch in `src/utils/shareQuest.ts` via
`isNativeShell()`.

## 6. Versioning

- Web/app version: `package.json` `version` (now `0.1.0-rc.1`).
- Android: `android/app/build.gradle` → `versionName "0.1.0-rc.1"`,
  `versionCode 1`. Bump `versionCode` on every Play/APK upload, no exceptions.

## 7. Build the APK

```bash
npx tsc -b && npx vite build     # web assets → dist/
npx cap sync android             # copy dist + plugins into android/
cd android && ./gradlew assembleDebug    # or assembleRelease + signing
```

Debug APK lands in `android/app/build/outputs/apk/debug/`.

## 8. OTA updates (decide before wide beta, not before first APK)

Recommended: Capgo (capacitor-updater). Rules when you adopt it:
- **DB-first discipline**: apply + verify Supabase migrations (and
  `NOTIFY pgrst, 'reload schema'`) BEFORE pushing any OTA bundle that
  depends on them.
- Set a minimum-native-version gate so a bundle needing a new plugin never
  loads on an old shell.
- Keep rollback channel pointing at the last known-good bundle.

## 9. Known WebView caveats to verify on-device

- Geolocation prompt inside FB/Instagram in-app browsers (web) vs the APK's
  WebView (native prompt) — both paths exist in `useUserLocation`.
- `sessionStorage` (admin Travel Here) survives WebView pause/resume but not
  process death — acceptable (admin-only QA tool).
- Google Maps JS + vector maps: verify `MAPS_MAP_ID` renders on WebView;
  fallback raster styles exist via `XNEXT_MAP_STYLES`.
- Back button: handled in `nativeShell.ts` (history back; exits at Home).
- App resume: dispatches `xnext-app-resume` → radar refreshes (MapScreen).
