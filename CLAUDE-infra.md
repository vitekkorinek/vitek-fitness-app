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

## Route restore — `lib/lastRoute.ts`

**The app comes back to the screen you left.** Applying an update restarts the JS and a restart throws away the navigation stack. iOS restores a *backgrounded* app's screen for free, but nothing restores it across a real process restart, and **Expo Router has no state restoration to switch on** — it owns React Navigation's `initialState` internally (`ExpoRoot.js:144`), so remembering the screen ourselves is the supported route.

`app/_layout.tsx` records every navigation (`rememberRoute`, keyed **per user id** — one phone, two accounts) and on launch sends the user to the remembered screen instead of home.

- **⚠️ `useSegments()` alone is NOT navigable** — it reports dynamic routes as their file names (`[id]`, `[workoutId]`), so `buildHref` substitutes `useGlobalSearchParams()` back in. *(`lib/navHistory.ts` has this bug latent in its crumbs — `'/' + segments.join('/')` — worth fixing when that file is next touched.)*
- **⚠️ A deep screen is restored as home → screen** (`replace`, then a deferred `navigate`), never on its own, or the back button has nowhere to go.
- **⚠️ `takeRememberedRoute` READS AND CLEARS.** If a stored screen ever fails to open (removed in a later version, deleted workout), the next launch starts clean instead of walking into the same wall forever; the recorder rewrites it a moment later.
- **The splash stays up until routing is DECIDED** (it used to hide first and jump after), with a `hideSplash()` on **every** early exit — including `!profile`, so a failed profile fetch can never hang on the splash.

**Two lists, and they are NOT the same list:**
- **`UNSAVED_WORK`** — workout-builder, add-exercise, plan-week, availability, the pickers, recipe create. Never restart there, never restore there.
- **`NEEDS_ITS_PARAMS`** — session-complete, stretch-complete, exercise-detail. We remember the **path, not the query string**, so these would reopen blank.

**⚠️ Do Mode is in neither list in the way you'd expect:** it is **protected from restarts** (a session being trained is not interrupted for a code update) but deliberately **restorable** — it is the one screen built to survive a restart (AsyncStorage draft + adopting the `in_progress` row), so a phone that kills the app mid-session reopens *into the session*.

---

## Form crash drafts — `lib/formDraft.ts`

`saveFormDraft` / `loadFormDraft` / `clearFormDraft`, AsyncStorage, key `formDraft:v1:<key>`, purged after 24 h. For screens whose input lives **only in component state** until an explicit Save.

**⚠️ THE INVARIANT THAT LETS THE RESTORE BE SILENT INSTEAD OF A PROMPT: every deliberate exit clears the draft** (Save, Discard, Cancel). A draft that is still there therefore means the screen was never finished on purpose. **Wire the clears FIRST on every exit path** — a draft that outlives its screen comes back as a workout the trainer already saved.

**Workout builder** (`app/(trainer)/workout-builder.tsx`) — key `workoutBuilder:<userId>:<editWorkoutId|templateId|'new'>:<clientId|'any'>` (editing workout X must never restore over a new one for client Y). Holds name / category / stretchType / cover / `items` **plus the three `loaded*` fields** — those are context, not input: they decide update-in-place vs save-a-copy, and are restored **only** when the preload could not supply them (offline).
- **⚠️ ORDERING:** the two preload effects fill the form from the DB asynchronously and the draft is **newer** than what they load, so it is applied after they settle — `setPreloadSettled(true)` hangs off a `.finally()` on each IIFE so every early return still signals.
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
