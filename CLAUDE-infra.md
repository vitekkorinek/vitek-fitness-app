# CLAUDE-infra.md — App lifecycle, offline & delivery

Read before touching `lib/supabase.ts`, `lib/sessionOutbox.ts`, `lib/otaUpdates.ts`, `lib/lastRoute.ts`, `lib/formDraft.ts`, `app/_layout.tsx`, or any screen's load/spinner logic.

These rules came out of real failures on Vitek's phone and on real clients' phones during the TestFlight testing phase — a gym connection that reports 5G and swallows packets, an app that restarted itself, a session that could not be saved. The narrative behind each is in **CLAUDE-history.md**; what is *true now* is here.

---

## Request deadlines — `lib/supabase.ts`

**Every Supabase request has a timeout, and it must never be removed.**

React Native's `fetch` has **no timeout** and supabase-js sets none. Over a connection that reports full signal but black-holes packets, a request stays pending **forever** — it never resolves and never rejects. Every `await supabase…` simply stops, with no error for any screen to report. That is what made a client's Finish button close its confirm and do *nothing*, and hung the Training tab in the same session.

- `lib/supabase.ts` passes `global: { fetch: timeoutFetch }`: **AbortController + `setTimeout`**, never `AbortSignal.timeout()` (absent in Hermes — the same reason `lib/foodApi.ts` rolls its own).
- **20 s** for PostgREST / auth / functions; **120 s** for `/storage/v1/`. A session photo on a bad link is legitimately slow — killing uploads at 20 s breaks a working feature.
- A caller's own `.abortSignal()` is **chained, not swallowed**.
- **Aborting for real is what makes retrying safe** — the request is cancelled, so it cannot land later and write on top of the retry.

**⚠️ The outbox depends on this deadline.** `flushSessionOutbox`'s `flushing` guard is cleared in a `finally`, so an upload that never settles latches it true forever and every later flush silently no-ops — the outbox would be disabled by exactly the connection it exists to survive.

**⚠️ Still open:** the rest of the app now gets an *error* where it used to hang, but most screens don't render one. Failing fast beats hanging forever, but a shared "couldn't load, retry" state is the follow-up.

---

## The auth lock — `context/AuthContext.tsx`

**⚠️ NEVER call Supabase from inside `onAuthStateChange`, and never make that callback `async`.** The deadline above cannot save you here, because nothing is ever sent.

supabase-js emits auth events from **inside its auth lock** and `await`s every callback before releasing it (`_notifyAllSubscribers`). Any Supabase call in the callback needs the access token, and asking for it (`auth.getSession()`) queues behind the very operation waiting for the callback to return — **a circular wait with no timeout in it**. `lockAcquired` then stays true for the life of the process and *every* request in the app queues behind it forever: no screen loads, no save lands, `signOut()` spins for good. The app looks alive — taps work, sheets open, stale data sits on screen — and does nothing. **Only force-quitting clears it.**

**What triggers it is ordinary use:** the app sits in the background long enough for the access token to expire, and the first foreground refreshes it and fires `TOKEN_REFRESHED` from inside the lock. That is the 30 Jul 2026 "screen is on but nothing works" report; `app/change-password.tsx` had already been bitten from `USER_UPDATED` and worked around it locally.

- The callback is **synchronous**: set the session, then hand the user id to a `setTimeout(…, 0)` that does the profile fetch after the lock releases.
- A **sequence number** guards the fetch — signing out must never be undone by a profile request already in flight.
- **`initialize()` is wrapped in try/finally.** Anything thrown there skipped `setLoading(false)`, and the root layout renders **nothing** while loading — one failed request at launch was a permanently black app.
- **A sign-out that can't reach the server is not a sign-out.** supabase-js returns the error and **keeps** the stored session (`_signOut` returns before `_removeSession`), so `signOut()` reports `{ ok }` and the two Me/Account screens stop their spinner and say so. They used to ignore it and spin forever — that is the spinner in Vitek's screenshot.

**The evidence is in `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`** (`_acquireLock`, `_notifyAllSubscribers`, `_callRefreshToken`, `_signOut`) — read it, not the docs, when auth misbehaves.

---

## Finishing a session is local; uploading is a background chore — `lib/sessionOutbox.ts`

Full spec in **CLAUDE-domode.md "Session survival"**. What belongs here is the root-level half:

- `flushSessionOutbox()` runs from **`app/_layout.tsx`** on sign-in and on every return to the foreground. It lives at the **root** deliberately — the in-screen retry timer it replaced died whenever the screen unmounted or the app was force-quit.
- **⚠️ The session id is minted on the DEVICE.** Identity before the server knows the row exists is what makes every write addressable by id, every stage idempotent, and a half-uploaded job resume instead of duplicate. Never go back to "insert, then learn the id".
- **⚠️ Every stage marks itself done only when it truly succeeded.** Treating the tail (notes, photos, extra sets) as best-effort was tried and it permanently dropped a mid-session set and a client's photo.

**Vitek's framing of the split, worth keeping:** *the outbox is saving, the deadline is everything else* — "numbers are local, notes and photos write through, everything else needs the server to look at".

**⚠️ The app is not offline-capable in general.** Only a handful of files touch AsyncStorage (card style, a goal-celebration flag, the session draft, form drafts, the outbox, the last route). **Nothing caches workouts, exercises or history.** That is a separate and much larger project — do not imply otherwise.

---

## OTA updates — `lib/otaUpdates.ts`

Ship JS/TS-only changes with **`npm run update`** (see CLAUDE.md §8 for the `--platform ios` rule).

**⚠️ `isUpdatePending` does NOT mean "a new bundle is waiting".** A `fetchUpdateAsync()` that finds **nothing** to download still fires `downloadComplete` (`FetchUpdateProcedure.swift:133`), and that event sets `isUpdatePending = true` (`UpdatesStateMachine.swift:410`). Treating that flag as the trigger made the app **relaunch into the very same bundle on every other foreground**, dumping the user on the home screen with no update involved.

**The honest test is a downloaded manifest whose id differs from the running one:**
```
isUpdatePending && downloadedUpdate && downloadedUpdate.updateId !== currentlyRunning.updateId
```
`downloadedManifest` is nil at process start and is set **only** by `.downloadCompleteWithUpdate` (`UpdatesStateMachine.swift:428`), so it cannot go spuriously true.

- **⚠️ Do NOT call `fetchUpdateAsync()` at launch.** With `checkAutomatically: 'ON_LOAD'` the native layer is already checking the manifest and downloading at every launch; a fetch of our own is a second manifest check and a second **2.54 MiB** transfer over the very connection that is already the bottleneck — and it can only react to its *own* download, missing the native one finishing (the common case). **Watch the native state machine (`Updates.useUpdates()`) and relaunch into whatever IT downloads.**
- **⚠️ Startup never waits on any of it.** No splash hold — a launch that waits on the network punishes exactly the black-holing gym connections the request deadline exists to survive.
- **`checkForUpdateWhenIdle` on a real return from background** is the only way a long-lived app notices new code at all (`ON_LOAD` checks at **launch only**). It **must stay gated on idle: no live session and an EMPTY outbox** — an update download must never compete with the outbox pushing a finished session over a struggling connection. Skipped while the native machine reports `isChecking` / `isDownloading` / `isStartupProcedureRunning`, and only on a **real** return from background (iOS fires inactive→active during launch too).
- **Restart guards:** no live session (`sessionStore.startedAt`) · nothing queued in the outbox · `canRestart` re-read **after** the async guards, since the user can walk off the screen while they run. `holdsUnsavedWork(segments)` is the single rule feeding it.
- **`LAST_ATTEMPT_KEY`** (`ota:lastRestartAttempt`) is written before `reloadAsync()`: a bundle we already restarted into that is *still* not the one running failed to launch, and retrying it would bounce the app in a loop. Cleared if `reloadAsync` itself throws, so the bundle can still launch on its own later.
- **⚠️ A JS-side fix ships OTA but cannot fix its OWN delivery** — the update carrying a change to this file still lands on the second open; every one after that is first-open.
- **⚠️ `app.json` update settings are read from the NATIVE BUILD and do not apply over the air.** `fallbackToCacheTimeout: 5000` is a fast path, not a fix: the bundle is 5.9 MiB of Hermes bytecode = **2.54 MiB gzipped**, so 5 s only wins at ~4.3 Mbit/s. Measure the `.hbc` that `eas update` leaves in `dist/`, **not** a local `npx expo export` (~60% fatter — EAS strips debug info the local export keeps).
- **To prove a device is on new code, check what it WRITES** (e.g. `sessions.started_by` being stamped), never the UI.

**⚠️ The evidence for all of this is in `node_modules/expo-updates/ios/EXUpdates/` — read the Swift when this hook misbehaves; the JS types say nothing about which events set which flags.**

---

## Live Activity (Dynamic Island) + notifications native stack — Aug 2026 build

The notifications-phase build (app version **1.1.0**, the first native build since the Manrope embed) added `expo-notifications` and the workout **Live Activity**. Three pieces:

- **`modules/live-activity/`** — a LOCAL Expo module (autolinked from `modules/`): `LiveActivityModule.swift` exposes `isAvailable` / `hasActiveActivity` / `startActivity(name, startedAtMs)` / `updateRest(endsAtMs?, paused, pausedRemaining)` / `updateProgress(done, total, current?, next?)` / `endActivity`. One activity at a time — `startActivity` ends any stale one first, so re-running (resume, rename) is self-healing.
- **`targets/widgets/`** — the widget extension via **`@bacons/apple-targets`** (`expo-target.config.js`: type widget, name VFWidgets, deploymentTarget 16.2 — ActivityKit needs it; bundle id becomes `com.vitekfitness.trainer.widget`). `index.swift` holds the SwiftUI. **Island (build 34+): the SESSION clock NEVER moves and never changes color — trailing (right), ACCENT green, timer glyph beside it; the REST countdown joins on the LEFT as hourglass glyph + WHITE digits — the same sides as the in-app header chips — red `-mm:ss` in overtime.** v1 (session jumping leading + turning white when a rest started) was confusing on device — do not go back to swapping slots. **Lock card (build 35, mockup-approved "green depth"):** workout-cover gradient bg, name + `N/M` count top-left, the bare white VF mark top-right (`Assets.xcassets/Logo`, rasterized from `components/VFIcon.tsx` — the app icon is still the Expo placeholder, don't use it), NOW/NEXT exercise lines, clocks row with **REST ALWAYS rendered** (dimmed 0:00 idle) so the card never changes shape. **The clocks tick natively via `Text(date, style: .timer)` — zero updates while running, and a passed rest date counts UP again for free (that is the overtime display).** Paused rest renders the frozen `restPausedRemaining` as static text. **⚠️ Timer-style Text is GREEDY** — it takes all offered width so it never re-layouts while ticking; unconstrained it shoves siblings (the icon floated mid-card away from the digits, build 36). Every clock carries `.fixedSize(horizontal: true, vertical: false)` (build 37) — do not remove it, and do not wrap these texts in width frames.
- **⚠️ `staleDate`/`isStale` does NOT repaint the widget — the red overtime flip CANNOT be date-driven.** Build 34 shipped it and the red never appeared on device: iOS marks the content stale at `staleDate` but only repaints opportunistically (Apple forums 740406 / 759250). Since build 35 the widget evaluates "over" (`endsAt <= Date()`, or `restPausedRemaining < 0` when paused) at **every REPAINT**, and the app forces repaints — the store's rest-end timeout pushes `syncRestActivity` at the exact second while the app is alive; foreground/interaction updates catch the rest. **A locked, untouched phone keeps the green count-up until the next repaint — accepted gap; the exact-second flip while locked needs an APNs Live-Activity push at rest end (possible once Phase 4's push infra exists — revisit then).**
- **Cleared card ≠ gone forever:** clearing the card from the lock screen ENDS the activity (iOS). `reviveSessionActivity` (lib) re-creates it on app foreground when none exists — wired via a module-level `AppState` listener in `sessionStore.ts` (suspended session) and a foreground effect in both Do Mode files (active session). The lib caches `lastProgress` so any restart re-pushes the count + NOW/NEXT (a fresh activity starts empty).
- **Progress wiring (both Do Mode files):** an effect pushes `updateProgress` — NOW = last-opened card (`activeHeaderId`, falls back to first not-done), NEXT = next not-done after it — **deduped by a key ref; `exercises` changes identity on every keystroke and each push is an ActivityKit update.**

## Server push notifications (Phase 4, Aug 2026)

- **`push_tokens`** (RLS: own rows) — the device's Expo push token, upserted by **`lib/pushTokens.ts`**: registered from an AuthContext effect on `profile?.id` (⚠️ never from inside `onAuthStateChange` — the auth lock), **unregistered BEFORE `auth.signOut()`** (the delete needs the signed-in client; one phone runs two accounts and a push must follow the account, not the phone). signOut also stops the rest timer + ends the Live Activity — session-scoped state that survived logout before.
- **`notification_log`** (RLS enabled, NO policies — service role only) — the idempotency ledger: one row per `(user, kind, dedupe_key)` = "already sent". The **`send-push` edge function** (verify_jwt + an in-function service-role check) claims via upsert-ignore-duplicates and only pushes for rows that inserted, so cron scans re-run safely; sends via the Expo Push API in chunks of 100 and deletes tokens Expo reports as `DeviceNotRegistered`.
- Callers pass the SERVICE key (pg_cron/pg_net or server-side only) — the function 403s any other JWT. pg_cron 1.6.4 (sub-minute capable) + pg_net 0.20.0 are installed. **The service key lives in Supabase Vault under `service_role_key`** — cron commands and the trigger read it via `vault.decrypted_secrets`; never inline it in SQL/migrations.
- **The three live notifications:** edge fn **`scheduled-notifications`** (`task: 'appointments' | 'availability'`, plus `dryRun`/`force` for testing) driven by cron jobs `appt-reminders` (*/5 min; window = appointment start in now+20..35 min, compared in Europe/Berlin WALL-CLOCK — appointments store naive local date/time; client is only pushed when `sent_to_client`) and `availability-reminders` (hourly; the FUNCTION gates on Thu/Fri 12:00 Berlin so UTC/DST drift can't misfire; **every client gets one of TWO variants** — covered = recurring slots / next-week slots / submission / `availability_type='fixed'` → "I already have yours, changes by Fri 15:00", else the ask). Trigger **`session_assigned_notify`**: sessions INSERT with `status='scheduled'` → push to the client — **skipped when `auth.uid() = client_id`** (the client's own amber-PLAN insert), fires for trainer inserts; discard-restore is an UPDATE and never triggers.
- ⚠️ **A client phone gets pushes only after it runs a 1.1.0+ build** (token registration shipped Aug 2026): clients still on build 30 receive nothing — no OTA reaches the old runtime. TestFlight update required.
- **Rest-over notification — `lib/restNotifications.ts`:** a LOCAL notification scheduled at rest end (store arms it exactly where it arms the vibration: start/resume; cancelled on pause/stop/session-end), so the buzz reaches a locked/backgrounded phone. Permission requested lazily on the FIRST rest start; a generation counter guards the async schedule against a racing cancel. **⚠️ No `setNotificationHandler` is registered anywhere ON PURPOSE** — without one iOS shows nothing in the foreground, which is correct (the in-app vibration + red chip carry that case); registering one for a future feature will surface this banner in-app too.
- **⚠️ `WorkoutActivityAttributes` is DEFINED TWICE ON PURPOSE** — once in the module (app target, `@available(iOS 16.2,*)` because the app deploys to 15.1), once in the widget. ActivityKit matches app ↔ widget by type NAME + Codable shape: **any change must be made in both files or the island silently shows nothing.**
- **JS side is `lib/liveActivity.ts`** — `requireOptionalNativeModule`, so Expo Go and pre-1.1.0 builds no-op instead of crashing; every call is fire-and-forget. Wired: the session-store rest actions call `syncRestActivity`; both Do Mode files start the activity in a `startedAt` effect and call `endSessionActivity()` exactly where they call `stopRestTimer()` at session end (FINISH branches + discard — **never on suspend**).
- **app.json:** `ios.appleTeamId: SGZ83SR8YV` (required by apple-targets; recovered from the build-30 provisioning profile), `NSSupportsLiveActivities: true`, entitlement `aps-environment: production` (the pre-1.1.0 profile had NO push entitlement — remote push in Phase 4 depends on this), plugins `expo-notifications` + `@bacons/apple-targets`.
- **⚠️ Version 1.1.0 = new runtimeVersion.** OTA updates published after the bump only reach the 1.1.0 build — the old TestFlight build stops receiving updates (deliberate: it lacks these native modules). A hotfix for an old build would need the version reverted first.
- **Changing anything in `targets/` or `modules/` = a NEW BUILD, not OTA** — including pure island-UI tweaks. **A new target needs its provisioning profile created ONCE in an interactive `eas build` run (Vitek signs in to Apple); after that, non-interactive builds work.** Local validation without the multi-GB iOS platform download: `xcrun -sdk iphoneos swiftc -typecheck -parse-as-library -target arm64-apple-ios16.2 targets/widgets/index.swift` (the module file needs ExpoModulesCore and can only be compiled by a real build); full prebuild + `pod install` works locally (CocoaPods via Homebrew, needs `LANG=en_US.UTF-8`) but `xcodebuild` refuses all destinations until the iOS platform component is downloaded.

---

## Route restore — `lib/lastRoute.ts`

**The app comes back to the screen you left — but ONLY when the restart was ours.** Applying an update restarts the JS and a restart throws away the navigation stack. iOS restores a *backgrounded* app's screen for free, but nothing restores it across a real process restart, and **Expo Router has no state restoration to switch on** — it owns React Navigation's `initialState` internally (`ExpoRoot.js:144`), so remembering the screen ourselves is the supported route.

**⚠️ OPENING THE APP ALWAYS LANDS ON HOME (30 Jul 2026).** Restoring across *every* launch was wrong: a force-quit or an iOS eviction is indistinguishable from swiping the app away, so opening it dropped Vitek onto "some random screen" he had opened days earlier. *"when opening the app i should always land on the opening page not on a random open page that i perhaps opened two days ago."* The remembered route is now honoured **only** when `markSelfRestart()` ran moments before — i.e. `lib/otaUpdates.ts` is about to call `reloadAsync()`. Marker key `lastRoute:selfRestart`, a timestamp, valid **60 s**, read-and-cleared; cleared too if the reload throws.

**⚠️ This is only about which screen you LAND on — nothing about it discards work.** A session being trained (outbox + Do Mode draft + the `in_progress` row), a workout being built, availability being ticked (`lib/formDraft`) all survive a force-quit on their own and are picked up when that screen is next opened. Landing at home costs a tap, not the work — that is exactly the arrangement Vitek asked for.

`app/_layout.tsx` records every navigation (`rememberRoute`, keyed **per user id** — one phone, two accounts); `takeRememberedRoute` clears the stored route on **every** launch and returns it only in the self-restart case.

- **⚠️ `useSegments()` alone is NOT navigable** — it reports dynamic routes as their file names (`[id]`, `[workoutId]`), so `buildHref` substitutes `useGlobalSearchParams()` back in. *(`lib/navHistory.ts` has this bug latent in its crumbs — `'/' + segments.join('/')` — worth fixing when that file is next touched.)*
- **⚠️ A deep screen is restored as home → screen** (`replace`, then a deferred `navigate`), never on its own, or the back button has nowhere to go.
- **⚠️ `takeRememberedRoute` READS AND CLEARS.** If a stored screen ever fails to open (removed in a later version, deleted workout), the next launch starts clean instead of walking into the same wall forever; the recorder rewrites it a moment later.
- **The splash stays up until routing is DECIDED** (it used to hide first and jump after), with a `hideSplash()` on **every** early exit — including `!profile`, so a failed profile fetch can never hang on the splash.

**Two lists, and they are NOT the same list:**
- **`UNSAVED_WORK`** — workout-builder, add-exercise, plan-week, availability, the pickers, recipe create. Never restart there, never restore there.
- **`NEEDS_ITS_PARAMS`** — session-complete, stretch-complete, exercise-detail. We remember the **path, not the query string**, so these would reopen blank.

**⚠️ Do Mode is in neither list in the way you'd expect:** it is **protected from restarts** (a session being trained is not interrupted for a code update) but deliberately **restorable** — it is the one screen built to survive a restart (AsyncStorage draft + adopting the `in_progress` row). Since 30 Jul 2026 that only pays out on **our own reload**: a phone that force-quits mid-session opens at home, with the header timer chip back (`hydrateSuspendedSession`) as the way in, and the session itself intact when that screen is opened.

---

## Form crash drafts — `lib/formDraft.ts`

`saveFormDraft` / `loadFormDraft` / `clearFormDraft`, AsyncStorage, key `formDraft:v1:<key>`, purged after 24 h. For screens whose input lives **only in component state** until an explicit Save.

**⚠️ THE INVARIANT THAT LETS THE RESTORE BE SILENT INSTEAD OF A PROMPT: every deliberate exit clears the draft** (Save, Discard, Cancel). A draft that is still there therefore means the screen was never finished on purpose. **Wire the clears FIRST on every exit path** — a draft that outlives its screen comes back as a workout the trainer already saved.

**Workout builder** (`app/(trainer)/workout-builder.tsx`) — key `workoutBuilder:<userId>:<editWorkoutId|templateId|'new'>:<clientId|'any'>` (editing workout X must never restore over a new one for client Y). Holds `v: 2` + name / category / stretchType / cover / `items` **plus the three `loaded*` fields** — those are context, not input: they decide update-in-place vs save-a-copy, and are restored **only** when the preload could not supply them (offline).
- **⚠️ ORDERING:** the two preload effects fill the form from the DB asynchronously and the draft is **newer** than what they load, so it is applied after them.
- **⚠️⚠️ A DRAFT MAY ONLY BE WRITTEN OR RESTORED OFF A PRELOAD THAT *SUCCEEDED* — "finished" is not "succeeded", and conflating the two emptied the trainer's workouts (Aug 1 2026).** The preload used to signal completion from a `.finally()`, so a load that ended by **throwing** — every request carries the 20s deadline above, so a bad gym connection rejects — counted as done. The form was then left holding the name with **zero exercises**, the draft effect saved exactly that over a workout that has ten, and because the draft is applied AFTER the preload on every later open, "Edit workout" from then on loaded the workout and instantly emptied it again. Self-reinforcing: the empty draft passes the emptied-form check (the *name* is non-blank) so it re-saved itself every time. Now `preloadState: 'none'|'loading'|'ok'|'error'` drives it — each query's `error` is thrown, a missing row is thrown, and both the restore and the write are gated on `'ok'`/`'none'`. `v: 2` on the envelope discards the drafts poisoned before the fix.
- **Never render the form for a load that is still running or has failed** — the builder's form IS the build-from-scratch form, so an unloaded one looks like a legitimately empty new workout, and saving from it writes a *copy* (`doUpdateInPlace` needs `loadedWorkoutClientId`) or soft-deletes every exercise the preload never read. Loading → spinner, error → "Couldn't load this workout" + Retry (`reloadKey` re-runs the preload effects); Save is refused in both states.
- Emptying the form **clears** the draft, or exercises the trainer deliberately removed would come back.
- **⚠️ Known and deliberate:** the iOS swipe-back gesture bypasses the builder's `Alert.alert` discard prompt (no `gestureEnabled: false`), so swiping out leaves the draft and the work returns next time — same as back-swiping out of Do Mode, and better than silent loss.

**Client availability** — spec in **CLAUDE-schedule.md**.

**⚠️ `plan-week` does NOT need one and must not get one:** it already writes as it goes — a planned appointment is inserted immediately as a real `appointments` row with `sent_to_client: false` (`plan-week.tsx:600`) and the trainer sends it later, so a crash there loses nothing.

**⚠️ These screens are excluded from route-restore (`UNSAVED_WORK`), and the original reason is now half-stale** — they were excluded because a form that could not restore its contents would come back looking right and empty, which is fixed here. Vitek saw the consequence on device (*"i have to click on create a workout and that brings me to the open workout builder, but thats ok"*) and accepted it. **If you do lift it, the route alone is not enough:** `lib/lastRoute` remembers the PATH, not the query string, while the builder's draft key is built from `editWorkoutId`/`templateId`/`clientId` — so restoring `/workout-builder` bare opens the `new:any` builder and an EDIT draft would not load. Lifting it means recording an allowlist of query params for these paths.

---

## Screen loading — only the FIRST load may blank the screen

Tab screens stay **mounted**. Running `setLoading(true)` inside `useFocusEffect` swaps the whole screen for an `ActivityIndicator` on every re-entry — so returning to a tab you left 5 seconds ago blanked it and refetched while the previous data sat untouched in state the entire time. The app was never slow; the screens were throwing away data they were still holding.

**Rule: a `hasLoadedRef` gates the spinner, so only the first load blanks the screen; every later focus refetches UNDERNEATH the content already on screen.** Freshness is identical — same queries, same moment, same frequency.

**⚠️ Three checks before applying this to any new screen** (all three were verified per file):
1. `loading` gates **only the render** — nothing disables a button or guards an effect off it.
2. No `load()` clears state before fetching, or the old view flashes **empty** instead of showing a spinner.
3. Pull-to-refresh has its own `refreshing` state, so an explicit reload still shows feedback.

**⚠️ Scroll position now persists per tab — reviewed and deliberately kept.** The spinner used to unmount the ScrollView and a fresh one starts at the top, so the old reset-to-top was an accident of the spinner, never a decision. Vitek noticed, then chose to keep it once told iOS itself preserves per-tab scroll (Settings / App Store / Photos; tapping the **active** tab is what scrolls to top). **Do not "fix" this back** — restoring it costs a ref + scroll-to-top per screen and would also throw you to the top when returning from a pushed screen inside the tab.

**The tradeoff to know:** right after a write elsewhere, a screen shows the old value for one query round-trip (~200–600 ms) before it fills in. Vitek dislikes stale data, tested it (planned a workout for the next day, switched tabs) and saw no stale flash — the window is a Supabase round-trip, the same in dev as in release. If a screen ever does read wrong, the strict option is a shared version counter bumped by writes → blocking spinner only when data is genuinely behind.

**Sub-tabs that render as `{tab === 'x' && <X/>}` are a worse version of the same bug** — switching **unmounts** and destroys fetched data. Mount each sub-tab the first time it is opened and keep it mounted, hidden via `display:'none'` (see `app/(trainer)/client/[id]/progress-tab.tsx`: a `mounted: SubTab[]` list + `selectSubTab`, with every switcher call site routed through it).
- **⚠️ Lazy on purpose** — mounting both upfront doubles the queries on first open.
- **⚠️ The `active` prop is NOT optional.** `useFocusEffect` fires on **screen** focus, not on visibility, so once both are mounted every visit would refetch the hidden one too. Each sub-tab (and any nested card with its own focus effect) gates its load on `active`; flipping `active`→true re-runs the effect, so becoming visible refreshes underneath data already shown.

**Not done, deliberately:** the 4 nutrition screens (own area, read CLAUDE-nutrition.md first); **pushed screens** (My Workouts, All Routines, Past Sessions, routine/recipe detail) — they unmount on leave, so there is no retained data and `hasLoadedRef` does nothing for them; they need real caching. Trainer side beyond the shared progress tab (Vitek: "my trainer side can wait").
