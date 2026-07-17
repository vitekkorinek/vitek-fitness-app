# CLAUDE.md — Behaviour Rules for Claude Code

Read this file and SPEC.md at the start of every session before writing any code. When working on any nutrition screen, also read CLAUDE-nutrition.md before writing any code.

**Project status: testing phase.** The app is live on TestFlight and Vitek is testing it on a real iPhone. He no longer needs to mention this each session — assume real-device testing is ongoing. Prefer fixes that hold up in a TestFlight build (real navigation, real Supabase data, no dev-only shortcuts).

> **▶️ RESUME HERE — Insert a saved Favourite Day RETROACTIVELY (July 2026, COMMITTED & PUSHED).** Client complaint: on the Food Log you can add individual foods to a past day, but adding a whole **saved day** from Favourites always landed on *today*. Root cause: the Food Log FAB → "Add a day from Favourites" navigated to the Favourites tab and the insert hardcoded `new Date()`. Fixes (`app/(client)/nutrition/index.tsx` + `favourites.tsx`):
> 1. **Carry the selected day** — `handleInsertDay` now pushes `favourites?tab=days&insertMode=true&date=<toDateStr(selectedDate)>` (the week-strip's selected day), mirroring how the Training-tab week-strip `+` targets the selected day.
> 2. **Persistent-tab reactivity bug (the real trap)** — Favourites is a persistent `NativeTabs` screen, so navigating in with new params does NOT re-run `useState` initializers. The date was a one-time `useState(() => parseDateStr(dateParam))` → froze on the first mount's params (no date → today), so it always inserted to today; and `view` (also useState) stranded the user on the Favourites landing instead of Days. **Fix:** `insertDayDate = useMemo(() => parseDateStr(dateParam), [dateParam])` (reactive) + a `useEffect([isInsertMode, tabParam])` that syncs `view` to `'days'` in insert mode. New module helper `parseDateStr(s)` parses `YYYY-MM-DD` as a **local** Date (avoids `new Date(str)` UTC shift). **General rule: on a persistent native tab, read deep-link params reactively (useMemo/useEffect), never via useState initializers.**
> 3. **No redundant date picker** — the insert modal is now a plain confirm ("…will be added to Thu 16 Jul, keeping their original meal categories"), since the target day is fixed by the FAB. `insertDay()` writes to `toDateStr(insertDayDate)` then `router.navigate('/(client)/nutrition')` **immediately** (the Food Log reloads on focus and shows the items = the confirmation; no lingering toast).
> 4. **Single favourite FOOD add** (`openAddFood`) also defaults `addFoodDate` to `parseDateStr(dateParam)` so a favourite food logged from this flow lands on the selected day too. The Food Log's own FAB paths (food/meal/water) already saved with `selectedDate`. Confirmed working on Vitek's Expo build. Typecheck baseline stays 29. All JS → hot-reload. Full detail in CLAUDE-nutrition.md "Days list → Insert-a-saved-day flow".
>
> **▶️ RESUME HERE — Favourite Days sub-tab: expandable detail + redesigned card (July 2026, COMMITTED & PUSHED).** Client Favourites → **Days** list (`app/(client)/nutrition/favourites.tsx`). Vitek: the saved-day cards were "dull/functional" and the expand showed almost nothing. Work:
> 1. **Expanded detail actually works now** — the old expand filtered `meal_category === 'Breakfast'/'Lunch'/'Dinner'/'Snack'` (capitalized), but `food_log_entries.meal_category` stores **lowercase** keys + 5 typed snack subtypes → it matched nothing and rendered empty. Added module-level **`MEAL_SECTION_ORDER`** + **`groupDayEntries(snapshot_json)`** (ordered breakfast→snack_morning→lunch→snack_afternoon→snack_pre_workout→dinner→snack_post_workout→snack_evening→legacy `snack`; unknown/null → "Other" bucket) + **`portionLabel(e)`**. Each meal section renders a header (emoji + label + `N items · X kcal` subtotal) and per-item rows (name + portion left; kcal + `P·C·F` right).
> 2. **Card redesign** — collapsed header now: a **heart badge with the day-of-month number inside** (44px solid ACCENT `heart.fill` + white 14px/800 number, `heartDateWrap` `paddingBottom:5` so it sits in the lobes) as a "favourited date" marker; **colored macro pills** (`COL_PROT #378ADD`/`COL_CARB #EF9F27`/`COL_FAT #D85A30`, tinted `${COL}18` bg — the Weekly-screen palette, now also declared in this file); a prominent **kcal readout** (`dayKcal` 22px/800 + "KCAL"), `dayKcalWrap` `alignSelf:'center'` (vertically centered — was pinned top); the expand **chevron moved to a bottom-center row** (`dayChevronRow`) as a pull-to-expand affordance.
> 3. **Subtitle no longer repeats the date** — `day.name` defaults to the date label ("Thursday 9 July", user-editable), so `nameIsDate = day.name.trim() === dateLabel` → default-named days show `YYYY · N items` (year adds info the title lacks), renamed days show `dateLabel · N items`.
> 4. **Shadow fix** — the single-layer `itemCard` had `overflow:'hidden'` which clips the iOS shadow (the app-wide card rule). Split into **two layers**: `itemCardOuter` (shadow, no clip: `offset {0,5}, opacity 0.13, radius 16, elevation 6`; `itemCardOpen` → `0.17/20` when expanded) + inner `itemCard` (`overflow:'hidden'`, radius 16). Full detail in CLAUDE-nutrition.md "Days list". Typecheck baseline stays 29. All JS → hot-reload.
>
> **▶️ RESUME HERE — Do Mode collapsed-set summary + expanded note footer + new-note dot + `workout_sets` double-insert fix (July 2026, COMMITTED & PUSHED).** Vitek's VG-inspired asks. **Applied to BOTH Do Mode files** (`app/(client)/workout/[workoutId].tsx` + `app/(trainer)/client/[id]/workout/[workoutId].tsx` — client was built first + confirmed on a build; trainer was then mirrored identically) **plus a bug fix in `app/(trainer)/workout-builder.tsx`.** Typecheck baseline stays **29** (all pre-existing gesture-handler/`any`/`onOpenProgress` errors; no new ones). All JS → hot-reload (the builder change too — no native rebuild).
> 1. **Collapsed exercise card shows the sets as a one-liner** — under the exercise name (only when `!isExpanded`), e.g. `12 × 42kg   ·   8 × 46kg   ·   8 × 50kg   …`. Module-level helper **`buildSetsSummary(sets)`** (added after `calcTotal` in both files): filters `!isRemoved && !isDropset`, shows the value **as it sits on the card** (`weightKg || targetWeightKg` and `repsCompleted || targetReps` — Vitek: "show what's inside the card," no target-vs-last-performed logic), **first 3 sets then `…`**. Format `${reps} × ${weight}kg`; bodyweight → `${reps}×`. Style `collapsedSetsSummary` (12.5px `#7a7a7a`, tabular-nums). Rendered inside the name column after the `ogLabel`. Normal-mode supersets get it automatically (they render through `ExerciseCard`); the edit-mode `SupersetGroupCard` is drag-only and intentionally doesn't.
> 2. **Expanded card has a NOTE footer at the bottom** — after the photo row, a hairline-topped row: left = **`NOTE  ·  <date>`** label + the latest note text (≤3 lines); right = **`See all ›`** (`chevron.right`) which opens the full notes sliding panel (`onOpenInfo` → `ExerciseInfoModal`, where you read/write/delete). If no note: shows "No notes yet" + **`Add note ›`** (client: hidden entirely in `readOnly` view). Module-level helper **`latestExerciseNote(ex)`** = newest non-deleted note, **trainer note preferred over client note** (arrays are oldest→newest, so `[length-1]`). Styles `noteFooter*` (row is `alignItems:'center'` so the action vertically centers on the note — an earlier `paddingTop:12` hack was removed after Vitek flagged it as off-center). The note persists across sessions (notes are workout-level), so yesterday's note still shows today with its date.
> 3. **Green dot next to the exercise name for a "new" note** (8px `ACCENT`, more visible than the 6px Info-button dot; and visible while COLLAPSED, which the Info dot can't be since it's in the expanded action row). **"New" is cross-session + time-based, exactly per Vitek:** a note shows the dot only while it's **newer than the most recent COMPLETED session** — i.e. written since the client last trained this workout — and the dot **clears on its own once they complete another session** (the note text stays, with its date). Implementation: `NoteEntry` gained `createdAt?: string` (populated from `notes.created_at` at the exercise-note load; a note added mid-session has `createdAt` undefined → treated as new); the load's recent-completed-sessions query now also selects `created_at`, and `[0].created_at` is stored in new state **`lastCompletedSessionAt`** (client sets it next to `setViewedSessionDuration`; trainer next to `setSessionCount`). Threaded into `ExerciseCard` as prop `lastCompletedSessionAt` (client 2 call sites, trainer 3 call sites). Dot = `latestNote && (lastCompletedSessionAt == null || latestNote.createdAt == null || latestNote.createdAt > lastCompletedSessionAt)`. Both timestamps are Postgres-format strings from the same source → lexicographic compare == chronological (they're always hours/days apart, so fractional-second edge cases never bite). This **replaced** the earlier session-ephemeral `infoSeen`-gated name dot; the Info-button `showInfoDot` (change-indicator, `infoSeen`) is unchanged.
> 4. **BUG FIXED — `workout_sets` were being DOUBLED** (Vitek saw a 3-set exercise render `1,1,2,2,3,3`). **Root cause (confirmed via DB):** the doubled rows were inserted **2.4 ms apart, both `is_added_during_session:false`** → a double-fire of the **workout-builder** `handleSave` (NOT Do Mode — its inserts use `is_added_during_session:true`). In the update-in-place path both runs delete-then-insert `workout_sets` and interleave → 6 rows. **Fix:** added a synchronous re-entrancy guard **`savingRef`** (a `useRef`) in `workout-builder.tsx` — `handleSave` returns immediately if `savingRef.current`, sets it true, and a new **`finally { savingRef.current = false }`** resets it on every exit (so the conflict-prompt re-invoke still works). `saving` state alone couldn't guard (async). **Also cleaned the existing duplicates in prod** — deleted 15 dupe rows across 5 workout_exercises (kept earliest per `(workout_exercise_id,set_number)`); 0 dupe groups remain.
> - **Where we finished / next:** COMMITTED & PUSHED (July 2026). Typecheck-clean (baseline 29). The trainer mirror is untested on a real build (client side was confirmed). Vitek may still want: cross-session "new" tuned (e.g. only trainer notes trigger the dot, currently client notes can too), or the footer note choice changed (currently trainer-preferred). The set-summary on edit-mode superset cards was deliberately skipped.
>
> **▶️ RESUME HERE — Do Mode "Session in progress" leave-dialog + Apple-style Liquid Glass confirm cards (July 2026, COMMITTED & PUSHED).** Both Do Mode files (`app/(client)/workout/[workoutId].tsx` + `app/(trainer)/client/[id]/workout/[workoutId].tsx`). Two things: (1) **The leave-session dialog** now has a `message` subtitle + **three real buttons** — **"Leave — keep it running"** (green, reworded from "Leave for now" to make the background-running behaviour clear), **"Discard session"** (red), **"Keep going"** (grey `confirmSecondaryBtn`; promoted from a faint `cancelText` link to a proper button). (2) **The shared centered `confirmModal` card** (and the free-session-name modal — same `confirmBox` style) is a **Liquid Glass panel** via a module-level **`GlassPanel`** helper. **Latest tuning (matches Apple's Notification Centre glass):** the material is now the ADAPTIVE **`GlassView glassEffectStyle="regular"`** (auto-tints to the content behind, keeps a specular edge, stays genuinely see-through) — NOT the earlier flat `"clear"` glass + heavy `rgba(255,255,255,0.5)` white wash, which read as milky plastic. The white scrim is now a **whisper**, `const GLASS_SCRIM_OPACITY = 0.14` (the ONE knob — raise toward 0.22 for more legibility/frost, lower toward 0.06/0 for more transparency); `BlurView` fallback intensity bumped `18→30` to compensate. Panel still borderless, `borderRadius:38`, soft shadow via `confirmBoxShadow`, `centeredRoot` dim 0.38. **`confirmSecondaryBtn` ("Keep going") changed** `#f0f0ee`→**`#c8c8c2` + a `rgba(0,0,0,0.08)` hairline border** — the old near-white pill vanished against the light glass; the soft grey + border reads as a button while staying subordinate to the green/red (and holds up if the glass ever renders darker). **Buttons stay FULL colour + white/dark text** (translucent/tinted-glass buttons were tried and rejected as washed-out). **NOTE on transparency:** `regular` glass adopts the tone of whatever's directly behind it — over the pale blurred exercise cards the panel reads milky-white (correct/expected, like an Apple sheet over a white list); it looks much more see-through over high-contrast content. **Possible next tweak:** the title/body are DARK text — if `regular` ever tints dark over a dark cover image the text could get muddy; fix would be bump the scrim or flip text to white. Full detail in §5 "Back button behavior" + the "Confirm-modal card = frosted Liquid Glass" note there. Typecheck baseline stays 29. Real glass only shows in an iOS-26 build. **All JS — hot-reload; `expo-glass-effect`/`expo-blur` already in the binary.**
>
> **▶️ RESUME HERE — Trainer "Edit workout" full-edit + menu polish (July 2026, COMMITTED & PUSHED).** Vitek: on the trainer side a workout's ⋯ only let you Rename — he wanted to fully edit an existing workout (name, **type/category**, **post-workout stretch**, **cover picture**, exercises). The **workout builder already supported this** via the `editWorkoutId` param (edit-in-place, preserves session-log history by soft-removing exercises) — it just wasn't exposed. Changes:
> 1. **"Edit workout" added to all 3 trainer workout ⋯ menus** — Library (`(tabs)/library.tsx`), client all-workouts (`client/[id]/all-workouts.tsx`), and the client-profile Training tab (`client/[id]/index.tsx`). Each opens `router.push('/(trainer)/workout-builder?clientId=<owner>&editWorkoutId=<id>')` (client-scoped menus pass the profile clientId; Library passes the workout's own `clientId`). Icon `square.and.pencil`.
> 2. **"Rename" REMOVED from all 3 menus** (Vitek: "it's part of the edit feature, that's enough"). The old `startRename`/`confirmRename`/rename-modal code is left in place but unreachable (dead, harmless).
> 3. **Builder is now a TRUE pure-edit when opened without `scheduleDate`** (`workout-builder.tsx`): (a) **`handleSavePress` fast-path** — when `editWorkoutId && !scheduleDate && loadedWorkoutClientId`, it SKIPS the SaveSheet (no re-picking client/placement) and calls `handleSave` directly with an intent built from the loaded workout's own placement (`existing-routine` if `loadedRoutineId`, else `standalone`), so a pure edit can't accidentally unlink a routine workout. (b) New state `loadedRoutineId` + `loadedOrderIndex` (set in the `editWorkoutId` hydration); a pure edit preserves the existing routine **position** (`order_index = loadedOrderIndex`) instead of appending. (c) **Set targets:** hydration now pre-fills set rows from the workout's OWN `target_reps`/`target_weight_kg` for a pure edit — the last-performed pre-fill (`fetchLastPerformedMap`, blank if never done) is now gated to the **schedule** flow (`scheduleDate` present) only. Without this, saving a pure edit would overwrite the planned targets with last-performed values (or blanks). The schedule flow (`add-workout.tsx` → `editWorkoutId + scheduleDate`) is unchanged.
> 4. **Training-tab gallery cards' ⋯ now opens the FULL options panel** (was details-only). Previously the WORKOUTS-gallery card ⋯ opened `SessionDetailsSheet` directly; now it opens the `WorkoutMenuModal` (Edit workout · **Session details** · Add to Routine · Mark as done/Reactivate · Delete). "Session details" (relabelled from "View exercises", icon `list.bullet.rectangle`) is the option that opens `SessionDetailsSheet` (via `openViewExercises`, `{id,name,category}` — no session-specific stats, same as before). `activeMenu` state was widened from `WorkoutWithLastDate` to a minimal `{id;name;category;status?}` so both gallery cards (`WorkoutCard`) and the Recent Activity card (`WorkoutWithLastDate`) can open it.
> 5. **Training-tab `WorkoutMenuModal` converted from a centered `Modal` → `BottomSheet`** (slides up from the bottom, `close(handler)` pattern) — matching the all-workouts/Library menus + the app-wide menu convention. (`menuStyles.option` already has `paddingHorizontal:20` so rows fit the sheet.)
> 6. **Builder header → LIGHT** (Vitek: "no dark green header anymore, like the other screens"). The builder keeps its OWN in-flow `SafeAreaView` header (NOT the shared `LightHeader` — its right slot is a 44px icon slot too narrow for the text **Save** pill, same reason the meal/recipe editors keep custom headers): `root`/`headerSafe` bg `HEADER`(#244e43)→`BG`(#faf9f7), back chevron tint `#fff`→`HEADER` (`weight="semibold"`, size 22), title `#fff`/17/600 → `TEXT`/20/700 + dynamic **"Edit Workout"** (when `editWorkoutId`) / "Build Workout", `StatusBar` `light-content`→`dark-content`, `headerBar` gained a hairline bottom border. The green ACCENT **Save** pill is unchanged. Title is roughly centred by `space-between` (not dead-centre like `LightHeader`).
> Typecheck clean — baseline stays 29 (the pre-existing gesture-handler/any errors). **All JS changes — hot-reload, no native rebuild needed.**
>
> **▶️ RESUME HERE — Header GREEN TINT (A/B test, July 2026, COMMITTED & PUSHED).** Vitek liked the see-through glass header but wanted "a bit more character" — a faint brand-green wash — WITHOUT going back to the heavy dark-green bar. Done in **`components/LightHeader.tsx`** (glass variant only): the header's **tint layer** (which was decoupled off-white `rgba(250,249,247,…)`) is now a **light MINT** `const TINT = '150,201,178'` (rgb string). **Dark-green tint was ruled OUT** — the header glyphs/title are dark-green `#244e43`, so a dark tint kills contrast. Two structural changes made the green read well: (1) the **blur is now clipped in its OWN inner `overflow:'hidden'` container** (still ends crisply at the header edge — content stays sharp), and the **`lh.wrap` no longer clips** so (2) the **green tint gets its own gradient with a LONG tail** that extends **`const TINT_DROP = 70`px BELOW the nav row** (5 stops `0.95→0.7→0.4→0.15→0`, reaching exactly 0) — it washes gently down into the page instead of cutting off at the title (the "green finished too soon" fix). The green is rendered **ON TOP of** the blur (light frost would otherwise wash it out). **Tunable knobs:** `TINT` (hue/depth), `TINT_DROP` (tail length). Because the tail overlaps the top of content, **Appointments + Me** bumped their scroll `paddingTop` to **`headerH + 14`** (was `headerH`) so their first white CARD starts below the wash (Training didn't need it — its first content is the transparent gauge). **A/B PROP:** added **`plain?: boolean`** to `LightHeader` — renders the **original neutral off-white tint** (short fade within the header, no green) for a see-through comparison. **All 5 nutrition screens pass `plain`** (`nutrition/index`, `favourites`, `weekly`, `grocery-list`, `recommendations`) so testers compare green (main tabs + training sub-screens) vs plain (nutrition). **Solid headers unaffected** (trainer tabs + client-detail — opaque, no tint layer). Typecheck clean (baseline 29). **Next:** once testers weigh in, make it uniform (green everywhere or plain everywhere) by flipping/removing the `plain` props.
>
> **▶️ RESUME HERE — Favourites + Recipe polish (July 2026, NOT yet committed/pushed).** This session touched **3 files** (`app/(client)/nutrition/favourites.tsx`, `app/(client)/recipe/create.tsx`, `app/(client)/recipe/[id].tsx`) — all typecheck clean, no new tsc errors (baseline stays 29 unrelated). **These changes are LOCAL ONLY — review + commit/push when ready** (Vitek left before I finished; he'll pick up after `/clear`). What changed:
> 1. **Meals sort pills removed** — the Newest/Oldest/A–Z/Z–A row is gone; meals now always sort **alphabetically**. (Vitek: "alphabetically by default and that's enough.")
> 2. **Recipe editor `recipe/create.tsx` REBUILT to mirror the meal editor** — draft-first + auto-save, frosted `LightHeader`, cover card below header, name/portions rows, per-portion nutrition strip, meal-style ingredient rows (swipe-remove + tap-edit-amount), instructions sheet, Share-with pills, Save/Delete. Now takes **`?id=<recipeId>`** (+ `?isNew=1`); the old `?editId=` is gone. Favourites "+" → new `startNewRecipe()` inserts a draft row then opens the editor. **Logging stays on the recipe detail page** (recipes have one, unlike meals). See CLAUDE-nutrition.md "Recipe editor screen".
> 3. **Recipe detail `recipe/[id].tsx` REDESIGNED** — frosted `LightHeader` (name in header) + **cover as a card below the header** (like meals; was a hero with overlaid name/buttons); the owner **⋯ menu is now a slide-up `BottomSheet`** (was centered modal); Delete confirm → centered modal (was `Alert.alert`). (Vitek's 2 screenshots: "picture under the header like meals; ⋯ should slide from the bottom.") See CLAUDE-nutrition.md "Recipe detail screen".
> 4. **Favourites search bars FOLD under the header (WhatsApp-style)** — in Recipes/Meals/Foods/Recommendations the toolbar (search + `+`, filter pills, or the Recomm. tab switcher) now lives **INSIDE the sub-view ScrollView** (was a fixed bar above it, so cards slid *behind* the search bar and never reached the frosted glass). New `s.emptyScroll` style for in-scroll empty states. See CLAUDE-nutrition.md "Search bar / toolbar FOLDS under the header".
> - **We DECIDED NOT to add a FAB to Favourites/Grocery** (Vitek's earlier idea) — redundant with the one-tap-into-sub-view + existing `+`; keeping the FAB unique to the Food Log so it stands out. Grocery already has its own add.
> - **Possible next tweaks Vitek may raise:** none open that I know of; verify the fold effect + recipe editor/detail on a real build.
>
> **▶️ RESUME HERE (nav redesign — client side DONE, July 2026).** Client nutrition + main tabs are fully migrated & **all pushed**: tabs → `NativeTabs`, headers → `LightHeader`, recipe + meal editors → `(client)` stack routes, round-2 spacing fixes, round-3 meal-editor polish (A–C), round-4 native-tab spacing + bar-retention (D–F). **Everything is committed AND pushed** — `git log origin/main..HEAD` should be empty. Vitek confirmed round-4 in a build ("works").
>
> **▶️ RESUME HERE — Trainer tabs → `NativeTabs` DONE (July 2026, LOCAL ONLY, not committed).** `app/(trainer)/(tabs)/_layout.tsx` rewritten from `<Tabs>` to `<NativeTabs>` (5 triggers: clients/schedule/library/finance/account; **`tintColor="#24ac88"` (ACCENT green — matches the client side; Vitek asked for accent in the bottom nav, was `#244e43`)**; `schedule` uses `sf="calendar"` — no `.fill`). **Unlike the client tabs, there is NO shared glass header** — each trainer tab screen renders its OWN in-flow dark-green `SafeAreaView` header (TrainerLogoButton), so the TOP needed no changes; only the BOTTOM did (native glass bar is transparent → content flows under it). Added **`useTabBarHeight()` (from `@/components/FloatingTabBar`) + `paddingBottom: tabBarH`** to every scroll/list in all 5 screens: clients FlatList; finance invoice-FlatList + earnings-ScrollView; account scroll (also dropped its `SafeAreaView edges={['bottom']}` → plain `View`); library exercises-SectionList + WorkoutsTab (both ScrollViews) + NutritionTipsTab + FoodsTab (list `tabBarH+40`, **FAB moved to `bottom: tabBarH+16`**) + RecipesTab; schedule day-grid ScrollView + WeekView ScrollView + inline month-grid (`cal.grid` `paddingBottom: tabBarH`). Typecheck clean — baseline stays 29 (the 6 account.tsx errors are pre-existing gesture-handler/any errors, line numbers shifted +2). **Verify on an iOS-26 build (glass + vibrancy + content clears the bar), then commit/push.**
>
> **▶️ RESUME HERE — Trainer HEADERS → light `LightHeader` (stage 1: client-detail DONE — round-3, July 2026, COMMITTED & PUSHED).** Vitek: "same system as client side; in the client-detail the header stays and the [5-tab] nav is on top." **⚠️ The glass-pill wording below (round-1/round-2) is SUPERSEDED by round-3 — the main tabs are now a plain UNDERLINE switcher and the glass pill moved down to the sub-tabs (see round-3 paragraph + the "Client profile layout" section).** **Done on `app/(trainer)/client/[id]/index.tsx`:** dark-green `SafeAreaView` header → **`LightHeader solid`** (back chevron · client name · `plus`; `StatusBar dark-content`; root bg `HEADER`→`BG` #faf9f7). Session timer → `LightHeader` `overlay` slot (`hdrSessIndicator`, tap → `resumeSession()`). The 5-tab underline switcher → a **`TabPillSwitcher`** component (module-level in the file): a pinned strip at `top: headerH` (`useHeaderHeight()`) with **NO outer track** — just the 5 titles + a **single glass pill that PHYSICALLY SLIDES** (`Animated.spring` on `translateX`, native driver) to the active tab. Pill = `GlassView glassEffectStyle="regular"` (from **`expo-glass-effect`**, real Liquid Glass on iOS 26) over a white base (`segPill`/`segPillInner`), gated by `isLiquidGlassAvailable()`; frosted-white fallback elsewhere. Labels: inactive **black** (`TEXT`), active **accent green** (`ACCENT`). Track width measured via `onLayout` → `itemW = trackW/5`; pill `translateX = idx*itemW + PILL_INSET(3)`, width `itemW-6`. Content pads `paddingTop: headerH + SEG_STRIP_H(56)` + `scrollIndicatorInsets` + RefreshControl `progressViewOffset`.
> **Round-2 polish (all from Vitek's build screenshots):** (1) **header is `solid` NOT see-through** — the translucent glass ghosted the dense week-strip underneath (messy); added a **`solid?: boolean` prop to `components/LightHeader.tsx`** = opaque `#faf9f7` header, no blur/mask/tint (client side keeps the glass — unaffected). (2) **title nudged up** — solid header's row height is `HEADER_ROW_HEIGHT - 10` so the title sits ~5px higher (was "too low"). (3) **switcher sits lower** (`segStrip` paddingTop 12) + no track pill. (4) **bottom tab bar tint → ACCENT green** (`_layout.tsx`). (5) **Nutrition + Progress sub-tab switchers → plain underline text** (like the client-side Progress switcher), NOT the pill toggle: **Progress** just passes `variant="client"` to `ProgressTab` (already supported); **Nutrition** (`nutrition-tab.tsx`) — restyled its `switcher*` styles to the underline pattern (`gap:32`, `borderBottomWidth:2` ACCENT active, 17px, `#bbb` inactive / `TEXT` active). Typecheck clean — baseline 29 (the client/[id]/index.tsx errors are pre-existing gesture-handler/any).
>
> **Round-3 — switcher redesign + spacing (Vitek's build feedback, July 2026, THIS is the current state):** the sliding glass pill on the **main 5-tab row was too heavy** and clashed with the sub-tab underline stacked right under it. Fixed: (1) **Main tabs → plain UNDERLINE** (`TabPillSwitcher` rewritten — active = accent text + 2px accent underline hugging the label, inactive black; `segPill`/`segPillInner`/`PILL_INSET` + the `Animated`/`expo-glass-effect` imports removed from `index.tsx`; `SEG_STRIP_H` 56→50). (2) **Sub-tabs → a GLASS TOGGLE** — new reusable **`components/GlassToggle.tsx`** (faint frosted track + sliding `GlassView` pill / frosted-white fallback), so the glass migrates DOWN one level where a 2-item pill reads as tasteful. Used by **Nutrition** (`nutrition-tab.tsx` — replaced the underline `switcher*` with `<GlassToggle>` + `s.subToggle`) and **Progress** (new **`variant="glass"`** branch in `progress-tab.tsx`; `index.tsx` now passes `variant="glass"`). **Client-side Progress unchanged** (`variant="client"` underline). (3) **Spacing:** `const segTop = headerH - 12` pulls the switcher + content up (tighter gap under the title); content pads `segTop + SEG_STRIP_H + 12` for breathing room below the tabs (indicator insets stay at `segTop + SEG_STRIP_H`). Net hierarchy: **underline = primary, glass toggle = secondary.** Typecheck clean (baseline 29). **Template pattern: "solid light header + pinned UNDERLINE main nav + `GlassToggle` sub-nav."**
>
> **✅ DONE (trainer headers stage 2, July 2026, LOCAL ONLY — not committed): the 5 trainer TAB screens** (clients/schedule/library/finance/account) migrated from dark-green `SafeAreaView` headers → **`LightHeader solid`**. Pattern applied to each: dropped the `SafeAreaView` header block + its `StatusBar barStyle="light-content"`; `StatusBar` → **`dark-content`**; root bg `HEADER`(#244e43) → **`#faf9f7`**; the `<LightHeader solid …/>` is rendered **LAST in the root View** (so it overlays), with **`left={<TrainerLogoButton light />}`** (new **`light` prop** on `components/TrainerLogoButton.tsx` — renders the VF glyph in dark green `#244e43` instead of white + a light hairline ring on the badge via `ls.badgeLight`; ALL the notif-badge/session/modal logic is unchanged), `title` = the screen name (**clients uses the `Hi <name>` greeting**), and `right` = a `HeaderIcon` wrapping `<SymbolView name="plus" size={22} tintColor={HEADER_ICON} weight="semibold"/>` for the four screens that had a `+` (account has **no** right slot). Content offset: each screen's first content element pads `paddingTop: useHeaderHeight()` (**clients/schedule** on their `content` wrapper View; **library/finance** on the `segmentWrapper` — `headerH + 14` / `headerH + 12`; **account** on the scroll `contentContainerStyle` — `headerH + 8`) — on TOP of the existing `paddingBottom: tabBarH`. The old `headerSafe`/`headerBar`/`headerTitle`/`addButton*` styles were deleted from all 5. **The `+` right-slot is now dark-green (`HEADER_ICON`), NOT the old plain-white `+`** (white would be invisible on the light glass). Library's `+` keeps its segment/sub-tab-aware routing (exercises→add-exercise, workouts→workout-builder, nutrition→recipe-create / foods tick / tips tick).
> **Round-2 (from Vitek's build screenshots — same session):** (a) **`plan-week.tsx` (Planning)** — the ONE trainer screen still on the dark-green header — was ALSO migrated to `LightHeader solid` (it's a pushed stack screen, so **left = back `chevron.left` `HeaderIcon` → `router.back()`**, title "Planning", right = the `+` add-appointment `HeaderIcon`; `infoBar` padded `headerH + 10`; root bg → `#faf9f7`; dead `headerSafe`/`headerBar`/`headerSide`/`headerTitle`/`headerAdd` styles removed). (b) **Library + Finance switchers unified to the client-detail hierarchy** (Vitek: "library should have the same set up as client detail; make [Finance's pill] white/glass like the rest"): **Library main tabs (Exercises/Workouts/Nutrition) → plain UNDERLINE** (new `styles.mainTab*` — active = accent text + 2px accent underline, `fontSize:15`; was the dark-green Type-1 pill) and **both Library sub-tab switchers → `GlassToggle`** — Nutrition's Recipes/Recomm./Tips/Foods (4-item) and Workouts/Templates (2-item), each styled `wStyles.subToggle` (`marginH 16, marginTop 12, marginBottom 6`); the old `wStyles.underlineTab*` + `styles.segment*` were removed. **Finance's Invoices/Earnings → plain UNDERLINE** (`st.mainTab*`, same as the Library main tabs — round-3 correction: a `GlassToggle` was tried first but Vitek wanted the underline). Net trainer-side pattern is now uniform: **solid light header → UNDERLINE primary nav → `GlassToggle` secondary nav**.
> **Round-4 (glass "goes dark in the evening" — ROOT CAUSE FOUND: system dark appearance).** Vitek saw the **native tab bar + `GlassView` toggles (real iOS 26 Liquid Glass) go dark**, on BOTH sides, **only in the evening**. **Real cause:** the app was `"userInterfaceStyle": "automatic"` in `app.json`, so it followed the **system** appearance — and iPhones on **Display → Automatic flip to Dark at sunset**. The app's own JS views are hardcoded light so they look unchanged, **but native Liquid Glass surfaces are appearance-aware and render DARK in Dark mode** → dark nav/toggles at night, clearing briefly on tap (touch forces a re-composite). It was never about the *number* of glass surfaces (the earlier "too many GlassViews perturb the compositor" hypothesis was wrong; the Library toggles just added more dark surfaces to notice). **FIX: `app.json` → `"userInterfaceStyle": "light"`** — locks `UIUserInterfaceStyle = Light` so the whole app (incl. native glass) always renders light regardless of system/time. **⚠️ Native config change → needs a NEW BUILD (no hot-reload / OTA).** **Vitek confirmed the light-lock fixed it on a build.** The **`GlassToggle` `frosted` prop** (added in the wrong-hypothesis step — forces the frosted-white pill, no real `GlassView`, via `const glass = isLiquidGlassAvailable() && !frosted`) was then **reverted off the two Library toggles** → they're back to **real glass**, matching the client-detail toggles. The `frosted` prop is KEPT on the component (unused now, harmless — handy if a glass surface ever needs to opt out again). **The app must STAY `userInterfaceStyle: "light"` until a real dark theme is built** — flipping back to `automatic`/`dark` before then would make the native glass go dark at night again with no matching app-side dark styling. When dark mode IS built (every hardcoded colour needs a light/dark variant), flip `userInterfaceStyle` back to `automatic`.
> **Round-3 (Vitek's next round of build feedback, same session):** (a) **Finance Invoices/Earnings → underline** (see above, replaced the round-2 GlassToggle). (b) **Finance filter pills active colour → light-green `ACCENT`** (was dark-green `HEADER`) — both the invoice status pills (`invFilterPillActive`) and the earnings time-range pills (`pillActive`). (c) **Library resets its nav on LEAVE** — a second `useFocusEffect` whose blur-cleanup sets `segment='exercises'` + `nutSubTab='recipes'` + `workoutSubTab='workouts'`, so returning to the Library tab always lands on the first tab/sub-tab, never where you left ("you're not continuing the same work"). **Finance got the same treatment** — a blur-cleanup `useFocusEffect` resets `activeTab='invoices'` so it always reopens on Invoices, never Earnings. Typecheck clean — baseline stays 29 (the account.tsx + client/[id]/index.tsx errors are the pre-existing gesture-handler/any ones). **Verify on an iOS-26 build (solid headers sit cleanly; no ghosting; the 4-item Nutrition glass toggle reads well; Library resets on tab-switch; `+`/back/TrainerLogoButton taps work), then commit/push.**
>
> **⬜ THEN: retire `FloatingTabBar`** — move `useTabBarHeight()` to a tiny shared module (now consumed by client-tab + nutrition + all 5 trainer-tab screens), then delete the unused `FloatingTabBar` component. See the ⬜ item in the nav blockquote.
>
> **Nutrition — DONE & pushed:**
> 1. ✅ **Recipe open/create nav fixed** — moved `recipe/[id]` + `recipe/create` OUT of the nutrition tabs to `(client)` stack routes (`app/(client)/recipe/…`), removed hidden triggers, nav paths → `/(client)/recipe/X`, `tabBarH` → `insets.bottom`.
> 2. ✅ **Meal editor extracted** to its own frosted stack route `app/(client)/meal/[id].tsx` (was an in-file overlay in `favourites.tsx`). Frosted `LightHeader` (title = meal name / "New meal", updates on rename); **cover is a rounded CARD that starts BELOW the header** (`marginH 16, height 180, radius 16` — NOT a hero bleeding into the header; frosted look only on scroll); scroll uses `contentInsetAdjustmentBehavior="never"` + `paddingTop: headerH`. Layout: cover → **NAME row** → kcal/P/C/F → INGREDIENTS (+ Add food) → NOTES → SHARE WITH → **Save meal** (filled) / **Log this meal** (outline) / Delete. Auto-saves via `savePatch`; `?isNew=1` discards an empty+unnamed draft on back. Favourites `router.push`es to it; reloads meals on `useFocusEffect`. Old overlay + `md` styles + meal handlers/state removed from favourites.
>
> **Nutrition — round-3 (DONE & pushed):**
> - **A. Save button added** to the meal editor (`meal/[id].tsx`): **Save meal** (filled ACCENT → `router.back()`) is now the primary; **Log this meal** became the outline secondary; Delete unchanged. (Vitek: "we are missing a save button.")
> - **B. `components/FoodSearchModal.tsx` header → LIGHT** (was dark-green `#244e43`). Now `#faf9f7` bg + hairline bottom border, dark-green `xmark` + dark title, `StatusBar dark-content`. This is the SHARED add-food screen (food log, meal, recipe, favourites) — Vitek wanted it consistent with the frosted nav. (It's a `Modal` with a search bar right under the header, so it's a solid light header, NOT the scroll-under frosted `LightHeader`.)
> - **C. Meal cards → cover-image cards** (`mc` styles in `favourites.tsx`) matching the recipe cards + workout cover-card shape (were horizontal thumb+text rows). Now `height 130, borderRadius 14`, cover image / indigo gradient + dark bottom gradient, name + "N items · kcal · P/C/F" overlaid. Recipe cards (`rc`) were already this shape. (Vitek: "meal cards and recipe cards same shape as the workout cards.")
> - **STILL OPEN / possible next tweaks Vitek may raise:** he praised the header-shows-name behavior but there's now BOTH a header title AND a body "MEAL NAME" card (mild redundancy — left as-is intentionally; the body card is the rename control since `LightHeader`'s title isn't tappable). If he wants the name ONLY in the header, make the header title tappable to rename (needs a `LightHeader` tweak or a custom header) and drop the body NAME card.
>
> **Round-4 — native-tab spacing + bar-retention (DONE & pushed; Vitek confirmed "works"):**
> - **D. Progress + Me "content starts too low" FIXED (real cause found).** Both `(tabs)/progress.tsx` and `(tabs)/me.tsx` wrapped their scroll in **`<SafeAreaView edges={[]}>`**, which — under the native tab bar — injects a phantom top inset (~safe-area height) EVEN with `edges={[]}`. The round-2 `contentInsetAdjustmentBehavior="never"` did NOT cure it because the wrapper was the cause. **Fix: match `train.tsx` exactly — plain `<View>` root, and dropped the `never` override** (train has neither and is correctly spaced). `train.tsx` + `schedule.tsx` were already plain `View` → untouched. **RULE: client native-tab screens must use a plain `<View>` root, NEVER `SafeAreaView` — it double-insets the top under `NativeTabs`.**
> - **E. all-workouts + all-routines now KEEP the native bottom tab bar — via a NESTED STACK in the Training tab.** Vitek's rule: a workout LIST must behave like a meal LIST (bottom bar stays); only *opening* a workout (session-intro/Do Mode) hides it — mirroring meals. **The first attempt (hidden `NativeTabs.Trigger`s + `router.push`) FAILED silently — you CANNOT `router.push` to a hidden native-tab trigger** (the "See all" chevrons did nothing; this is the SAME wall that forced recipe screens out of the nutrition tabs). **Correct pattern: the Training tab is now a NESTED STACK.** `train.tsx` → **`app/(client)/(tabs)/train/index.tsx`**; `all-workouts` + `all-routines` moved to **`app/(client)/(tabs)/train/all-workouts.tsx`** + `train/all-routines.tsx`; new **`train/_layout.tsx`** = `<Stack screenOptions={{ headerShown:false }} />`. Because they're stack screens INSIDE the tab, `router.push('/(client)/(tabs)/train/all-workouts')` keeps the native bar. Both own a `LightHeader`, so the shared `ClientTabHeader` is **gated off by the LEAF segment**: `_layout.tsx` computes `leafRoute = segments[segments.length-1]` and `showSharedHeader = !leafRoute || !NO_SHARED_HEADER.has(leafRoute)` (`NO_SHARED_HEADER = {'all-workouts','all-routines'}`); `rawRoute` (segment after `(tabs)`) still drives the tab TITLE. Both list screens gained `useTabBarHeight()` → `paddingBottom: tabBarH` (+ `scrollIndicatorInsets.bottom`). The 5 nav paths in `train/index.tsx` point at `/(client)/(tabs)/train/all-{workouts,routines}`. Other refs to `/(client)/(tabs)/train` (home hero, Session/Stretch-Complete `router.replace`) still resolve to `train/index`. **RULE: to give a native-tab screen deeper pushable sub-screens that keep the bar, make the tab a FOLDER with its own `_layout` Stack — do NOT use hidden triggers + push.** **Availability, routine detail, past-sessions deliberately stay bar-less stack routes** (Vitek confirmed).
> - **F. Food-log `PearIcon` matched to the training-tab kettlebell** — `PearIcon` gained a `strokeWidth` prop (default `1.0`, so the home-hero watermark + `NotificationOverlay` pears are unchanged); the `nutrition/index` header instance is now `<PearIcon size={34} strokeWidth={1.5} />` (was `size={30}`, hardcoded stroke `1.0`) to match `<KettlebellIcon size={34} strokeWidth={1.5} />` — same viewBox `0 0 24 24`, so identical size + thickness, matching the solid VF mark's weight. (Vitek: "make the pear same thickness/size as the kettlebell.")

---

## 1. Scope

- **Single-trainer app** — Vitek is the only trainer and every client is always linked to him. There is no per-client trainer FK on `users`. When you need a client's `trainer_id` and no linking row exists (appointments, availability_slots, etc.), fall back to `supabase.from('users').select('id').eq('role','trainer').limit(1).maybeSingle()`.
- Both trainer and client sides are now being built — always check the current instruction for which side you are working on
- Trainer Do Mode: `app/(trainer)/client/[id]/workout/[workoutId].tsx`
- Client screens: `app/(client)/`
- Never modify files not mentioned in the current instruction
- Never add features not explicitly requested
- When in doubt, do less and ask

---

## 2. UI Patterns

### Modals — presentation convention (redesigned July 2026)
Two presentations, split by purpose (mirrors native iOS action-sheet vs alert). **NEVER dark glass bottom sheets — anywhere** (this ban is unchanged; the new sheets are WHITE).

**Slide-up white bottom sheet — for menus, pickers, and info panels.** Use the shared **`components/BottomSheet.tsx`**:
```tsx
<BottomSheet onClose={close}>{close => (<> …content… </>)}</BottomSheet>
```
- White sheet pinned to the bottom, drag-handle at top, dim overlay; dismiss via overlay tap, drag-down, or hardware back.
- **CONVENTION: mount = open.** The sheet plays a slide-in on mount and expects `onClose` to unmount it, so render it **only while open** — conditionally: `{open && <BottomSheet …/>}`, or an internal component that early-returns `null` when closed. Never leave it always-mounted behind a `visible` prop (the slide-in won't re-fire).
- Children may be a **function** receiving `close(then?)`: use `onPress={() => close(handler)}` on an action row so the sheet slides down **before** `handler` runs (e.g. opens the next screen/modal); `close()` just dismisses. For **select-then-confirm** flows (e.g. a move-date calendar), leave the intermediate selection taps unwrapped and only wrap the final confirm action + Cancel with `close(...)`.
- Rows that relied on an old centered card's `padding` need a `<View style={{ paddingHorizontal: 20 }}>` (or a local `sheetContent` style) inside the sheet, since `BottomSheet` adds no horizontal padding.
- **`avoidKeyboard` prop:** pass `<BottomSheet avoidKeyboard>` when the sheet contains a `TextInput` (e.g. a form-sheet like New Package) — it wraps the sheet in a `KeyboardAvoidingView` (`padding`) so it lifts above the keyboard. Do Mode's own note sheets achieve the same via their `useSheetDismissGesture` + `KeyboardAvoidingView flex-end` pattern (Training Notes / Muscle / Equipment / History are slide-up sheets that raise for the keyboard — matching the exercise Info note).
- **Centered text-entry modals that keep centered** (single-field confirm-style, e.g. invoice "Confirm Payment", the package Valid-until date) must still wrap their overlay in a `KeyboardAvoidingView` (`padding`) so the keyboard doesn't cover the input.
- This replaces the old "always centered" rule for ⋯ menus, option/list pickers (category, client, template, routine, stretch, year, machine brand, presets), and read-only info panels. The trainer-side rollout is done; when adding a NEW menu/picker/info popup, use `BottomSheet` — do not build a new centered-fade modal for these.

**White centered modal — for binary confirm/abort AND single-value text entry only.** Keep centered: `confirmModal`-style yes/no dialogs (delete/keep, deactivate/reactivate, leave/discard, conflict prompts) and quick text-entry modals (rename, set value, notes). White bg, borderRadius 16, centered, dimmed overlay behind.
- **NEVER native `Alert.alert()`** for confirmations — use the custom `confirmModal` state pattern (title, message?, confirmLabel, danger?, onConfirm). Primary action = green filled pill (red if `danger:true`); cancel = gray text link below. Exception: error-only alerts (upload failures, permissions) may use Alert.alert. This includes ALL destructive actions: deactivate routine, reactivate routine, delete routine/workout/exercise, close package, etc.

**Special overlays keep their own treatment** (not part of this split): Do Mode's existing `useSheetDismissGesture` sheets (ExerciseInfoModal, SetHistoryModal, ExerciseProgressSheet, client DotsMenuSheet), full-screen video/photo/rest-timer/tooltip overlays, multi-step forms (SaveSheet, NewAppointmentSheet), calendar/time-grid pickers already inside slide sheets, and the nutrition `+` popover (opens-from-button).

### Data entry
- **All single-value data entry outside Do Mode:** tappable row → centered white modal with TextInput + Confirm button + Cancel link. Row shows current value right-aligned. Use `InputAccessoryView` to suppress iOS keyboard Done toolbar.
- **Exception:** Do Mode weight/reps inputs = inline TextInput (speed required)
- Reference: `InfoTab` in `app/(trainer)/client/[id]/index.tsx`

### Trainer header + buttons
- **All trainer screens with a + in the header** (clients.tsx, finance.tsx, library.tsx, all-invoices.tsx, client profile index.tsx): plain white `+` text, **no green circle background**.
- Style: `addButton: { padding: 8 }`, `addButtonText: { color: '#fff', fontSize: 24, fontWeight: '300' }`
- **Client profile header +** (top right of `app/(trainer)/client/[id]/index.tsx`): opens an **"Add Session"** slide-up `BottomSheet` (`addModal`) that **mirrors the week-strip + menu**, defaulting every action to **today** (July 2026 — it used to navigate straight to the builder). Options: **Create new workout** (`square.and.pencil` → `/(trainer)/workout-builder?clientId=${id}`) · **Add workout to this day** (`plus.rectangle.on.rectangle` → `/(trainer)/client/${id}/add-workout?date=<today>`) · **Plan a workout** (`calendar` → shared `PlanWorkoutFlow` scheduled to today) · **Continue routine** (`arrow.triangle.2.circlepath`, only when `training.activeRoutine` exists → routine detail) · **Start Free Session** (`timer`, ACCENT → `workout/free`). The two-step Plan flow (pick → schedule) is the extracted **`PlanWorkoutFlow`** component (module-level in `index.tsx`), shared by both this header + and the week-strip + (the duplicated copy inside `WeekStripCard` was removed).

### Client profile layout
- No avatar/profile card between header and tab bar
- **Header = `LightHeader solid` (July 2026, see the RESUME note up top)** — the old dark-green `SafeAreaView` header is gone; back chevron · client name · `plus`, `StatusBar dark-content`, root bg `#faf9f7`. **`solid`** = opaque (not see-through glass) because the dense week-strip ghosted through the translucent version. Session-timer indicator lives in the `LightHeader` `overlay` slot.
- Tabs: **Training / Sessions / Nutrition / Progress / Info** — default opens on Training. **Sessions is its own top-level tab** (July 2026) — the old Training/Sessions segmented toggle *inside* the Training tab was removed; `SessionsTab` is now rendered directly at `activeTab === 'sessions'`. The Training tab was too content-heavy to also host the toggle.
- **The 5-tab (main) switcher is `TabPillSwitcher`** (module-level in `index.tsx`) — a **plain UNDERLINE switcher** (July 2026 round-3): pinned just below the solid header (`top: segTop`, where `const segTop = headerH - 12` pulls it up so the title sits tighter; content pads `paddingTop: segTop + SEG_STRIP_H(50) + 12` for breathing room, `scrollIndicatorInsets`/`progressViewOffset` at `segTop + SEG_STRIP_H`). The 5 titles are evenly spread (`segItem flex:1`); the active tab gets **accent-green text + a 2px accent underline under the label only** (inner `segUnderline` view hugs the text), inactive = **black**. **The sliding glass pill was REMOVED from here** — it read as too heavy for a 5-item primary row and clashed with the sub-tab toggle directly below. (Was: sliding `GlassView` pill → `#e7e7e3`-track pill → underline originally.)
- **Sub-tab switchers = a GLASS TOGGLE (`components/GlassToggle.tsx`), trainer side only** — a compact segmented switcher with a faint frosted track (`rgba(120,120,120,0.09)`) + a single **sliding pill that's real Liquid Glass** (`GlassView glassEffectStyle="regular"`, iOS 26) over white, frosted-white fallback off iOS 26. Fills its parent width, options split evenly, `Animated.spring` translateX. Used by **Nutrition** (Planning/Overview — `nutrition-tab.tsx`, `s.subToggle`) and **Progress** (Body composition/Strength — new `variant="glass"` branch in `ProgressTab`). Net two-level hierarchy: **underline = primary tabs, glass toggle = secondary sub-tabs** (never confused). **The client-side Progress screen is UNCHANGED — it still passes `variant="client"` (underline).**

### SF Symbols — known missing variants
- `calendar.fill` does **not** exist as an SF Symbol — use `calendar` for both focused and unfocused states; the active tint color provides the visual distinction. Never use `calendar.fill`.

### Client progress tab switcher
- The client progress screen passes `variant="client"` to `ProgressTab` — this renders a plain underline text switcher (centered, 17px, gap 32, 2px ACCENT underline on active, #bbb inactive) instead of the Type 1 pill switcher
- **The trainer client-profile progress tab passes `variant="glass"` (July 2026 round-3)** — the trainer side uses the **glass toggle** (`GlassToggle` via the new `variant="glass"` branch in `ProgressTab`), matching the Nutrition sub-toggle. The **client** Progress screen keeps `variant="client"` (underline). The old `variant`-less dark-green Type 1 pill branch still exists but is unused. (Before round-3 the trainer side briefly also used `variant="client"` underline.)
- Styles are `underlineTabBar / underlineTabItem / underlineTabItemActive / underlineTabText / underlineTabTextActive` in the `s` StyleSheet of `progress-tab.tsx`

> **⏳ Nav chrome redesign (July 2026) — IN PROGRESS. The header is FINALIZED. The tab bar was PIVOTED from the custom `FloatingTabBar` to the REAL native iOS tab bar (`expo-router/unstable-native-tabs` `NativeTabs`) — see the "🔀 TAB BAR PIVOT" note directly below.** The heavy dark-green (#244e43) 62px header + flat welded tab bar are being replaced app-wide with a **GLASS light header** (`components/LightHeader.tsx`) + a glass capsule tab bar. **No center "+" button** (add actions are contextual). **Native modules involved — `@react-native-masked-view/masked-view` (header blur fade), plus `react-native-screens` native `BottomTabs` (the native tab bar) — a FRESH iOS-26-SDK NATIVE BUILD is required to see the Liquid Glass. Expo Go / older dev clients render the native bar as a flat OPAQUE capsule with NO glass and a dark tab-switch flash — those are Expo artifacts, NOT bugs; judge nav ONLY in a real iOS-26 build.**
>
> **🔀 TAB BAR PIVOT (July 2026) — custom `FloatingTabBar` → native `NativeTabs`.** Vitek and Claude spent a long session hand-building the JS `FloatingTabBar` (gesture pill, glass bg) but it hit a hard ceiling: a JS bar can't do Apple's **vibrancy** (inactive icons/labels flipping to white over dark content) — the labels vanished over dark cover images. The custom glass also "snapped" light↔dark as content scrolled (native Liquid Glass adaptive tint). Decision: **abandon the custom bar and use the real native tab bar** (`NativeTabs` from `expo-router/unstable-native-tabs`, backed by `react-native-screens@4.16` `RNSBottomTabs`). The native bar gives real iOS 26 Liquid Glass, the morphing selection, AND vibrancy — all for free. Cost: Apple controls styling (green `tintColor`, SF Symbols, labels; no custom mint pill / gesture-drag). **`components/FloatingTabBar.tsx` is RETAINED but only for its `useTabBarHeight()` hook** (the 4 client tab screens still import it for `paddingBottom`); the `FloatingTabBar` *component* is no longer rendered. **`components/LightHeader.tsx` (the glass header) is UNCHANGED and stays** — it's separate from the tab bar and works over native tab content as a sibling overlay. The `FloatingTabBar (finalized)` bullet-list below is now HISTORICAL (describes the abandoned custom bar) — kept for reference only.
>
> **NativeTabs usage pattern (`app/(client)/(tabs)/_layout.tsx`, done):** the `_layout` returns `<View flex:1>` wrapping `<NativeTabs tintColor={ACCENT} backBehavior="none">` with one `<NativeTabs.Trigger name="…"><Label>…</Label><Icon sf={{default,selected}}/></NativeTabs.Trigger>` per route (`overview` gets `hidden`), and renders the shared `ClientTabHeader` (LightHeader) + session modal + `NotificationOverlay` as sibling overlays AFTER it. `NativeTabs` has **no `screenListeners`** → the active-tab title is derived from `useSegments()` (segment after `(tabs)`). Import `NativeTabs, Icon, Label` from `expo-router/unstable-native-tabs`. Each tab screen keeps its own content padded by `useHeaderHeight()` (top) + `useTabBarHeight()` (bottom) — unchanged from the FloatingTabBar era.
>
> **`FloatingTabBar` (HISTORICAL — abandoned, see TAB BAR PIVOT above; kept for reference):**
> - Floating capsule (borderRadius 28, soft shadow on a non-clipping outer wrapper) that **FLOATS over content** (host wrapper `height:0` → RN reserves no space; pill absolutely pinned to bottom; content scrolls under). Exports **`useTabBarHeight()`** (`OUTER_TOP(6) + PILL_HEIGHT(64) + bottomPad`, `bottomPad = max(insets.bottom-8, 8)`); each tab screen pads its scroll `paddingBottom` by it. Bar is a touch tighter via `pill.paddingVertical:8` + lens `top/bottom:4`.
> - **Bar background = REAL iOS 26 Liquid Glass** — a full-bleed `GlassView glassEffectStyle="regular"` (gated by `isLiquidGlassAvailable()`); older iOS falls back to `BlurView intensity 44` + `rgba(255,255,255,0.42)` tone. **Do NOT wrap the bar-bg glass and the selection pill in a `GlassContainer`** — it merges them into one flat frosted sheet (this was the "flat white lens" bug).
> - **Selection = a near-opaque pale-mint PILL** (`PILL_BG = rgba(226,244,238,0.95)`) rendered BEHIND the icons — Apple's trick (transparent bar, near-solid pill) so the active icon/label stay readable over ANY content. It is **NOT glass** (a glass pill in a JS bar lands in the uncanny valley — the finished decision was to go confidently custom). Active glyph/label = bright ACCENT green; inactive = `#3a3a3c` dark grey. **Content-hugging + evenly spaced:** tabs are content-sized (row `justifyContent:'space-around'`), each reports its measured frame via `onLayout`, and the pill hugs the active tab's icon+label (`+PILL_H_PAD(12)` each side, uncapped so long "Appointments" isn't clipped) — narrow pill on "Me", wide on "Appointments", uniform gaps.
> - **Gesture-driven expand/grab (mirrors Apple):** a bar-wide `PanResponder` owns all taps+drags (items are `pointerEvents:'none'`; a transparent `touchLayer` on top holds the handlers). **Press** → pill puffs up (`scaleX→1.3`, `scaleY→1.2`). **Drag** → it stays big and follows the finger, width morphing to the tab under it. **Release** → `settle(pos)` springs position+width to the target tab and scale back to 1 (the "grab"). Icons `size:26`, labels `11px/700`.
>
> **`LightHeader` (finalized — progressive blur re-tuned July 2026, "super-gradual, no seam"):** WhatsApp-style glass header, `position:absolute` OVER the content (page scrolls under; each screen pads scroll `paddingTop` by `useHeaderHeight()` = `insets.top + HEADER_ROW_HEIGHT(58)`, + `scrollIndicatorInsets.top` + RefreshControl `progressViewOffset`). Bare icons (no chip circles): kettlebell 34, VF **26**, back chevron 24 — via `HeaderIcon` (bare button + optional green badge dot). **REAL progressive blur (the WhatsApp seamless edge):** a `@react-native-masked-view/masked-view` gradient MASK is applied to a `BlurView(intensity 62)`, a **6-stop ramp across the WHOLE header** (`rgba(0,0,0,1→0.95→0.5→0.2→0.06→0)` at `locations [0, 0.42, 0.58, 0.7, 0.85, 1]`) — near-full milk held at the top, then a STEEP drop through the upper-middle to a whisper-thin TAIL that reaches **exactly 0 at the bottom edge**. **TWO hard rules learned from Vitek's iterations, do NOT violate either:** (1) **the blur MUST reach 0 at the very bottom edge (`location 1`)** — if the fade *completes* higher (e.g. 0.86) there's a visible "blur stops here" endpoint = the LINE reappears (worst over dark cover images). (2) To keep content below crisp (the gauge arc must not soften before it reaches the title), **do NOT raise the lower blur values** — instead drop off fast in the upper-middle and leave only a faint tail; the arc stays sharp because the lower region carries ~5–20% blur, yet there's no line because it still ends at 0 at the edge. The old abrupt "full until ~76% then fade only in the last 24%" was the original line; a flat full-blur region OR finishing the fade above the edge both bring the seam back. Header height is UNCHANGED (do NOT extend it lower — it reaches the gauge and looks bad; `FADE_ZONE(36)` stays). The **light tint is DECOUPLED from the blur** — its own `LinearGradient` (`rgba(250,249,247,0.66→0.38→0)` at `locations [0, 0.5, 0.82]`), NOT inside the mask, so it whitens the top for legibility but is gone by ~82% down (a semi-opaque colour band lingering near the bottom is an INDEPENDENT seam source — keep it off the bottom; being light, it can end before the edge without a line, unlike the blur). Stacked-blur bands were tried and rejected earlier (they show "melted ice" lines). `HEADER_ICON = #244e43`. Screens use `StatusBar dark-content` (black clock over the light glass). Optional `overlay` slot = absolute element that never shifts the centered title (session timer, or `routine/[routineId]`'s `(i)` history button).
>
> **Rollout status (staged; Vitek tests each iOS-26 build):**
> - **✅ DONE — LightHeader:** client `(tabs)/_layout.tsx` header + 4 tab screens; **+ 5 training sub-screens migrated to `LightHeader`**: `all-workouts`, `all-routines`, `availability`, `past-sessions`, `routine/[routineId]`. All keep `smartBack` + VF-home; old dark-green `SafeAreaView` headers + their styles deleted; root bg → `#faf9f7`; `StatusBar` → `dark-content`.
> - **✅ DONE — header polish (this session):** progressive-blur re-tuned (see `LightHeader` note above — no seam / crisp gauge / legible title). Title `20/700` (was 18/700; `800` was too heavy). Kettlebell in the header now `strokeWidth={1.5}` (new `strokeWidth` prop on `KettlebellIcon`, default 0.9 elsewhere) to match the solid VF mark's weight.
> - **⏳ IN PROGRESS — NATIVE TABS (this session, staged):**
>   - **✅ Client main tabs** (`app/(client)/(tabs)/_layout.tsx`) converted to `NativeTabs`. Vitek kicked off an **EAS build to verify the training tabs first** — awaiting his real-build feedback (glass + vibrancy + tab-switch flash) before proceeding. If the shared LightHeader overlay does NOT compose over the native tab content in the real build, PIVOT to rendering the header per-screen (extract `ClientTabHeader` + a shared hook).
>   - **✅ DONE (awaiting iOS-26 build feedback) — Nutrition nested tabs** (`app/(client)/nutrition/_layout.tsx`) converted to `NativeTabs` (4 visible: Food Log/Favourites/Weekly/Grocery + `tips`/`recipes`/`recommendations`/`recipe/create`/`recipe/[id]` as `hidden` triggers). **Food-log reworks:** `useBottomTabBarHeight()` → `useTabBarHeight()` (from `FloatingTabBar`) for the FAB popover math; the FAB (resting + popover ✕) now sits at `bottom: tabBarH` (screen content extends UNDER the native bar, so the screen & a full-screen Modal share ONE coordinate space — the old `+insets.bottom` Modal offset was dropped; popover card = `tabBarH + 40`); the selection-mode `navigation.setOptions({tabBarStyle:{display:'none'}})` was REMOVED — the native bar can't be hidden per-screen, so the **selection panel now floats at `bottom: tabBarH` ABOVE the still-visible native bar** (a Modal would block the food rows behind it, breaking multi-select). **Nutrition-tab build-verification items:** (a) FAB + selection-panel vertical position vs the glass bar, (b) whether `recipe/[id]` + `recipe/create` work as nested `hidden` NativeTabs triggers.
>   - **✅ DONE (awaiting iOS-26 build feedback) — Trainer tabs** (`app/(trainer)/(tabs)/_layout.tsx`) converted to `NativeTabs` (5 triggers: clients/schedule/library/finance/account; `tintColor="#244e43"`; `schedule` = `sf="calendar"`). No shared header (each screen owns its dark-green `SafeAreaView` header), so only bottom padding was added: `useTabBarHeight()` + `paddingBottom: tabBarH` on every scroll/list across all 5 screens (account also dropped `SafeAreaView edges={['bottom']}` → `View`; library FoodsTab FAB → `bottom: tabBarH+16`, its list `tabBarH+40`; schedule day-grid + WeekView ScrollViews + inline month `cal.grid`). See the top RESUME note for the full per-screen list.
>   - **⬜ Retire `FloatingTabBar`** now that ALL tab groups (client main + nutrition + trainer) are on NativeTabs — first move `useTabBarHeight()` out to a tiny shared module (consumed by client-tab + nutrition + all 5 trainer-tab screens) OR replace those paddings with the native inset, then delete the unused `FloatingTabBar` component.
>   - **🩹 BUILD-FEEDBACK FIXES (round 2, applied — see the RESUME note at the very bottom of this file):** Vitek tested the first nutrition build and flagged **"content starts too low"** on Progress + the Favourites sub-views (Foods/Meals/Recipes). **Root causes + fixes:** (1) **iOS auto content-inset** was stacking on top of the manual `paddingTop: headerH` for the *primary* scroll view of a native tab → added **`contentInsetAdjustmentBehavior="never"`** to every migrated ScrollView (progress.tsx + all nutrition scrollviews). This is now the REQUIRED pattern for any absolute-`LightHeader` + `NativeTabs` scroll screen — always set `never` or content double-insets. (2) The Favourites **Recipes/Meals/Foods/Recommendations sub-views** each render a **toolbar (search + `+`) ABOVE the ScrollView**, which sat at y=0 hidden UNDER the glass header (that's why the "+" looked missing AND content was doubly low) — fixed by offsetting each sub-view's `<View style={{flex:1}}>` wrapper with **`paddingTop: headerH + 8`** and dropping the `headerH` from the inner ScrollView (mirrors the grocery/recommendations toolbar-offset pattern). Days/landing sub-views have no toolbar → kept scroll `paddingTop: headerH` + `never`. (3) **Weekly** week-selector moved from a fixed header-attached bar INTO the ScrollView body (Vitek: "week switch needs to stay in the screen, not the header").
> - **✅ DONE (awaiting iOS-26 build feedback) — NUTRITION HEADERS:** the top-level nutrition tab screens migrated to the glass `LightHeader` (same pattern as the training sub-screens — header renders LAST over the content, scroll padded `paddingTop: useHeaderHeight()` + `paddingBottom: useTabBarHeight()`, root bg `#faf9f7`, `StatusBar dark-content`): **`nutrition/index`** (food-log — PearIcon→notif via `HeaderIcon badge`, VF-home, session-timer in the `overlay` slot at `right:66`), **`favourites`** (ONE `LightHeader` with a dynamic `headerTitle` + contextual back — foodSelect/insert/landing/sub-view; gated `{!mealDetail && …}` so it doesn't cover the full-screen meal editor, which keeps its OWN dark header), **`weekly`**, **`grocery-list`**, **`recommendations`**. Screens with a fixed toolbar/week-selector below the old header (grocery/recommendations/weekly) offset that bar by `headerH` instead of the scroll. **`recipe/create` + `recipe/[id]` were intentionally NOT glass-migrated** (kept their own headers): `recipe/create` is a full-screen editor whose header has a **"Save" text action** that doesn't fit `LightHeader`'s 44px icon slot (like the favourites meal editor, which also keeps its dark header); `recipe/[id]` is a **hero-cover detail** (overlaid back button, analogous to the un-migrated client Home hero). Both still got the native-tab **bottom-padding fix** (`paddingBottom: tabBarH`; `recipe/create`'s live macro bar → `marginBottom: tabBarH`). (`tips.tsx` + `recipes.tsx` are redirects — skipped.)
> - **Intentionally NOT migrated** (keep their own designs): Do Mode (`workout/[workoutId]`), Exercise Detail, Session Intro, client Home hero (`index.tsx`).

### Client tab bar (`app/(client)/(tabs)/_layout.tsx`)
- **Tabs:** Training · Appointments · Progress · Me (4 visible tabs). Overview tab suppressed with `tabBarButton: () => null, tabBarItemStyle: { flex: 0, width: 0, overflow: 'hidden' }` — NOT `href: null` (those two props conflict and cause a runtime error).
- **Tab item sizing:** each visible tab gets `tabBarItemStyle: { flex: 1 }`. Never use explicit pixel widths — the tab bar has internal padding that causes overflow. Never use `href: null` together with `tabBarButton`.
- **Label font:** `fontSize: 10, fontWeight: '600'`. "Appointments" fits at this size without truncation.
- **"Schedule" tab file** is `schedule.tsx` — the **tab title** is "Appointments". TITLE_MAP and `<Tabs.Screen title>` both say "Appointments".

### Client tab header (`app/(client)/(tabs)/_layout.tsx`)
- **Height:** 62px row, `#244e43` bg, defined once in `_layout.tsx`, shared across all tabs
- **Training tab:** `KettlebellIcon` 32px left — taps to open the **training `NotificationOverlay`** (sliding panel from top). If a session is suspended (`hasSession`), tapping the kettlebell opens the **session modal** instead. No vibration on Training tab focus — the daily-vibrate effect (and its `dailyVibrateDone` module var + `Vibration` import) was removed from `_layout.tsx`. Badge dot when unread training notifications exist (`is_read=false` rows in `client_notifications` with `area='training'`), re-checked on every `useFocusEffect` via `checkTrainingBadge`. Title 18px/700 white centered · VFIcon 30px right → home. When session active: `timer` SF Symbol + `mm:ss` appears **absolute-positioned** at `right:56` — tapping it also opens the session modal. Title never shifts. **Tip of the Day is disabled** — `TIPS`, `getDayOfYear`, and the tip overlay have been removed from `_layout.tsx`.
- **All other tabs (Appointments · Progress · Me):** chevron.left back arrow left → **`smartBack(router)`** (from `lib/navHistory.ts`) — returns to the **actual previous screen** the client was on, not always home. It does NOT jump to the Training tab. VFIcon 30px right remains the explicit "home from anywhere" button. Title centered.
  - **Back navigation uses a breadcrumb, NOT plain `router.back()` (July 2026).** The four main sections (train/schedule/progress/me) and the nutrition sub-screens live inside nested `<Tabs>` navigators with `backBehavior="none"`; a plain `router.back()` from any tab bubbles straight up to the parent `(client)` Stack and pops the whole tabs entry → collapses to home **regardless of where the user came from** (and bottom-tab switches record no stack history). This was the "back always goes home" bug. Fix: `lib/navHistory.ts` records a breadcrumb of every client screen via `useNavHistoryRecorder()` (called once in `app/(client)/_layout.tsx`, driven by `useSegments()`), and **all generic client header back buttons call `smartBack(router)`** — which navigates to the recorded previous href (falling back to `router.back()`, then `/(client)`). Wired into: `(tabs)/_layout.tsx` onBack, `all-workouts`, `all-routines`, `availability` (header + after-save), `past-sessions`, `routine/[routineId]`, `nutrition/weekly`/`grocery-list`/`recommendations`, and `favourites` (landing view only). **Do NOT revert these to `router.back()`** — it reintroduces the always-goes-home bug. Special session/recipe flows (Do Mode leave/discard, session-intro, recipe create/detail) intentionally keep their own `router.back()`.
  - **CRITICAL:** the `<Tabs>` navigator MUST still set `backBehavior="none"` (both the main tabs and the nutrition `<Tabs>` in `app/(client)/nutrition/_layout.tsx`). Any other value (`firstRoute`/`history`) makes the tab navigator swallow the back action and switch tabs in ways `smartBack` can't reason about; `smartBack` relies on `none` so the breadcrumb stays the single source of truth for back.
- Left and right elements each in a 48px-wide touch area (`hdrStyles.side`)

### Client sub-screen headers (`all-workouts.tsx`, `all-routines.tsx`, `availability.tsx`, `past-sessions.tsx`, `routine/[routineId].tsx`)
- **Migrated to the shared glass `LightHeader` (July 2026)** — the old 62px `#244e43` `SafeAreaView` bar is gone. Pattern: render `<LightHeader left={<HeaderIcon → smartBack><chevron.left HEADER_ICON/></HeaderIcon>} title=… right={<HeaderIcon → /(client)><VFIcon 26 HEADER_ICON/></HeaderIcon>} />` **last in the root View** (so it overlays the scrolling content). Root bg `#faf9f7`; `StatusBar dark-content`; scroll `contentContainerStyle` padded `paddingTop: useHeaderHeight() + 16` (+ `scrollIndicatorInsets.top` + RefreshControl `progressViewOffset={headerH}`).
- `routine/[routineId]` keeps its `(i)` routine-history button — moved into the `overlay` slot (a small dark-green outline circle wrapped in an absolute `right:58` View so it never shifts the centered title).
- `availability` has **no ScrollView** (PanResponder grid) → its `body` View is padded `paddingTop: headerH + 8` instead.
- Import `LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight` from `@/components/LightHeader`; `VFIcon` from `@/components/VFIcon`.

### Trainer tab headers — TrainerLogoButton (`components/TrainerLogoButton.tsx`)
All 5 trainer tab screens (clients, schedule, library, finance, account) use `<TrainerLogoButton />` in the left header slot instead of a plain `<VFIcon>`.
- **July 2026: the 5 tab screens now use `LightHeader solid` (see the trainer-headers stage-2 note up top), so they render `<TrainerLogoButton light />`** — the new **`light` prop** flips the VF glyph from white to dark-green (`#244e43`) and gives the badge a light hairline ring (`ls.badgeLight`) so it reads on the light glass. Everything else (badge colour logic, session timer, Notifications modal) is identical. Screens that pass no `light` prop still render the white glyph (none currently, but the default is preserved).
- **Badge:** **green** (`ACCENT #24ac88`) when a session is suspended (`suspendedSession` is set in `useSessionStore`); **red** (`#e85d4a`) when no suspended session but `pendingCount > 0` (pending move_requests + availability_notifications). Green takes priority.
- **Badge count:** sum of pending `move_requests` + pending `availability_notifications`, refetched on every tab focus via `useFocusEffect`.
- **Live session timer:** `useEffect` interval updates `sessionElapsed` every second from `suspendedSession.startedAt` while modal is open or session is active.
- **On press:** opens white centered **Notifications modal** (`maxHeight: 60% of screen`):
  - Title "Notifications" 17px/600
  - **SESSION IN PROGRESS section** (shown first when `suspendedSession` is set): "SESSION IN PROGRESS" 11px/700 muted uppercase label · workout name 14px/700 · live elapsed timer 22px/700 ACCENT `fontVariant:tabular-nums` · "Return" ACCENT green filled pill → `clearSuspendedSession()` + navigate to do mode with `resumeSessionId` + `resumeStartedAt` params
  - If no session and no notifications: "No pending notifications" grey
  - **AVAILABILITY section** (shown after session row when `availNotifs.length > 0`): same as before
  - **REQUESTS section** (was "MOVE REQUESTS"): `move_requests` now carry `kind` ('move'|'cancel') + `within_24h`. Each row shows a `reqKind` label — "Time change request" (ACCENT) or "Cancellation request" / "Cancellation · under 24h, must be covered" (RED) — plus the appt info + client note. Buttons: **Done** (marks `status='actioned'`) + **View** — cancel requests → "View in schedule" (`/(trainer)/(tabs)/schedule?date=<appt_date>`, where the trainer uses the existing Cancel / Cancel-charged actions); move requests → "View client". `fetchAll` selects `kind, within_24h`.
  - Scrollable if many items
- `fetchAll()` fetches both tables in parallel, then a single `users` query for all unique client IDs
- Never add TrainerLogoButton to screens that are NOT top-level trainer tab screens (e.g. client profile, Do Mode, workout builder — these have back buttons)

### Clients tab (`app/(trainer)/(tabs)/clients.tsx`)
- **Sorting:** always **alphabetical by name** (`a.name.localeCompare(b.name)`) — NOT by recency.
- **Last-active label:** the sessions query filters `.eq('status','completed')` — only completed sessions count as "last session". Scheduled (future-dated), in_progress and skipped rows must never win, or a future scheduled session would show "Just now". Matches `lib/clientTraining.ts` (completed-only rule). `relativeTime()` / `isInactiveClient()` from `lib/utils.ts`.
- **Data:** `load()` runs 3 queries in parallel — completed `sessions` (last-active map), `active` `session_packages` (usage), and upcoming `scheduled` `appointments` (`date >= today`, ordered asc). Built into per-client maps.
- **Package usage pill** (`pkgPill`, shown when `packageTotal != null`): `dumbbell.fill` icon + `used/total used`. Turns **amber** (`pkgPillLow`/`pkgPillTextLow`, `#f5a623`) when `remaining <= 2 && remaining > 0` — matching the low-sessions warning in `me.tsx`/client profile. 0 remaining stays green (not amber).
- **This-week appointment pill** (`apptPill`, `TouchableOpacity`, shown when `weekAppts.length > 0`): calendar icon + next appointment (`fmtApptDate`) + green `+N` (`apptPillPlus`) when >1. `weekAppts` = all upcoming appointments in the **calendar week of the next appointment** (`mondayOf` filter). Tapping opens `apptModal` — white centered modal (`modalOverlay`/`modalCard`, `maxHeight:70%`) listing each appointment (`fmtApptFull` day + time + `apptTypeLabel`), with green Done pill. Nested touchable consumes the tap so the card doesn't navigate. Modal state lives in `ClientsScreen`; `openApptModal(client)` computes `weekLabel` ("This week" vs "Week of D–D Mon").
- Card sizing: avatar 42, name 16px, `paddingVertical:13` — a `metaRow` (pills) only renders when a package or appointment exists. Each `row` card uses the **borderless premium treatment** (see the app-wide rule below).

### Cards — BORDERLESS + soft shadow (app-wide, both trainer AND client, July 2026)
Across the **entire app — trainer and client screens + shared components** — white content cards, search inputs, and unselected filter/segment pills are **borderless** — no grey `#e8e8e4`/`BORDER` outline — relying on a **soft shadow** (or a light fill) for definition. (The legacy, now-unreachable `app/(tabs)/` duplicate group was left untouched — it's dead code the live client app never routes to.) This was a deliberate redesign: on the `#faf9f7` background the old grey borders read as hard, cheap outlines (they were camouflaged on the previous `#edede9`); the borderless + shadow look (modelled on the Finance invoice cards) is softer and more premium. Standard values:
- **Content card:** no border; `shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:6, elevation:2` (larger cards may use `{height:2}, radius:8, elevation:3`). If a card needs `overflow:'hidden'` to clip a cover image/child, keep it (the shadow is dampened but the borderless white still reads on `#faf9f7`).
- **Search bar / white input row:** no border; `shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:4, elevation:2`.
- **Modal/form TextInput:** no border; light fill `backgroundColor:'#f5f5f3'` (or `#f8f8f6` to match a modal's siblings).
- **Unselected pill / dropdown:** no border; white bg + `shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:1`; active/selected keeps its filled bg (drop any `borderColor` from the active variant).
- **Neutral (grey) outline/secondary button:** no border; light fill `#f5f5f3`.
- **KEEP borders:** dashed "add" affordances; colored/semantic borders (ACCENT, amber warning like `cardWarning`, red, category stripes, status pills); accent-colored Type 2 utility buttons; colored avatar rings; internal hairline dividers (`sep`/`cardDivider`/`borderTop/Bottom` between rows); the invoice **print-preview** facsimile (`pvSt`, mirrors the printed PDF). **Do Mode & Exercise Detail** keep their own white two-layer card system — not part of this rule.

### Trainer client profile header — suspended session indicator
`app/(trainer)/client/[id]/index.tsx` — `ClientProfileScreen`:
- Reads `suspendedSession` from `useSessionStore`. When `suspendedSession.clientId === id`: `sessionActive = true`.
- Live elapsed timer: `useEffect` interval updates `sessionElapsed` every second from `suspendedSession.startedAt`.
- **Header center slot:** when `sessionActive`, shows a `TouchableOpacity` (instead of plain Text) containing: client name + `<Text style={headerSessionTimer}> · mm:ss</Text>` where `headerSessionTimer = { color:'#24ac88', fontSize:14, fontWeight:'600', fontVariant:['tabular-nums'] }`.
- Tapping the center: calls `clearSuspendedSession()`, navigates to do mode with `resumeSessionId` + `resumeStartedAt` params.
- When `!sessionActive`: plain `<Text style={styles.headerTitle}>{client?.name}</Text>` — no timer, no tap target.

### Client tab header — suspended session indicator
`app/(client)/(tabs)/_layout.tsx` — `ClientTabHeader`:
- Reads `suspendedSession` + `clearSuspendedSession` from `useSessionStore` (inside `TrainingTab` via direct `useSessionStore()` call, NOT passed from `ClientTabsLayout`).
- Wait — the indicator is in `ClientTabHeader` which is used by `ClientTabsLayout`. Session state (`hasSession`, `sessionElapsed`, `onSessionTap`) are props passed from `ClientTabsLayout`.
- **`ClientTabsLayout`** holds: `suspendedSession`, `clearSuspendedSession` (from store), `sessionElapsed` state (interval), `handleReturnToSession()` helper.
- **Header:** title (`<Text style={hdrStyles.title}>{title}</Text>`) is ALWAYS plain centered text — never changes. When `hasSession`: an **absolutely positioned** `TouchableOpacity` (`hdrStyles.sessIndicator: { position:'absolute', right:56, top:0, bottom:0, flexDirection:'row', alignItems:'center', gap:4 }`) renders `SymbolView name="timer" size:13 tintColor:ACCENT` + `<Text style={hdrStyles.sessTimerText}>mm:ss</Text>` (11px/700 ACCENT tabular-nums). Right:56 puts it just left of the 48px VFIcon slot — does NOT shift the title.
- Tapping the indicator opens the **session modal** (white centered: "SESSION IN PROGRESS" label · workout name 17px/700 · timer 40px/700 ACCENT tabular-nums · "Return to session" ACCENT green pill → `handleReturnToSession()`).
- **Kettlebell icon (training tab):** opens `NotificationOverlay` (area='training'). If `hasSession` → opens session modal instead.
- **Back arrow (other tabs):** no dot, no session behavior — just navigates back as before.
- `handleKettlebellTap`: checks `hasSession` → if true opens session modal; otherwise opens `setTrainingNotifOverlay(true)`.

### Client home screen — suspended session indicator
`app/(client)/index.tsx`:
- Session pill rendered **after** the `<ScrollView style={absoluteFill}>` so it sits above it in z-order and receives touches. (Rendering inside the hero or inside the ScrollView means the ScrollView intercepts touches even when `scrollEnabled={false}`.)
- Style: `position:'absolute'`, `top: insets.top + 10`, `right: 20`. ACCENT green pill with `timer` SF Symbol (12px) + `mm:ss` (12px/700 white tabular-nums).
- Tapping: `clearSuspendedSession()` + navigate to do mode with resume params.

### Client nutrition screen — suspended session indicator
`app/(client)/nutrition/index.tsx`:
- Same absolute indicator style as tab headers: `position:'absolute', right:56, top:0, bottom:0` with `timer` icon + `mm:ss`.
- Positioned within `styles.headerRow` (height:62, `paddingHorizontal:20`).
- `PearIcon` restored to normal (always opens notification overlay regardless of session state). Session indicator is a separate element.

### Button system
**Type 1 — Segmented switcher:** outer pill `borderRadius:100, bg:#d8d8d4, padding:3`; active inner pill `borderRadius:100, bg:white`; inactive transparent. Used for: toggles, option groups.

**Type 2 — Utility action:** `borderRadius:10, borderWidth:1.5, borderColor:ACCENT`, transparent bg. Used for: Start timer and the two action-row buttons (Play video / Info). **Add Set/Dropset and Add photo** use the same base style but with a **dashed SVG border** via `DashedBtnWrapper` (defined just above `ExerciseCard` in both Do Mode files) — the SVG draws a `Path`-based rounded rect with `strokeDasharray="9 5"`, with the bottom edge overlaid at `strokeWidth 2.2` and a calculated `strokeDashoffset` to keep dashes aligned. The native `borderWidth` is set to 0 on these buttons; the SVG handles the border.

**Type 3 — Primary CTA:** always `borderRadius:100`. Filled=ACCENT bg white text (main action). Gray filled=secondary. Outline=ACCENT border+text (secondary alongside filled).

### Colors
- Background: #faf9f7 (all client **and** trainer screens — July 2026 the trainer side was switched from #edede9 to #faf9f7 to match the client side app-wide). **Exception:** Do Mode and Exercise Detail use white (#fff) on both sides. | Cards: #ffffff border #e8e8e4
- Header: #244e43 | Accent: #24ac88 | Mid green: #3a7d6b
- Text: #1a1a1a | Secondary: #999
- Amber accent: `#f5a623` — used for bonus sessions (exceeded goal), BONUS stat colour, and the `RoutineIcon`/`TrainerRoutineIcon` SVG dumbbell/tab accents. **Not** used for the routine progress ring arc (that is ACCENT green).

### Card shadows
- **White cards:** `shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3`
- **Dark cards (e.g. dark header overlays, `#244e43` backgrounds):** `shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.22, shadowRadius:10, elevation:6` — higher opacity required because dark background absorbs the standard spec. Note: client Training tab tiles are now **white** and use the standard white card shadow spec.
- `overflow:'hidden'` clips iOS shadows — never apply it to a card that needs a visible shadow

### Training tab — Workouts & Routines sections (trainer, `app/(trainer)/client/[id]/index.tsx`)
> **The two square WORKOUTS/ROUTINES tiles were removed (July 2026)** — the trainer client-profile Training view now mirrors the client Training tab: a horizontal **WORKOUTS gallery** + a **ROUTINES section** (`RoutineCard`), replacing the old `aspectRatio:1.3` tiles. The client side already worked this way; this brought the trainer side to parity. (The old `tileStyles` and `TrainerSmallRing` remain in `index.tsx` as unused dead code for now.)
- Because the client-profile tab content sits inside a `scrollContent: { padding:16 }` container, both sections are wrapped in a **`sectionStyles.fullBleed` (`marginHorizontal:-16`)** so the gallery reaches the screen edge (each section re-adds its own 16px insets, matching the full-width client layout). Recent Activity + Trainer Note stay **outside** the wrapper (keep the 16px padding).
- Ported **verbatim from the client** (`train.tsx`) as local defs in `index.tsx`: `sectionStyles`, `rcStyles`, `qlStyles`, `formatRoutinePeriod`, `RoutineCard`, `RoutineQuickLookModal`, plus the `WorkoutCard`/`RoutineRow` types. `RoutineCard` reuses the trainer's existing `ProgressRing`. Section-header + workout-card mini-routine icons reuse `TrainerRoutineIcon`. (In `rcStyles`/`qlStyles` the color literals are hardcoded — the `ACCENT`/`TEXT`/`HEADER`/`MUTED` consts are declared **below** these StyleSheets in the file, so referencing them there is a temporal-dead-zone error.)
- **WORKOUTS gallery:** 🏋️ + "Workouts" header + `chevron.right` → `all-workouts`. `loadWorkoutsSection()` (client-scoped by `clientId`, called in the tab's `useFocusEffect` alongside `loadStripSessions`) fetches active, non-stretching workouts + each one's all-time last-completed date; sorted most-recently-done first, never-done last. Mini cover cards (`wCardOuter` 180px), tap → trainer Do Mode `/(trainer)/client/[id]/workout/<id>` directly (the trainer pre-session screen was removed — July 2026); card ⋯ opens the full `WorkoutMenuModal` options panel (`setActiveMenu`; Edit workout · Session details · Add to Routine · Mark as done/Reactivate · Delete — the "Session details" row opens `SessionDetailsSheet`). *(Before July 2026 the ⋯ opened `SessionDetailsSheet` directly.)* Dashed "See all N" card at the row end → `all-workouts`. Empty → "No workouts yet".
- **ROUTINES section:** `TrainerRoutineIcon` + "Routines" header + `chevron.right` → `all-routines`. Shows only the **active routine** as a `RoutineCard`, built into a `RoutineRow` from the already-fetched `fetchClientTraining` data (`activeRoutineRow` memo — no extra query). Tap → `routine/${id}`; card ⋯ opens the ported `RoutineQuickLookModal`. No active routine → grey "No active routine".
- **Ring value is cycle-aware:** `RoutineCard` passes `current = cycleJustCompleted ? routineTotal : cycleDoneCount` — never `nextUpPosition`. Same rule applies to all routine progress rings.

### Client Training tab — Workouts & Routines sections (`app/(client)/(tabs)/train.tsx`)
Replaced the two square tiles. Rendered directly on the `#faf9f7` tab background after the WeeklyGaugeCard/session-card area. **No dividers** anywhere between sections. Section header rows use `paddingHorizontal:16, paddingTop:30, paddingBottom:14` (`paddingTop` spaces each section header from what's above it — the week strip above WORKOUTS, the Workouts row above ROUTINES; `paddingBottom` gives breathing room above the cards). Header left = section icon + label (`fontSize:12/700, color:#1a1a1a, textTransform:'uppercase', letterSpacing:0.5, marginLeft:7`); header right = "See all →" (`fontSize:12, color:ACCENT, fontWeight:'500'`). 24px bottom spacer closes the scroll.

**WORKOUTS gallery:**
- Header: 🏋️ emoji + "WORKOUTS" + "See all →" → `all-workouts`.
- **Lives on its own — NOT tied to the week strip.** `loadWorkoutsSection()` takes no week param and is called in `load()` (focus) only — it is **not** called from the `weekOffset` effect. Swiping weeks up top never changes the gallery.
- Data: active, non-stretching workouts (`status='active'`, filtered by `STRETCHING_CATS`) joined with `routines(name)`, plus each workout's **all-time** last-completed session date. Sorted most-recently-done first; never-done workouts fall to the end (kept in created-desc order).
- **Mini card** (`wCardOuter` shadow wrapper `width:180, borderRadius:14, #fff` + `wCard` inner `flex:1, overflow:'hidden'`): cover `height:90` with image or `['#2a5448','#1a3832']` gradient fallback + bottom dark overlay (`transparent→rgba(0,0,0,0.5)`). Workout name bottom-left (`13px/700 white`, `right:60`); category pill bottom-right (`CATEGORY_COLORS[cat].border` bg, white `9px/700`). **No ✓ badge and no date on the cover.**
- **Card body** (`wBody: flex:1, justifyContent:'flex-end'` — pins content to the bottom so the "Done …" line aligns across cards of differing height, since the row stretches all cards to the tallest): **routine-linked** workouts show a `RoutineIcon` (size 12) + routine name line (`wSub 10px #999`), then the last-done line; **standalone** workouts show only the last-done line (no "Standalone" label — a plain workout is the implicit default, so it needs no marker). Last-done line (`wStatus 10px/600`): `Done <D Mon>` in ACCENT green, or `Never done` in `#bbb`. Tapping a card → `session-intro?workoutId=<id>`.
- Dashed **"See all N"** card at the row end (`width:80, rgba(36,172,136,0.08)` bg, `1.5px dashed rgba(36,172,136,0.3)` border, `minHeight:134`) → `all-workouts`. `N = workoutCards.length`.

**ROUTINES section:**
- Header: `RoutineIcon` + "ROUTINES" + "See all →" → `all-routines`.
- Shows only the **active routine**, built into a `RoutineRow` from the already-fetched `fetchClientTraining` data (no extra query), rendered with the `RoutineCard` component **copied verbatim** from `all-routines.tsx` (plus `ProgressRing`, `formatRoutinePeriod`, `rcStyles`, `RoutineQuickLookModal`, `qlStyles`) — the copy is local to `train.tsx` (do not import from / edit `all-routines.tsx`).
- **The copied card is a plain white card** (`rcStyles.card` has `backgroundColor:'#fff'`) — the beige `['#ffffff','#f0eee9']` `LinearGradient` used on the My Routines screen was dropped here so it sits cleanly on `#faf9f7`.
- ⋯ on the card opens `RoutineQuickLookModal`. No active routine → grey "No active routine" text (`13px #999`, centered).

### WeeklyGaugeCard — client (`app/(client)/(tabs)/train.tsx`)
- **Tab background:** `#faf9f7` (all client screens use this — set on `styles.root` and `styles.scroll`). Scroll order: gauge section (no card) → session card → stat tiles.
- Shown only when `weeklyGoal != null` (primary: `availability_submissions.sessions_wanted` for `client_id + week_start`; fallback: `users.weekly_session_goal`). Hidden entirely if neither exists.
- Implemented as a standalone `WeeklyGaugeCard` component at the bottom of `train.tsx` with its own `gcStyles` StyleSheet. Called with `{weeklyGoal != null && <WeeklyGaugeCard ... />}` — single JSX element.
- **No card wrapper** — the gauge (arc, pips, message, days strip) sits directly on the `#faf9f7` tab background. `gcStyles.container` is a plain transparent `View` (`marginTop:18, paddingTop:4, paddingBottom:4`). Only the session card and the stat tiles are white cards.
- **Green usage — kept simple (two greens only):** all muted/secondary green text uses `#3a7d6b` (arc label, `"workouts"` unit, message). Bright ACCENT `#24ac88` is reserved for meaningful accents only: arc fill, DONE number/label, selected day, session dots. Do NOT reintroduce a third green (`#7aaa8a` was removed).
- **No floating header row** — the week label lives inside the arc and the calendar icon lives above the days strip (see below).
- **Arc (SVG):** `PAD=8`, `R = Math.round((sw - 80) / 2.2)`, `D = R*2`, `svgW = D+PAD*2`, `svgH = R+PAD*2`. Track: `rgba(36,172,136,0.15)`, `strokeWidth:11`. Fill: solid `#24ac88` when not exceeded; SVG `LinearGradient` `id="arcGrad"` (`gradientUnits="userSpaceOnUse"`, `x1=PAD`, `x2=D+PAD`, `#24ac88 → #f5a623`) when exceeded. Center text (absolutely positioned `top: Math.round(R * 0.42 + PAD)`): week+goal label (10px/600, `#3a7d6b`, `letterSpacing:0.4`) showing `gaugeWeekLabel(weekOffset, weekDates).toUpperCase() + " GOAL"` (e.g. `"THIS WEEK GOAL"` / `"NEXT WEEK GOAL"` / `"8 - 14 JUN GOAL"`) · goal count (34px/500) · `"workouts"` (11px, `#3a7d6b`).
- **Stats (absolutely positioned):** container is `position:'relative', width:svgW, height:svgH+48`. Two 60px-wide `View`s with `alignItems:'center'`. DONE: `left: PAD - 30` (centered on left arc endpoint). BONUS/LEFT: `left: D + PAD - 30` (centered on right arc endpoint). Both at `top: svgH + 4`. Number: `fontSize:24, fontWeight:'500'`. DONE label color `#24ac88`. LEFT label color `#1a1a1a`. BONUS number+label color `#f5a623`.
- **Per-workout pips + message (reverted July 2026 from the single big-pip):** below the arc, a centered `gcStyles.pipsRow` of small circular pips — **one pip per COMPLETED workout only; no empty/placeholder pips**. When `weeklyCompleted === 0` the whole `pipsRow` is not rendered (only the message shows). Pip count = `weeklyCompleted` (so bonus pips beyond the goal are included). Each pip is `gcStyles.pip` (24×24, `borderRadius:12`) with a centered 🏋️ (`fontSize:12`), tappable → `singlePip` overlay for that session (mapped from `sortedSessions`). Pips `< weeklyGoal` use `pipDone` (green); **bonus** pips (`i >= weeklyGoal`) use `pipBonus` (amber). `pipEmpty` is now unused (kept in styles). Below the pips is a single tappable message line (`gcStyles.msg`) that opens the **"Trainings done" overlay** (`sessionsListOpen`). Message text = `pipMessage(done, goal, weekOffset, weekDates)`: 0 done → "First workout this week awaits" (current week) / "No workouts <label>" (other weeks); `< goal` → `motivationMsg` ("N more to go, …"); `=== goal` → "Weekly goal reached — great work! 🎉"; `> goal` → "+N bonus session(s) — you're on fire! 🔥". The arc + `GOAL/DONE/LEFT/BONUS` stats and the `GoalCelebration` are unchanged. The old single-pip `gcStyles.bigPip` style is left in place (unused) for an easy re-switch. **`sortedSessions` and the "Trainings done" overlay are completed-only** (`weekSessions.filter(status==='completed')`) so planned/scheduled sessions never fill a pip.
- **Day-contextual add/plan affordance + day-aware add/plan modal (July 2026, Option A — replaced the earlier floating FAB):** rendered **in the main ScrollView right after the gauge card** (always shown, goal or not) — NOT a floating FAB (a global bottom-right FAB overlapped the WORKOUTS cards; the add action is **day-specific**, tied to the day selected in the strip). **Single form (simplified July 2026):** always a small **40×40 green `+` circle** (`styles.addCircle`, `alignSelf:'center'`) regardless of whether the selected day has a session — the labelled "Log/Plan training" pill (`styles.addBtn`/`addBtnText`, now unused) was dropped because the modal itself already distinguishes Log (today) vs Plan (other days), so the text label was redundant. Opens the add-training modal (`startModalOpen`). The old floating `styles.fab` was removed. The week-strip empty-day state (`gcStyles.emptyDay`/`emptyText`/`emptyPlus`, now unused) was removed entirely — **no "No workout logged" text** on any day; the add affordance alone conveys it. The modal is **day-aware** on `selectedDate` vs `todayStr`: **today** → title "Log training", subtitle "Today", options **Log workout** (→ `all-workouts`) / **Log routine** (→ `all-routines`) — perform in Do Mode as before (today log no longer sets `pendingLogDate`, since the date is today). **Any other day (past or future)** → title "Plan training", subtitle "<Weekday D Mon>" (just the date), options **Plan workout** (opens an inline picker of `workoutCards` → tap schedules a `scheduled` session on `selectedDate` via `scheduleWorkout(id)`) / **Plan routine** (schedules the active routine's `nextUpWorkoutId` on that day). Planning inserts a `sessions` row `{client_id, workout_id, date:selectedDate, status:'scheduled'}` (no `id` — DB default) and **does not perform** — only today can be physically trained. `scheduleWorkout` reloads the week strip. The subtitle ("Today" / "<Weekday D Mon>") under the modal title is styled `startModalStyles.subtitle` = **13px/600 ACCENT green** (`#24ac88`) — deliberately more visible than plain muted grey so the target day reads clearly. New `startModalStyles`: `subtitle`, `emptyPlan`, `planRow`, `planThumb`, `planName`. **Nutrition FAB** sits at `bottom:insets.bottom+10` (lowered July 2026).
- **Planned/scheduled sessions in the strip:** `loadWeekSessions` now selects `status IN ('completed','scheduled')`; `WeekSession` has a `status` field. Day dots: filled green (`dotActive`) for completed, outline green (`dotPlanned`, `borderWidth:1.5`) for planned. `selectedSession` prefers a completed session for the day, else the planned one. A planned selected day renders a **PLANNED card** (`plannedBadge` amber pill top-right, no ✓, no stats; a `plannedNote` line — "Planned for today — tap + to log it" / "Planned — you'll log it on the day" — plus the `ellipsis` → move/delete via `onShowSessionMenu`). **Open lifecycle question:** starting/logging a planned session on the day currently goes through the normal Log flow (creates a fresh completed session); the original `scheduled` row is not auto-consumed — TBD how Vitek wants planned sessions "performed"/cleared.
- **Goal-reached celebration (`GoalCelebration` component, bottom of `train.tsx`):** a one-time full-screen confetti burst + centered white badge ("🎉 Weekly goal reached! / Great work this week") that fires when the client reaches their weekly goal (`weeklyCompleted >= weeklyGoal`) and lands back on the Training tab. Confetti = `CONFETTI_COUNT` (88) `Animated.View` pieces (brand palette `CONFETTI_COLORS`) falling with drift + rotation (fall duration 2600–4000ms, staggered start delay up to 2400ms so they rain continuously through the longer message); badge springs in, holds, fades. Overlay is `pointerEvents="none"`, `zIndex:999`, rendered at the root `View` (after `RoutineQuickLookModal`). Uses `Vibration.vibrate([0,35,55,40])`. **Fires once per at-or-above-goal streak, per week**, via `checkGoalCelebration()` — NOT an in-memory ref (the Training tab remounts after the log → `session-complete` → `router.replace('/(client)/(tabs)/train')` flow, which would wipe any ref, so "at goal" would look identical to a fresh open). `checkGoalCelebration()` runs its **own** query against the **real current week** (`getWeekDates(0)`, independent of the viewed week, so swiping weeks can't feed it stale counts): if `completed >= goal` and the per-week AsyncStorage flag `goalCelebrated:<monday>` isn't set → celebrate + set the flag; if below goal and the flag is set → clear it (re-arms for the next reach). Called from the tab's `useFocusEffect` (catches the reach after the log flow, surviving the remount because the flag is persisted) and after `deleteClientSession`. Because dropping below goal clears the flag, deleting a session and re-logging re-fires it — which is also how to test it without waiting a week. Auto-dismisses after ~6.2s via `onComplete` → `setShowCelebration(false)`.
- **Divider:** `height:0.5, backgroundColor:'rgba(36,78,67,0.28)', marginTop:12, marginHorizontal:12` — separates message from the days section below.
- **Always expanded** — no chevron, no `goalExpanded` state. Days row + session card render unconditionally.
- **Days section (`gcStyles.daysSectionWrap`, `marginHorizontal:12, marginTop:10`, below the divider):** contains two children stacked vertically:
  1. **`calBtn` row** (`alignSelf:'flex-end', flexDirection:'row', alignItems:'center', gap:8, paddingBottom:6, paddingHorizontal:4`): when `weekOffset !== 0`, shows a **today button** (18×18 **solid light-green** circle `backgroundColor:ACCENT #24ac88`, white date number 9px/700; taps `onGoToToday` → `setWeekOffset(0) + setSelectedDate(todayStr)` — July 2026: changed from the old dimmed-accent circle + dark-green number to solid light-green so the resting toolbar icons stay strong) · always shows `calendar` SF Symbol 18px `tintColor:HEADER` (dark green — the resting/default icon color) → `onOpenCalendar`.
  2. **`daysRow`** (`flexDirection:'row', alignItems:'center'`): **no ‹/› arrows** — they were removed to give the days more space; week navigation is swipe-only via `weekPanHandlers` (the day columns fill the full width). The weekday label and the number are wrapped **together in one rounded pill** (`gcStyles.dayPill` — `borderRadius:16, paddingHorizontal:10`, label on top `fontSize:9, fontWeight:'600', uppercase`, number below `dayNum` 17px), so the selected day reads as a single capsule rather than a small circle badge competing with the `+` circle above. **Highlight logic:** the **selected** day gets the **bright solid ACCENT** pill (`dayPillSel` = `#24ac88`, label + number white); **today**, whenever it is not the selected day, has **no background pill** — instead both its weekday label and number are coloured ACCENT green (`isToday && !isSelected ? { color:'#24ac88' }`), a persistent cue for where "today" is without a competing dimmed ellipse. On default load today is selected → bright pill; tap another day → that day goes bright and today falls back to plain green text (no background). (The old `dayCircle`/`dayCircleSel`/`dayCircleToday` and the now-unused `dayPillToday` styles are left in place.) Session dot below the circle (5×5): filled `#24ac88` for completed, outline (`dotPlanned`) for planned. Swipe via PanResponder (`weekPanHandlers` on `daysSectionWrap`).
  - **Session card** — two-layer: `sessCardOuter` (`marginHorizontal:12, marginTop:8, borderRadius:12, backgroundColor:'#fff'`, standard white card shadow) holds the shadow; `sessCard` (`borderRadius:12, overflow:'hidden', backgroundColor:'#fff'`) clips content. Floats as a standalone white card directly on the `#faf9f7` background. Rendered only when `selectedSession` is non-null. Cover `height:62`, fallback gradient `['#2a5448','#1a3832']`. Workout name top-left (12px/600 white), date bottom-left (9px, `rgba(255,255,255,0.6)`), green ✓ badge top-right. Highlights area (`paddingHorizontal:10, paddingTop:8, paddingBottom:4`): **no "THIS SESSION" label** (removed — redundant) · `ellipsis` button right-aligned · stat row (timer/checkmark icons, 13px/700 value, 13px MUTED label) · exercise list (7px dot HEADER=done/`#d0d0cc`=skipped, 13px name, delta ↑ACCENT/↓red/→`TEXT` black for same weight).
  - **Session ⋯ menu (client):** tapping `ellipsis` on session card opens a slide-up `BottomSheet` action menu (`sessMenu` state, July 2026 — was centered) with two options: **Move training** (`calendar` icon → opens the Move calendar) and **Delete** (`trash` icon, red `#e85d4a`). Delete → `confirmModal`-style white centered modal (confirms stay centered) ("Delete training?" · "This removes the session from your calendar. The workout itself is not deleted." · red Delete pill · grey Cancel). `deleteClientSession()` deletes the `sessions` row only (workout untouched; child `session_logs`/`session_exercise_photos`/`slot_*_history` cascade via FK), then reloads week sessions **and** `loadWeeklyGoal` (a completed session may have counted toward the weekly goal). States: `sessMenu`, `deleteConfirmSess`, `deletingSession`. **Requires the `sessions: client deletes own` RLS policy** (`FOR DELETE USING (client_id = auth.uid())`) — without it `.delete()` is silently blocked (0 rows, no error) and the strip won't update. (Clients previously could only move — delete was added so they can undo a mistaken log.)
  - **Move training calendar (client):** white centered modal. Month navigation ‹/›. `dumbbell.fill` 9px ACCENT below days with completed sessions (fetched via `loadMoveCalSessions(year, month)` — reloads when modal opens or month changes). Current session date = ACCENT circle, disabled. Tapping another day selects it (HEADER dark green circle) and shows a confirmation bar: "Move to [Weekday, D Mon]?" + ACCENT filled "Move" pill. Month navigation clears selection. Confirming calls `moveClientSession()` which updates `sessions.date`, then reloads week sessions and snaps `selectedDate` to the new date. States: `moveMenuSess`, `moveCalOpen`, `moveCalYear`, `moveCalMonth`, `moveCalSessionDates`, `movingDate`, `moveConfirmDate`. The calendar modal is rendered outside the `ScrollView` (at the root `View` level) so it always floats on top.
  - **Empty day state (`emptyDay`, `paddingVertical:10, marginTop:2` — sits close under the days strip):** day-scoped text (`fontSize:12, color:'rgba(36,78,67,0.5)'`) — **"No workout logged today"** when `selectedDate === todayStr`, otherwise plain **"No workout logged"** (the highlighted calendar day already conveys which day) — + ACCENT green `+` (`fontSize:26, fontWeight:'300'`), `marginHorizontal:12` — floats on the tab background, **no white box**. This day-scoped line is intentionally distinct in scope from the week-scoped gauge message ("First workout this week awaits") — do not merge them. Tapping opens start session modal.
- **Data loading:** `loadWeeklyGoal()` always queries current week (not offset-dependent — goal stats are always for the current week). `loadWeekSessions(weekDates)` reloads on `weekOffset` change. `weekOffset` change effect does NOT call `loadWeeklyGoal`.
- **Training calendar modal:** `calModalOpen` state in parent; `onOpenCalendar` prop passes `setCalModalYear`, `setCalModalMonth`, `setCalModalOpen`. Calendar still in parent component render (same implementation as before).

### Week strip — trainer (`app/(trainer)/client/[id]/index.tsx`)
- Same architecture as client week strip (PanResponder swipe, local date computation). **No ‹/› arrows** — removed to give the days more space; week navigation is swipe-only via `panRef.panHandlers` on the strip.
- **Training view layout order:** Week strip → session card(s) (standalone) → green `+` circle → WORKOUTS gallery → ROUTINES section → Recent Activity → Trainer Note. (The old tiles were replaced by the gallery + routine section — see "Training tab — Workouts & Routines sections (trainer)" above.)
- **Week label (July 2026):** just `"This week"` / `"Last week"` / `"Next week"` / date range (`" - "` hyphen with spaces) — the `'s training` suffix was dropped to match the client.
- **Header row (right side, `wsStyles.headerActions`):** when `weekOffset !== 0`, a **today button** (18×18 solid ACCENT circle, white date number 9px/700) → `onWeekChange(0)` + `onDaySelect(todayStr)`; then the **calendar icon** (`calendar` SF Symbol 20px, `tintColor:HEADER`). Both mirror the client's `todayBtn` + calendar.
- **Calendar icon → "Jump to date" month modal:** opens a month calendar (reuses `moveCalStyles`) starting on the viewed week's month. `loadCalSessions(year, month)` marks days with a completed session (`dumbbell.fill` 9px ACCENT); today + the selected day are highlighted. Tapping any day → `onWeekChange(getWeekOffsetForDate(dateStr))` + `onDaySelect(dateStr)` + close, jumping the strip to that week/day. State lives in `WeekStripCard` (`calOpen`/`calYear`/`calMonth`/`calSessionDates`, `calGrid` memo). `getWeekOffsetForDate` is a module-level helper (Monday-to-Monday diff from today). *(Before this the calendar icon was a bare `SymbolView` with no handler — it did nothing.)*
- **Days row:** rendered as the client's **green ellipse pill** (`wsStyles.dayPill`) — the weekday label + number wrapped together; selected day = solid ACCENT pill with white text (`dayPillSel`); today (when not selected) = ACCENT-green label + number, no background. Session dot below (5×5): filled ACCENT for completed, outline ACCENT for planned/scheduled.
- **Add affordance:** an always-visible centered **green `+` circle** (`wsStyles.addCircle`, 40×40, matches the client) rendered below the session card(s) — **not** an empty-only state. Tapping opens the Add Session modal with four options:
  - **"Create new workout"** (`square.and.pencil` icon) → `/(trainer)/workout-builder?clientId=${clientId}`
  - **"Add workout to this day"** (`plus.rectangle.on.rectangle` icon) → `/(trainer)/client/${clientId}/add-workout?date=${selectedDate}` (the **Add Workout picker** — see below). NOT `all-workouts`.
  - **"Plan a workout"** (`calendar` icon) → two-step pick+schedule flow (see §10).
  - **"Continue routine"** (`arrow.triangle.2.circlepath` icon) → `/(trainer)/client/${clientId}/routine/${activeRoutine.id}` — shown whenever `activeRoutine` exists (NOT gated by `nextUpWorkout`)
  - **"Start Free Session"** (`timer` icon, ACCENT color) → `/(trainer)/client/${clientId}/workout/free`
- **Recent Activity card:** 70px cover card. Cover image from `lastSessionCoverImageUrl` (pulled via sessions join in `fetchClientTraining` — reliable regardless of the `.limit(3)` on standalone workouts). Subtitle shows "Standalone · D Mon" or "from [Routine Name] · D Mon". `RECENT ACTIVITY` label has `marginTop: 20`.
- **Trainer Note:** `marginTop: 16`.
- **`lib/clientTraining.ts`:** sessions select includes `cover_image_url` in the workouts join. `lastSessionCoverImageUrl` is a field in `ClientTrainingData` and returned from `fetchClientTraining`.

### All Workouts screen — trainer header
- `app/(trainer)/client/[id]/all-workouts.tsx` header title: **"[FirstName]'s Workouts"** (e.g. "Adam's Workouts")
- Fetched on mount: `supabase.from('users').select('name').eq('id', clientId).single()` → `clientFirstName = data.name.split(' ')[0]`
- `clientFirstName` state + `useEffect([clientId])`. Falls back to "All Workouts" while loading.

#### Session card (standalone, below week strip)
- **Card structure:** two-layer — `sessCardOuter` (`borderRadius:16, marginTop:12`, white card shadow spec) holds the shadow; `sessCardInner` (`borderRadius:16, overflow:'hidden', backgroundColor:CARD`) clips content. The session card is a **peer** of the week strip, not nested inside it.
- Cover image height 64. Layout: workout name **top-left** (`top:8, left:8, right:34`) · ✓ badge **top-right** (`top:8, right:8`, 18px ACCENT circle) · date **bottom-left** (`bottom:6, left:8`).
- Below cover: highlights area — **no "THIS SESSION" label** (removed). `ellipsis` button right-aligned. Then:
  - **Stat row:** `flexDirection:'row'`. Two items each `flex:1, justifyContent:'center', flexDirection:'row', gap:4`. Icon size 13. Value 13px/700 `TEXT`. Label 13px `MUTED`.
  - **Note chip** (only when `sessions.client_notes` non-empty): `note.text` icon + note text (max 2 lines), `#f5f5f3` chip style, `marginTop:8`.
  - **Exercise list:** ALL exercises from `workout_exercises` ordered by `order_index`. Free sessions: only logged exercises shown. Exercise name `fontSize:13`.
    - **Left 7px dot:** `HEADER` dark green = performed; `#d0d0cc` grey = skipped. Skipped name also muted to `#999`.
    - **Right delta** (performed + weight data + previous session exists only): `↑ X kg` ACCENT = improved · `↓ X kg` `#e85d4a` = regressed · `→ X kg` `TEXT` black = same.
  - `loadSessionDetail(sessionId, workoutId)` — parallel fetches: current logs (with exercise names) + all `workout_exercises` (ordered) + session `client_notes` + previous completed session logs. Builds per-`workout_exercise_id` max weight maps for current and previous session.

#### Session card ⋯ menu (trainer — both scheduled and completed sessions)
- **Scheduled session:** `ScheduledSessionMenu` with options: Edit workout · Move training · Delete.
- **Completed session:** same `ScheduledSessionMenu` with `status='completed'` — shows only Move training · Delete (no Edit workout).
- **Move training flow:** opens `moveDateModal`. The `ScheduledSessionMenu` is conditionally hidden while the move calendar is open (`{scheduledMenu && !moveDateModal && <ScheduledSessionMenu/>}`) — prevents two stacked native modals from blocking touches (the root cause of unresponsive day cells).
- **Move training calendar:** white centered modal. Month navigation ‹/›. `dumbbell.fill` 9px ACCENT below days with completed sessions (fetched via `loadMoveCalSessions(year, month)`, reloads when `moveDateModal` opens or month changes). Current session date = ACCENT circle, disabled. Tapping another day selects it (HEADER dark green circle) + shows confirmation bar: "Move to [Weekday, D Mon]?" + ACCENT "Move" pill. Month navigation clears selection. Confirming calls `moveSessionDate()` which updates `sessions.date`, then reloads strip sessions and snaps `selectedDate`. States: `moveCalYear`, `moveCalMonth`, `moveCalGrid` (useMemo), `moveCalSessionDates`, `movingDate`, `moveConfirmDate`. Helpers: `toDateStr(year, month, day)`, `buildCalendarGrid(year, month)`, `MONTH_NAMES` — all defined at module level in `index.tsx`.
- **Delete session:** custom `confirmModal` pattern — "This removes the session from the calendar. The workout is not deleted." · red Delete pill · grey Cancel link. Deletes the `sessions` row only; the `workouts` row is untouched.

#### Training calendar modal (from calendar icon)
- Opens to the month containing the current week's Monday. `calModalYear`/`calModalMonth` state.
- Monthly grid Mo–Su, month navigation ‹/›. Today: ACCENT circle. Days with completed sessions: `SymbolView name="dumbbell.fill"` size 9, `tintColor=ACCENT` below day number. Legend row at bottom.
- **Tapping a day:** calls `getWeekOffsetForDate(dateStr)` (computes Monday-to-Monday week difference from today), sets `weekOffset` + `selectedDate`, closes modal. Week strip jumps to that week with the date selected.
- `loadCalModalSessions(year, month)` fetches all completed session dates for the month; re-fetches on month change while modal is open.

### Appointments tab (`app/(client)/(tabs)/schedule.tsx`)

**Data:** fetches ALL appointments (no status filter — includes cancelled + cancelled_charged). Three date sets: `completedDates`, `cancelledDates` (includes `cancelled_charged`), `scheduledDates`. `lastSession` = most recent past non-scheduled appointment. Also fetches trainer's `phone` from `users` for WhatsApp fallback in move request modal.

**`date` URL param (notification deep-link):** `useLocalSearchParams<{ date?: string }>()` reads an optional `date` (YYYY-MM-DD). In `useFocusEffect`, when `notifDate` is present, sets `selectedDate = notifDate`, `calYear`, and `calMonth` to match — jumping the calendar to the right month with that day pre-selected. Used when client taps "View appointment" in `NotificationOverlay`.

**Calendar day selection:** `selectedDate` **defaults to `todayStr`** (never null) so the day card below always reflects a day. Tapping a day **always sets** it (no toggle-to-null). The selected day gets the ACCENT circle; today, when not selected, shows an ACCENT green number.

**Calendar dots:** one dot per day, colour determined by priority — cancelled/cancelled_charged (`#e85d4a`) > completed (`#b8ede0`) > scheduled (ACCENT). Placeholder spacer view preserves row height on days with no dot.

**Legend:** rendered at bottom of calendar card, `marginTop:6`, no separator line or border.

**Selected-day card (single, always shown — replaced the old "Selected date detail" + "YOUR SESSIONS" split):** one white card (`s.dayCard`) directly under the calendar that **always reflects the tapped day** (`selectedAppts = allAppts.filter(date === selectedDate)`, sorted by time). There is **no separate YOUR SESSIONS list** — the calendar dots convey which days have sessions; `upcomingAppts` was removed.
- **Empty day:** "No appointment on this day". If `selectedDate >= todayStr`, an **availability-aware** block follows (everything routes through availability — deliberately **no** specific day/time booking): `availabilityRangesForDate(selectedDate)` computes the client's given time ranges for that day (week-specific `availability_slots` first, else recurring; slots merged into `HH:MM–HH:MM` ranges via module-level `mergeSlotRanges`). If ranges exist → "Availability given · 09:00–10:30 · 15:00–16:00" (ACCENT). If none → "No availability given for this day." (MUTED). Then a lightweight **text link** (`dayAvailLink`, not a pill) "Change availability for this day →" / "Give availability for this day →" + `arrow.right` → `/(client)/availability?weekStart=' + mondayOfStr(selectedDate)`. Past empty days show only the "No appointment" line. `availSlots` is fetched in `load()` (`week_start, day_of_week, start_time, end_time, is_recurring`).

**AVAILABILITIES section** (replaced the old standalone "Give Availability" button + separate saved-week chips card — they were redundant with the day-card link): one titled card containing, top to bottom: (1) **Recurring summary** (`recurringSummary()` → per-weekday merged ranges) shown as "Recurring · every week" + one line per day "Mon · 09:00–12:00, 15:00–17:00" (`arrow.triangle.2.circlepath`, taps to `/(client)/availability`); (2) **per-week given chips** (`futureAvailWeeks`, `checkmark.circle.fill` + "Week of D–D Mon" + `savedActionLabel`); (3) "No availability given yet." when neither exists; (4) a divider then the **"Give availability"** button (`calendar.badge.plus`, centered) → `/(client)/availability`. Rows carry their own `paddingHorizontal:14`; `availCard` has none.
- **Day with appointment(s):** each row = colored 3px left stripe (ACCENT scheduled / `#b8ede0` completed / RED cancelled) + type label (`apptType`) + `HH:MM · N min`. A pending client request shows `apptPending` ("Time change requested" / "Cancellation requested" in red). Right side: **"Edit"** pill when `status==='scheduled' && date >= todayStr`; a green ✓ badge when completed; nothing otherwise.

**Edit window (`editAppt` modal, replaces the old Move Request modal):** white centered modal, `KeyboardAvoidingView`. Step 1 = menu with **"Request time change"** and **"Request cancellation"** (red). Step 2 = note `TextInput` + "Vitek will review and get back to you." + send. Cancellation <24h (`!isMoreThan24hAway`) shows an amber warning box "This session is less than 24h away. It will still need to be covered." `sendRequest()` inserts a `move_requests` row with `kind` ('move'|'cancel') + `within_24h` (cancel & <24h) and optimistically fills `pendingReqs`. Both are **requests the trainer approves** — clients never change/cancel directly. `isMoreThan24hAway(appt)`: `new Date(date+'T'+start_time).getTime() - Date.now() > 24*3600*1000`.
- **`pendingReqs`** (`Map<appointment_id, 'move'|'cancel'>`): fetched in `load()` from the client's own `status='pending'` `move_requests`; drives the "requested" label on the day card.

**Section order:** Calendar → Selected-day card → AVAILABILITIES section → Past Sessions → My Package.

**Give Availability:** `TouchableOpacity`, 1.5px ACCENT border, `calendar` SF Symbol (20px, ACCENT) left, bold ACCENT "Give Availability" title, `chevron.right` icon right. Navigates to `/(client)/availability`. No subtitle text.

**Saved availability chips** (rendered immediately below the Give Availability button when `futureAvailWeeks.length > 0`): white card, one row per future week that has saved slots. Each row: `checkmark.circle.fill` 14px ACCENT · two lines — "Week of DD–DD Mon" HEADER 13px/500 + a sub-line `savedActionLabel(savedAt, isUpdate, todayStr)` = **"Saved today/yesterday/D Mon"** or **"Updated …"** (verb from `availability_notifications.is_update`; time from the latest `availability_slots.created_at` for that week) · `chevron.right`. Tapping → `/(client)/availability?weekStart=YYYY-MM-DD`. `futureAvailWeeks` is `{weekStart, savedAt, isUpdate}[]`, built in `load()` from `availability_slots` + `availability_notifications`.

**Past Sessions section header:** `sectionHeader` flex-row with `PAST SESSIONS` label left and `See all →` ACCENT link right → `router.push('/(client)/past-sessions')`. Shows only `lastSession` (most recent).

**`ApptDetailRow` (exported):**
- `showDate=true`: top row = date (left) + badge (right); second row = time · duration (`marginTop:4`)
- `showDate=false`: single row = time · duration (left) + badge (right)
- Badge: 22×22 `borderRadius:11` circle — ACCENT bg + white `✓` for completed; RED `#e85d4a` bg + white `✗` for cancelled
- **No type pill** — removed; to be added in a future iteration
- Notes below when `!!appt.notes` — never add notes to a scheduled/no-notes row
- `det` StyleSheet exported alongside the component

**`localDateStr(d)` helper** — always use this instead of `toISOString()` for date comparisons.

### Past Sessions screen (`app/(client)/past-sessions.tsx`)

**Header:** `SafeAreaView edges={['top']}` + 62px bar — same as `all-workouts.tsx`. `headerSide` width 48px. `headerRight` has `paddingRight:16`.

**Status filter:** Type 1 switcher (All / Done / Cancelled). `handleStatusChange` resets `monthFilter` to null.

**Year filter row:** tappable → white centered modal. `handleYearSelect(null)` for "All years"; `handleYearSelect(y)` for a year (resets monthFilter). Modal lists all years from sessions, counts from `statusFiltered` (unaffected by month).

**Month filter row:** only shown when `yearFilter !== null && availableMonths.length > 0`. Count badge (`rgba(36,172,136,0.12)` bg, ACCENT text) shows `monthDisplayCount`. `handleMonthSelect` toggles.

**Critical ordering:** `monthDisplayCount` **must be declared after** `availableMonths` is built — it calls `.find()` on that array. Reversing the order causes a "cannot read property 'find' of undefined" render crash.

**Chevron:** always `SymbolView name="chevron.down" size={13}`. Never use `▾` text character. Tint = ACCENT when filter is active, MUTED when default.

**Count in year modal:** `yearTotalMap` — counts status-filtered sessions per year, not narrowed by month (modal always shows full year totals regardless of month selection).

**Count in month row badge:** `monthDisplayCount` — when `monthFilter !== null` → that month's count; when `monthFilter === null` → year total (`yearTotalMap[yearFilter]`) or all sessions if no year selected.

**Year row has no count badge** — count information moved entirely to the month row.

---

## 3. Permissions

- ⋯ menu on workout cards (Edit workout / Change Photo / Add to Routine / Set Category / Post-workout Stretch / Mark as done or Reactivate / Delete): trainer only — **never rendered on client screens**. "Rename" was removed July 2026 — renaming is now part of **Edit workout** (opens the builder in edit mode via `editWorkoutId`); see the "Edit workout" RESUME note at the top.
- Info tab on client profile: trainer only
- Always check role before rendering trainer-only UI

### Do Mode — client vs trainer permissions
`isTrainer = false` in `app/(client)/workout/[workoutId].tsx`. Gate all trainer-only UI with this flag.

**Clients CAN:**
- Long-press to enter reorder/drag mode (drag handles appear, dragging works — no wiggle)
- Swipe left → **Replace only** (single 80px button, `revealW = 80`)
- Mark/unmark exercises done (circle) — including inside `SupersetGroupCard` in edit mode
- See drag handles in edit mode (same as trainer)

**Clients CANNOT:**
- Delete exercises, create/break/undo supersets — **no action bar** rendered for clients
- Add exercises below via swipe (Add below button gated: `isTrainer`)
- Add exercises via floating + button on free sessions (`isFreeSession && isTrainer`)
- See selection circles in edit mode — their circles stay as normal completion circles

**`SupersetGroupCard` in client edit mode:**
- Drag handle shown for the group (so the group can be reordered)
- Done circles render for each member via the `numCircle` / `numCircleDone` pattern (same as ExerciseCard normal mode)
- Props `onMarkDone(weId)` and `onUnmarkDone(weId)` passed from parent, resolved to `exIdx` via `exercises.findIndex`
- Hard block still applies: `onMarkDone` checks `startedAtRef.current` before calling `markDone(idx)`
- No action bar, no selection state for clients

**Trainer edit mode — action bar:**
- Replaces the old inline − / + / ✕ buttons (those no longer exist anywhere in the code)
- Action bar (`editActionBar`) slides up from bottom on entering edit mode
- Tapping exercise circles in edit mode selects/deselects them (`selectedExerciseIds: Set<string>`)
- See §5 Do Mode edit mode section for full action bar logic

---

## 4. Data & Storage

### Workout categories and stretch system
- `CATEGORY_OPTIONS` (9 standard) and `STRETCHING_CATEGORIES` (3 stretch) are exported from `lib/workoutCategories.ts`. Always import from there — never hardcode.
- `STRETCHING_CATEGORIES = ['Upper body stretching', 'Lower body stretching', 'Full body stretching']`
- `STRETCHING_CATEGORY_TO_STRETCH_TYPE` maps each stretching category → `'upper_body' | 'lower_body' | 'full_body'`
- When a stretching category is selected in the builder, `stretch_type` is auto-set and the Post-workout stretch toggle is hidden
- The query to find a stretch session workout: `WHERE stretch_type = X AND category IN (STRETCHING_CATEGORIES) AND client_id = Y`. This lookup (in `SessionCompleteScreen.tsx`) reads the **`workouts`** table by `client_id` — it never reads any tab, and a **template can never be linked** (templates have no `client_id`).
- Stretching workouts appear in a **Stretching tab** on both the client's all-workouts screen **and** the trainer's per-client all-workouts screen (`app/(trainer)/client/[id]/all-workouts.tsx`, `mainTab: 'workouts' | 'stretching'`). *(This reverses the earlier rule that hid stretch workouts on the trainer side — the trainer needs to see/adjust each client's stretch sessions.)* The Stretching tab shows no Active/Not-Active toggle, category filter, or weekly bar on either side.

### Post-workout stretch — auto-provisioning from templates (Model A)
- **Model A (shared per-client):** each client has **one** Upper / Lower / Full stretch workout, reused by every workout that points to that type. Edit it once, applies everywhere.
- **Auto-provision:** when a **regular** workout is saved with a `stretch_type` (Post-workout stretch toggle set) and the client has **no** matching stretch workout yet, `ensureClientStretchWorkout()` (in `workout-builder.tsx`) deep-copies the matching stretch **template** (found by `stretch_type` + stretching category, most recent if several) into the client → it lands in their Stretching tab → the SessionComplete link resolves. If the client already has one, it is **never** overwritten (per-client edits are preserved). Guarded by `!isStretchingCategory && stretchType`; non-fatal (a failure must not roll back the already-saved workout).
- Keep 3 stretch **templates** (Upper/Lower/Full) as the reusable masters. A template is only a blueprint; the client-owned copy is what gets linked.

### Workout creation flow — universal builder + destination at Save
- **One `+`, one builder.** The Library Workouts `+` (both Workouts and Templates sub-tabs) opens `workout-builder` with **no `clientId` and no `mode`** — build first, choose the destination at Save. (The old "pick a client first" `ClientPickerModal` and the `mode=template` fork were removed.)
- **`SaveSheet` is a universal multi-step destination picker** (`workout-builder.tsx`): step 1 **destination** — "Assign to a client" or "Save as a template"; step 2 (client only) **pick client**; step 3 **placement** — Standalone / Save as New Routine / Add to Existing Routine. When launched **with** a `clientId` param (client profile `+`, routine detail), the client is already known → the sheet opens straight on **placement** (backward-compatible). `SaveIntent` carries `clientId` for client saves.
- **Cover photo works for everything, incl. templates** (the old template-mode gate is gone).
- **Templates** are saved to `workout_templates` (+ `template_exercises` + `template_sets`). Schema-corrected: the builder inserts real `template_sets` rows (it previously inserted non-existent `sets`/`reps` columns and silently failed). `workout_templates` has `cover_image_url`, `category`, `stretch_type` (added for full parity).
- **Templates gallery** (Library → Workouts → **Templates** tab, `TemplateLibraryRow`): lists template **workouts** (whole blueprints, not exercises) as cover cards with a "TEMPLATE" badge + exercise count + category pill. Tap → `workout-builder?templateId=X` (loads the template into the builder to review/assign/tweak). ⋯ menu (`TemplateMenuModal`): **Use template** / Rename / Change Photo / Set Category / Delete. Delete removes `template_sets` → `template_exercises` → `workout_templates`.
- **`templateId` param** in `workout-builder`: hydrates the builder from `workout_templates` + `template_exercises` + `exercises` + `template_sets`. Then Save routes through the same universal sheet (usually Assign to a client). Re-uploads the cover to the client folder on save. When a `clientId` is also present (scheduling for a known client), set rows are overlaid with that client's **last-performed** weight/reps (see below) instead of the blueprint's targets.
- **`editWorkoutId` + `scheduleDate` params (edit-in-place / schedule-on-save, July 2026):** launched by the **Workouts Library** day picker (`add-workout.tsx`). `editWorkoutId` preloads an existing workout to review/tweak; `scheduleDate` (YYYY-MM-DD) schedules the saved workout on that day after Save (inserts a `sessions` row `status='scheduled'`).
  - **Last-performed pre-fill (`fetchLastPerformedMap`):** when opening a workout/template to schedule for a known client, each set row is pre-filled with what the client **actually last did** (max/most-recent completed-session `weight_kg`/`reps_completed` per `set_number`), not the stale planned targets — the trainer sees real numbers. Blank when the client has never performed that exercise.
  - **`BuilderExercise.originalWeId`:** set only when loaded from an existing workout, so Save can update/keep the original `workout_exercise` row (and its logged history) instead of delete+re-insert.
  - **Update-in-place vs copy at Save:** `doUpdateInPlace = editWorkoutId && the loaded workout's client_id === the target client`. When true, the existing `workouts` row is **updated** and its exercises **reconciled** — kept rows updated (order/superset), added rows inserted, **removed rows soft-deleted (`is_active=false`, never hard-deleted)** so their `session_logs` survive; `workout_sets` are fully replaced. Otherwise (editing another client's workout, or a template) Save **inserts a fresh workout** (copy). Editing another client's workout copies it into the target client — the old `copyWorkoutToClient()` instant-copy path in `add-workout.tsx` was removed in favour of this builder flow.
  - **`resolveCover(folder)`:** reuses an unchanged remote cover URL as-is (loaded from an existing workout/template — tracked via `loadedCoverUrl`), only re-uploading a **freshly picked local** image. Avoids needless re-uploads on every edit.

### Workout status
- `workouts.status` — `'active'` (default) or `'completed'`. Set by trainer via ⋯ menu ("Mark as done" / "Reactivate"). Completing a session does NOT auto-set this.
- In all-workouts screens: **Active / Not Active** toggle (Type 1 switcher). Newest always on top (sort by `created_at` desc). Done workouts have a "Done" badge + muted appearance. On client side, tapping a done workout shows a prompt before opening Do Mode.
- The Stretching tab on the client's all-workouts screen does NOT show the Active/Not Active toggle.
- ⋯ menu options with `onToggleStatus` exist in: `app/(trainer)/(tabs)/library.tsx`, `app/(trainer)/client/[id]/index.tsx`, `app/(trainer)/client/[id]/all-workouts.tsx`

### WorkoutExercisesModal (`components/WorkoutExercisesModal.tsx`)
Shared component used on both trainer and client sides to show a workout's exercise list as a slide-up **`BottomSheet`** (July 2026 — was a white centered modal). Since it's shared, this makes the exercise-list popup slide up everywhere it's used.
- **Props:** `workoutId: string | null`, `workoutName: string`, `onClose: () => void`. Renders nothing when `workoutId` is null.
- **Data:** fetches `workout_exercises` (`.eq('is_active', true)`, ordered by `order_index`) joined with `exercises(name, equipment)`, then `workout_sets` filtered by `.in('workout_exercise_id', weIds)` ordered by `set_number`. (See the app-wide `is_active` rule under Data & Storage — every workout-exercise read filters it so soft-removed exercises never render.)
- **Set summary:** if all sets have same reps + weight → `"N × Y reps · Z kg"`. If varied → per-set values joined by `"  ·  "`.
- **Layout:** title (17px/700) → hairline divider → `ScrollView` of exercise rows (name 15px/600 HEADER, equipment 11px MUTED below if present, set summary 13px TEXT below that) → ACCENT green Done pill.
- **Used in:** client `all-workouts.tsx`, client `routine/[routineId].tsx`, trainer `client/[id]/all-workouts.tsx`, trainer `client/[id]/routine/[routineId].tsx`, trainer `client/[id]/index.tsx` (training tab).

### All Workouts screen — trainer (`app/(trainer)/client/[id]/all-workouts.tsx`)
- **Weekly progress (mirrors client):** `WorkoutRow` has `thisWeekCount: number`. `fetchAllWorkouts` computes it via `thisWeekCountMap` (sessions `status='completed'` within weekStart–weekEnd). `fetchWeeklyGoal(clientId)` fetches goal from `availability_submissions` + `users.weekly_session_goal` fallback. Both called in parallel in `load()`.
- **WeekProgressBar:** shown above the workout list when `weeklyGoal != null` and `statusFilter === 'active'`. Same THIS WEEK X / Y layout as client.
- **Section sorting:** `doneList` (thisWeekCount > 0) first → "NOT DONE THIS WEEK" label → `restList`. Label style: `styles.sectionLabel` (12px/700 `#aaa` uppercase).
- **Done-this-week badge on cards:** same inline `nameRow` pattern as client — 16×16 green circle with ✓ next to workout name. Not shown when `status='completed'`.
- **⋯ menu options:** Edit workout · Session details · Change Photo · Add to Routine · Mark as done / Reactivate · Delete. "Session details" opens the `SessionDetailsSheet`. (Rename was removed July 2026 — folded into Edit workout.)

### Stretch sessions and packages
- Stretch sessions (`isStretchSessionRef.current = true`) do NOT increment `sessions_used` on the active package — guarded in `saveSession` of both Do Mode files
- Stretch sessions are excluded from "last done" / Recent Activity / Last Session Highlights via `STRETCHING_CATS` filter on `completedSessions` in `lib/clientTraining.ts` and the highlights queries in training tabs

### Just Added (client training tab)
- `fetchClientTraining` returns `justAddedWorkouts`: active workouts created in the last 14 days with no completed sessions. Shown as a "JUST ADDED" section above "RECENT ACTIVITY" with a green "NEW" badge.

- **Image uploads:** always `arrayBuffer()` — never `blob()` (crashes in React Native)
- **UUIDs:** never import `uuid` or use `crypto.randomUUID()`. Use `makeUUID()` helper: `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); })`. For React keys only (not DB): `` `${Date.now()}-${Math.random().toString(36).slice(2,9)}` ``
- **Session logs:** save every set where user entered weight or reps. Include `barbell_weight_used_kg` for barbell exercises (use `barbellWeightsRef` Map, default 20).
- **Cross-workout weight pre-fill:** query all `workout_exercise_ids` for each exercise across ALL workouts, last 50 completed sessions. Map key: `${exerciseId}:${machineBrand??''}`. Non-machine: `${exerciseId}:`.
- **Peek data:** query ALL completed sessions oldest-first (`allSessAscData`), keep oldest non-null weight/reps per exercise+set.
- **Session photos:** queried by `workout_exercise_id` with NO session_id filter — photos persist across sessions. Load in `load()` not `useFocusEffect`.

### Exercise media uploads (exercise builder — `app/(trainer)/add-exercise.tsx`)

**Videos (multiple supported):**
- State: `videoItems: { videoUrl: string; thumbnailUri: string | null }[]` array + `uploadingNewVideo: boolean`
- Upload fires immediately on pick (not deferred to Save). Each video appended to `videoItems`; thumbnail generated async via `expo-video-thumbnails` and patched onto the item by `videoUrl` key
- First item → `exercises.video_url`; remaining → `exercises.extra_video_urls TEXT[]`
- `thumbnail_url` auto-set from `videoItems[0].thumbnailUri` unless a photo is present
- On edit load: populate `videoItems` from `video_url` + `extra_video_urls`; extra items have `thumbnailUri: null`
- UI: stacked cards per video (height 200px), each with play icon overlay + "Primary angle" / "Angle N" label + ✕ remove button. "+ Add another angle" dashed button always shown below

**Photos (multiple supported):**
- State: `photoItems: { displayUri: string; localUri: string | null }[]` (`localUri` null = already uploaded)
- Picked from library, uploaded on **Save** (not on pick). Upload path: `workout-covers` bucket → `exercise-photos/{folder}/{makeUUID()}.jpg` where `folder = exerciseId ?? makeUUID()`
- All photos stored in `exercises.extra_photo_urls TEXT[]`. First photo also sets `exercises.thumbnail_url` (overriding any video auto-thumbnail)
- On edit load: populate `photoItems` from `extra_photo_urls` only (not `thumbnail_url` — can't distinguish video auto-thumbnails from user photos)
- UI: stacked cards per photo (height 200px) with ✕ remove. "+ Add another photo" / "Add photo" dashed button below

**Save payload:**
- `video_url = videoItems[0]?.videoUrl ?? null`
- `extra_video_urls = videoItems.slice(1).map(v => v.videoUrl)`
- `thumbnail_url = finalPhotoUrls[0] ?? videoItems[0]?.thumbnailUri ?? null`
- `extra_photo_urls = finalPhotoUrls` (all uploaded photos)

### Storage buckets (all public)
- `workout-covers` — workout cover images **and** exercise photos (`exercise-photos/` prefix)
- `session-photos` — session exercise photos
- `client-banners` — trainer banner photo (uploaded from Account tab)
- `exercise-videos` — exercise video files
- `exercise-thumbnails` — exercise video thumbnails
- `profile-avatars` — client profile photo avatars (uploaded from client Me tab)
- `recipe-covers` — recipe cover photos (trainer + client recipe create screens, `arrayBuffer()` upload, `upsert:true`)
- `trainer-foods` — trainer food photos (uploaded from Library → Foods tab, `arrayBuffer()`, `upsert:true`). Upload path: `{trainerId}/{makeUUID()}.jpg`

### Other DB rules
- `workout_exercises.is_active` (`BOOLEAN NOT NULL DEFAULT true`) — **soft-delete flag (July 2026).** When the trainer edits a workout and removes an exercise, the builder sets `is_active=false` **instead of deleting the row** (a hard delete would cascade its `session_logs` and erase the client's logged history for that exercise). The row + its logs are kept, so the client's last-performed weight/reps stay queryable and pre-fill wherever that exercise appears again (cross-workout, by `exercise_id`). **Every read of a workout's exercise list MUST filter `.eq('is_active', true)`** — currently: both Do Mode files, `WorkoutExercisesModal`, `RoutineDetailsSheet`, the `RoutineQuickLookModal` exercise-count, and the workout-builder edit-load. The weight-memory/last-performed queries (`fetchLastPerformedMap`, cross-workout pre-fill) deliberately do **not** filter it — they want the inactive rows' logs too.
- `exercises` table has `secondary_muscle_groups TEXT[] NOT NULL DEFAULT '{}'`, `extra_video_urls TEXT[] NOT NULL DEFAULT '{}'`, `extra_photo_urls TEXT[] NOT NULL DEFAULT '{}'` — always include in selects/inserts
- `sessions.workout_id` nullable — always null for free sessions
- `sessions.name TEXT` — set for free sessions, null for regular
- `recipes` table: loaded in RecipesTab via `useFocusEffect` with no `.or()` filter — RLS handles trainer visibility. Always guard with `if (!trainerId) return` before fetching. Never construct `.or('created_by.eq.,is_shared_to_trainer.eq.true')` with an empty UUID — PostgREST silently returns nothing.
- `nutrition_tips` table: `category` is `'tip'` or `'supplement'`. `'supplement'` rows = Recommendations tab; `'tip'` rows = Tips tab. Always filter by `trainer_id = auth.uid()`.
- `trainer_settings.hidden_system_tip_indices` — integer array, default `'{}'`. Used to hide system tips per trainer without deleting them.
- `trainer_foods` table: trainer-curated foods. RLS: trainer manages own rows; all authenticated users can SELECT. `portions JSONB DEFAULT '[]'` stores named portions as `{label, grams}[]` — 100g is always implicit and never stored. `source = 'trainer'` when logged. Searched via `name.ilike` OR `name_de.ilike`.
- `food_log_entries` table: queried by `client_id + date` for the daily food log. `meal_category` uses 8 typed snack keys; legacy value `'snack'` maps to `snack_afternoon` in display logic. `source` CHECK constraint allows: `off | usda | manual | custom | trainer`.
- `food_cache` table: 7-day TTL (`CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000`). Primary key `(source, source_id)`. Checked before hitting Open Food Facts or USDA APIs.
- `water_logs` table: `id, client_id (→users.id), date, glasses_count (INT DEFAULT 0), created_at`, `UNIQUE(client_id, date)`. One row per client per day; each glass = 250ml. RLS: client ALL (`client_id = auth.uid()`) + trainer SELECT. Food Log `saveWater()` upserts on `client_id,date`. **Created July 2026** — the table was referenced by the Food Log code but had never actually been created, so water taps failed silently and reset to 0 on reload.
- `favourite_days` table: `id, client_id, name (NOT NULL), date_reference (DATE), snapshot_json (jsonb DEFAULT '[]' — the day's FoodLogEntry rows), created_at`. RLS: `client_manage_own_favourite_days` (`client_id = auth.uid()`, ALL). Pink heart dot indicators on the calendar picker; the week-strip heart fills (light-green `heart.fill`) when the selected day is saved. **Created July 2026** — it was referenced by the save-day code but never actually created, so saving a day failed silently (nothing persisted, no heart dot) — same class of bug as `water_logs`/`favourite_foods.food_groups`.
- `availability_slots` table: `client_id, trainer_id, week_start (DATE, always Monday), day_of_week (1=Mon…7=Sun), start_time, end_time, is_recurring (BOOLEAN DEFAULT false)`. RLS: client ALL; trainer SELECT. `is_recurring=true` rows represent the client's standing pattern; `is_recurring=false` rows are week-specific. On "save for this week only": delete non-recurring for that week, insert new non-recurring. On "save for all coming weeks": also delete all recurring for that client **and delete any non-recurring slots + `availability_submissions` for future weeks (`week_start > weekStart`)** — so every future week falls back to the new recurring pattern and no previously-customised future week keeps overriding it — then insert new recurring + non-recurring for current week.
- `availability_submissions` table: `client_id, trainer_id, week_start, sessions_wanted (INT DEFAULT 1), note (TEXT nullable), is_recurring (BOOLEAN DEFAULT false)`. `UNIQUE(client_id, week_start)`. RLS: client ALL; trainer SELECT. Upserted alongside slot inserts.
- `availability_notifications` table: `id, client_id, trainer_id, week_start (DATE), status ('pending'|'actioned'), is_update (BOOLEAN DEFAULT false), created_at`. `UNIQUE(client_id, week_start)`. RLS: client ALL; trainer ALL. Upserted by client on submit (when slots > 0); deleted when client clears all slots. `is_update=true` when a notification for that week already existed. Trainer marks actioned from the Notifications modal.
- `schedule_blocks` table: `trainer_id, date, start_time, end_time, label (TEXT nullable)`. RLS: trainer ALL. Fetched alongside appointments in `fetchData`. Rendered as grey cards on the Schedule grid.
- `move_requests` table: `appointment_id, client_id, trainer_id, note TEXT NOT NULL, status ('pending'|'actioned')`. RLS: client ALL; trainer ALL. Client inserts; trainer marks actioned.
- `appointments.type` CHECK constraint: `('pt_session', 'nutritional_advising', 'trial', 'consultation')`. Only `pt_session` and `nutritional_advising` are shown in the booking UI; `trial` and `consultation` are retained for legacy data.
- `users.availability_type` column: `TEXT nullable CHECK ('fixed'|'flexible_recurring'|'variable') DEFAULT 'variable'`. Set by trainer in client Info tab.
- `users.weekly_session_goal` column: `INTEGER DEFAULT NULL`. Set by trainer in client Info tab (Training Preferences section). Used as fallback goal on the client Training tab weekly goal card when no `availability_submissions` row exists for that week.
- `appointments.status` CHECK constraint: `('scheduled', 'completed', 'cancelled', 'cancelled_charged')`. `cancelled_charged` = cancelled but counts against package. Trainer sets via "Cancel — client pays" in view sheet; immediately increments `sessions_used` on active package (unlike regular sessions which use the edge function).

### `lib/foodApi.ts` rules
- USDA food names: always converted to Title Case via `toTitleCase(str)` — `str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())`. Never store raw ALL-CAPS USDA names.
- Salt normalization: `normaliseOFFNutriments` and `normaliseUSDANutrients` both apply `if (salt > 10) salt /= 1000` — some sources return salt/sodium in mg instead of g, causing values > 10g/100g which are impossible for normal foods.
- Salt from USDA: `sodium_mg × 2.5` → salt_g. Apply the `> 10` mg-guard after the multiplication.
- `getCached()` salt guard: applies `if (n.salt > 50) n.salt /= 1000` after reading `nutrients_json` from cache. Threshold is **50, not 10** — legitimate high-salt condiments (bean sauce, soy sauce) can reach ~11–18g/100g, so a 10 threshold would incorrectly halve them. Values > 50g/100g are physically impossible for any consumable food. A one-time DB migration (May 2026) fixed existing stale entries in `food_cache` and `food_log_entries` that had salt stored in mg.
- `fetchWithTimeout(url, ms=8000)`: uses `AbortController + setTimeout` — NOT `AbortSignal.timeout()` (doesn't exist in Hermes/React Native).
- `searchFoods()`: hits Supabase cache first (`ilike` search, 7-day TTL), then OFF + USDA in parallel. Returns deduplicated, ranked results. Cache results ≥10 → skip API calls. **Always** also runs `searchTrainerFoods(query)` in parallel (regardless of cache hits) — trainer foods are merged into every search result set.
- `searchTrainerFoods(query)`: queries `trainer_foods` with `.or('name.ilike.%q%,name_de.ilike.%q%')`. Returns `FoodResult[]` with `source: 'trainer'`.
- `lookupBarcode(barcode)`: checks Supabase `food_cache` first (OFF source), then hits `https://world.openfoodfacts.org/api/v0/product/[barcode].json`.
- `calculateNutrition(food, amount, unit)`: scales `nutrientsPer100g` by `toGrams(food, amount, unit) / 100`. Salt rounded to 3 decimal places, others to 1 d.p.
- `PortionUnit` type: `'g' | 'serving' | 'piece' | 'cup' | 'tbsp' | 'tsp' | 'ml'`
- `FoodResult.source` type: `'off' | 'usda' | 'manual' | 'custom' | 'trainer'`
- `FoodResult.nameDe?: string` — German name, populated for trainer foods only
- `FoodResult.portions?: FoodPortion[]` — populated for trainer foods from `trainer_foods.portions` JSON; for USDA foods fetched lazily via `fetchUSDAPortions`
- **Ranking scores**: `trainer` = 1100 (always first) · `custom` = 1000 · USDA/OFF = scored by name match (~−80 to 120)
- `TrainerFoodRow` interface exported from `lib/foodApi.ts` — matches the `trainer_foods` DB schema including `portions: FoodPortion[] | null`
- `trainerFoodToResult(row: TrainerFoodRow): FoodResult` — exported, used by FoodsTab and food log
- `loadTrainerFoods(trainerId)` — exported, returns `{ foods: FoodResult[], rows: TrainerFoodRow[] }` ordered by name

---

## 5. Do Mode

### Session Intro (pre-session) screen — CLIENT ONLY (July 2026)
The pre-session intro screen is **client-only**. **The trainer version was removed** (`app/(trainer)/client/[id]/workout/session-intro.tsx` deleted) — Vitek didn't want a pre-session screen as a trainer. **Every trainer workout-card tap now navigates straight to Do Mode** (`/(trainer)/client/${clientId}/workout/${workoutId}`, no autoStart), where the trainer reviews/edits and presses START manually (or hits the existing hard-block prompt if they try to mark done / add a photo before starting). The old trainer navigations to `session-intro` from `index.tsx` (gallery, recent activity, week-strip session/planned cards), `all-workouts.tsx`, `routine/[routineId].tsx`, and `library.tsx` were all repointed to Do Mode. **Never reintroduce a trainer pre-session screen.**

**Client:** `app/(client)/workout/session-intro.tsx` — always shown between a client workout-card tap and Do Mode (never skipped, even with no thumbnails).
- Route: `/(client)/workout/session-intro?workoutId=<id>` — static route, takes priority over `[workoutId]`.
- Navigation: client workout-card taps across `train.tsx`, `all-workouts.tsx`, and `routine/[routineId].tsx`. The Training-tab week-strip cards pass **context params** so the intro can tailor its buttons.
- **Context params (`sessionDate`, `planned`) decide the buttons:**
  - **Launcher** (gallery / all-workouts / routine — no params) → **View session** + **Start session today**.
  - **Completed session card, today** (`sessionDate === today`) → **View session** ONLY.
  - **Completed session card, past** (`sessionDate < today`, from the week strip) → **View session** + **Start session today**.
  - **Planned/future card** (`planned=1` — the planned session cards on the Training tab are now **tappable** for this) → **View session** ONLY.
- **The Start button is always labelled "Start session today"** — starting always logs a brand-new session dated **today** regardless of which day was tapped (so the client understands it lands on today in the week strip). It navigates to `/(client)/workout/<id>?autoStart=1` (auto-starts on arrival; `introAutoStarted` ref guards double-fire; `timerPromptShown` suppresses the soft prompt).
- **View session** navigates to `/(client)/workout/<id>?viewOnly=1&viewMode=<mode>` (push, not replace, so backing out returns here). `viewMode = isPlanned ? 'none' : hasDate ? 'finished' : 'start'` — drives the read-only Do Mode header pill (see "View-only Do Mode" below). **View is ALWAYS read-only — never startable** (the only way to start is the "Start session today" button).
- Header meta reflects context: top label = `Planned session` / `Past session` / `Today's session`; meta = `Session N · <today>` (launcher) or `Planned · <date>` / `Done · <date>`. Date/meta text is 13px.
- Session count: fetched for `profile.id`.

### View-only Do Mode — CLIENT (read-only, July 2026)
Opening client Do Mode with `?viewOnly=1` is a **fully read-only browse view** — never startable, nothing editable. Vitek's rule: **View = look at video/notes/weights; Start = only ever the "Start session today" button on the pre-session screen.** (This replaced an earlier design where View was sometimes startable — that inconsistency was confusing.)
- Params: `viewOnly=1` + `viewMode` (`finished` | `start` | `none`). `isViewOnly = viewOnly === '1'`; `showFinishedPill = isViewOnly && viewMode === 'finished'`.
- **Header pill:** a running session always wins (timer + FINISH). Otherwise, in view-only: `finished` → non-clickable **`mm:ss · FINISHED`** pill (duration from the most recent completed session, `viewedSessionDuration`, read from the `recentSessData[0].duration_seconds` in `load()`); `start`/`none` → **no pill at all**. (The normal not-started START pill only shows outside view-only.)
- **Read-only gating** — a `readOnly` prop is threaded to `ExerciseCard` (both call sites) and down to `InlineSetRow`. When `readOnly`: done circles non-tappable; weight/reps `TextInput`s `editable={false}`; **Add Set/Dropset + camera row hidden**; **Start-timer button hidden**; set ✓ / remove-✕ columns replaced with empty `setIconBtn` spacers (so the KG/REPS/TOTAL columns stay aligned); bar/machine selectors `pointerEvents="none"`; swipe (`Swipeable enabled={!isEditMode && !readOnly}`) and long-press-to-edit disabled.
- **Notes are read-only too:** the per-exercise **Info modal** (`ExerciseInfoModal`) and the **Training Notes** modal (`TrainingNotesModal`, reached via the ⋯ `DotsMenuSheet`) both take a `readOnly` prop that hides the client "Add note" input **and** the note delete-✕ buttons. Viewing existing notes still works. `readOnly` is threaded ⋯ menu → `DotsMenuSheet` → `TrainingNotesModal`.
- Still available in view: expand/collapse cards, Play video, Info/notes (read), Muscle Groups, Equipment, Session History.

**Client auto-start:** `autoStart=1` param triggers a `useEffect` in client do mode (`[autoStart, loading]` deps) that calls `startSession(workoutId!)` + `createInProgressSessionRef.current()` once `loading` is false. Trainer side is unchanged (no autoStart).

**Crossfade architecture — alternating-layers:**
Two image layers always mounted (`layer1Uri` = regular `Image`, `layer2Uri` = `Animated.Image`). Only the *invisible* layer's source ever changes — never the visible one — eliminating flicker:
- Layer 2 invisible (opacity=0): update `layer2Uri`, animate opacity 0→1. After: `isLayer2OnTopRef = true`.
- Layer 2 visible (opacity=1): update `layer1Uri` (hidden under layer 2), animate opacity 1→0. After: `isLayer2OnTopRef = false`.
`layer2Opacity` is a stable `useRef(new Animated.Value(0)).current`. Slideshow advances every 2s via `setInterval` using refs (`slideshowItemsRef`, `slideshowIdxRef`) so the closure is always current. Dots and exercise list update at **transition start** (`setSlideshowIdx` called at top of `crossfadeTo`), not completion.

**No-image fallback:** when no exercises have a `thumbnail_url`, `slideshowItemsRef` is populated with all exercises and the same 2s interval runs — `crossfadeTo` detects `thumbnail_url === null` and skips the image animation, only updating the index. `cycleItems = exercises` (all) drives the dots row and active exercise highlighting. Background: dark green gradient `['#2d6b5a','#244e43','#1a3832']` + faint centered `dumbbell.fill` SF Symbol at 10% opacity. All other UI (workout name, session meta, dots/stripes, exercise list with active highlight cycling, Start session button) renders identically to the image version.

- Exercise rows collapsed by default, inline expansion only
- **Files:** trainer = `app/(trainer)/client/[id]/workout/[workoutId].tsx` · client = `app/(client)/workout/[workoutId].tsx`
- **Both files** now share the same static nav bar architecture (no scroll-driven fading). The trainer file previously had a scroll-driven collapsing header — this has been replaced to match the client design exactly. The `navBgOpacity` interpolation is still present for background fade on scroll but nav bar content is always visible.

### Header constants
```ts
const HEADER_MAX = SCREEN_HEIGHT * 0.38;
const HEADER_MIN = Math.max(insets.top + 50, 82);
const COLLAPSE_END = HEADER_MAX - HEADER_MIN;
const COLLAPSE_START = Math.max(0, COLLAPSE_END - 80);
```

### Header background
- **Cover image workout:** raw photo fills `StyleSheet.absoluteFill` + bottom-only vignette `LinearGradient colors={['transparent','rgba(0,0,0,0.38)']} start={{x:0,y:0.45}} end={{x:0,y:1}}`. No full dark overlay.
- **No cover image:** 3-stop dark green `['#2d6b5a','#244e43','#1a3832']`.

### Nav bar — both trainer and client (static, always visible)
Fixed `position:'absolute'` view at `top:0, height:HEADER_MIN`. Three slots:
- **Left:** `‹` back button (`floatIconBtn` — 36×36 dark circle)
- **Center (`flex:1`, `alignItems:'center'`):** combined pill (see below). In edit mode: "Done" button replaces it.
- **Right (client):** ⋯ dots button (`floatIconBtn`) with green dot badge when `hasTrainingNotes && !trainingNotesViewed`.
- **Right (trainer):** ⋯ dots button (always visible, never fades) — with a **green dot badge** when `hasTrainingNotes && !trainingNotesViewed`. Trainer training notes are accessed from the **⋯ menu** (Training Notes row), matching the client (July 2026) — the old expanded-header (i) button was removed.

**Combined pill** (`combinedPill` style): always visible, not scroll-dependent. Tapping triggers FINISH/START.
- White background (`#fff`), `borderRadius:20, paddingHorizontal:14, paddingVertical:7`, shadow (`shadowOpacity:0.22, shadowRadius:8`)
- Left: timer text (`combinedPillTimerText`: `color:ACCENT, fontWeight:700, fontSize:13, fontVariant:['tabular-nums']`)
- Center: thin separator (`combinedPillSep`: `width:1, height:14, backgroundColor:'rgba(36,172,136,0.35)'`)
- Right: "FINISH" / "START" text (`combinedPillFinishText`: `color:ACCENT, fontWeight:700, fontSize:13`)

**Nav bar background** still has `navBgOpacity` animated view (fades in as user scrolls) but contains only the cover image slice for photo workouts — no dark overlay on top of it.

### Client file — `ListHeaderComponent` (height `HEADER_MAX`, scrolls with content)
- Photo/gradient background fills `StyleSheet.absoluteFill` (with bottom vignette for cover photos)
- **Workout name + session info** (`styles.headerExpanded`): `position:'absolute', left:0, right:0, bottom:0, paddingHorizontal:20, paddingBottom:44, gap:0`
  - Workout name: `headerWorkoutName` — 28px/700 white, `lineHeight:34`. No (i) button. No timer.
  - Session label directly below: `headerSessionLabel` — 13px/500, `rgba(255,255,255,0.65)`. Format: `"Session N · D Mon YYYY"` (or date only for past/free sessions).
- **Rounded BG cap:** `{ position:'absolute', bottom:0, height:26, backgroundColor:'#fff', borderTopLeftRadius:26, borderTopRightRadius:26 }` — rendered BEFORE any other overlay so it appears behind pills.
- **No separate START/FINISH button** in `ListHeaderComponent` — the combined pill in the static nav bar handles this.
- **First exercise card:** receives `marginTop:12` via `getIndex() === 0` in `renderItem` (uses `getIndex` from `RenderItemParams`).

### ⋯ dots menu — `DotsMenuSheet` (client file)
Bottom sheet component using `useSheetDismissGesture`. Rendered conditionally: `{dotsMenuOpen && <DotsMenuSheet ...>}` — mounts fresh each open so spring-in fires each time.

**Content:**
- Workout name (title) + session label (grey, below title)
- **Training Notes** row — tapping sets `notesOpen=true` inside `DotsMenuSheet` (panel stays open); opens `TrainingNotesModal` stacked on top. Green dot in row when `hasTrainingNotes && !trainingNotesViewed`.
- **Muscle Groups** row → sets `subSheet='muscles'`
- **Equipment** row → sets `subSheet='equipment'`
- **Session History** row → calls `onLoadHistory()` then sets `subSheet='history'`
- Category pill (if set)

**Sub-sheets (stacked on top of DotsMenuSheet, not replacing it):**
- `TrainingNotesModal`: uses `useSheetDismissGesture`. Swipe down → `setNotesOpen(false)` → returns to dots panel.
- `SubInfoSheet`: generic component (`title` + `children`) using `useSheetDismissGesture`. Used for Muscle Groups, Equipment, Session History. Swipe down → `setSubSheet(null)` → returns to dots panel. Overlay has `rgba(0,0,0,0.3)` (lighter than main 0.45 to show the dots panel behind).
- Session History item tap: closes both sub-sheet AND dots panel, then navigates to past session.

**Session date/count** previously shown in the nav bar header area is now shown in the DotsMenuSheet below the workout name title.

### Back button behavior — both trainer and client
When the session **has not started**: `router.back()` immediately (no prompt).

When the session **is in progress** (`startedAt` is set): custom `confirmModal`, title "Session in progress" + a **`message`** subtitle ("Leave and the session keeps running in the background — come back anytime to finish it."), with **3 real buttons** (July 2026 — "Keep going" was promoted from a faint `cancelText` link to a proper action button):
- **"Leave — keep it running"** (green filled pill, `primary: true`; reworded from "Leave for now" so it's clear the session keeps running in the background) — saves suspended session to `useSessionStore`, calls `finishSession()` (clears active session tracking), navigates back. The `in_progress` DB session row is NOT deleted.
- **"Discard session"** (red filled pill, `danger: true`) — deletes the `sessions` row, calls `clearSuspendedSession()` + `finishSession()`, navigates back.
- **"Keep going"** (grey `confirmSecondaryBtn` action with a no-op `onPress`, so it renders as a button; tapping outside still dismisses) — closes the modal, stays in the session.

`ConfirmModalState.actions` supports `danger?: boolean` — renders `confirmDangerBtn` (red `#e85d4a` background) instead of the green primary or gray secondary style.

**Confirm-modal card = Apple-style adaptive Liquid Glass (July 2026).** The shared centered `confirmModal` card in **both** Do Mode files (and the free-session-name edit modal — they share the `confirmBox` style) is a **`GlassPanel`** (module-level helper in each file). It uses the **ADAPTIVE `GlassView glassEffectStyle="regular"`** (gated by `isLiquidGlassAvailable()` from `expo-glass-effect`) with a **`BlurView intensity={30}` fallback** off iOS 26. `regular` (not the earlier `"clear"`) is the material Apple's Notification Centre uses — it auto-tints to whatever's behind it, keeps a specular edge, and stays genuinely see-through. Over it sits only a **whisper of white scrim** — `const GLASS_SCRIM_OPACITY = 0.14` (absoluteFill `rgba(255,255,255,0.14)`), the ONE knob for the whole look: **raise toward 0.22** for more legibility/frost, **lower toward 0.06/0** for more transparency. This replaced the earlier `"clear"` glass + heavy `rgba(255,255,255,0.5)` uniform wash, which read as flat milky plastic (Vitek: "not the same as Apple's, and not really see-through"). The card is **borderless** (no white rim — Vitek's call), `borderRadius:38`, wrapped in a `confirmBoxShadow` outer View (soft deep shadow; `confirmBox` itself is `overflow:'hidden'` so it can't hold the shadow). `centeredRoot` overlay dim is `rgba(0,0,0,0.38)`. **Buttons stay FULL colour** (green/red solid + white text) — translucent/tinted-glass buttons were tried and rejected as washed-out. **`confirmSecondaryBtn` ("Keep going") = `#c8c8c2` + `rgba(0,0,0,0.08)` hairline border** with dark `TEXT` label (was `#f0f0ee`): the old near-white pill was invisible on the light glass; the soft grey + border defines it as a button while keeping it subordinate to the green/red, and a light-grey pill also holds up if the glass ever renders dark over a dark background. The `confirmMessage` subtitle is dark (`#33413b`, weight 500) so it reads on the glass. **KNOWN / expected:** `regular` glass adopts the tone of what's directly behind it — over the pale blurred exercise cards the panel reads milky-white (correct, like an Apple sheet over a white list); it looks much more see-through over high-contrast content. **Watch:** title/body are DARK text — if `regular` tints dark over a dark cover image the text could get muddy; the fix would be to bump `GLASS_SCRIM_OPACITY` or flip the text white. **Real Liquid Glass only renders in an iOS-26 build** (Expo Go shows the blur fallback).

### Suspended session — `store/sessionStore.ts`
`SuspendedSession` type (exported):
```ts
{ clientId: string; workoutId: string | null; workoutName: string; startedAt: number; activeSessionId: string | null }
```
`useSessionStore` fields added: `suspendedSession`, `suspendSession(data)`, `clearSuspendedSession()`, `resume(workoutId, startedAt)`.

- `resume()` sets `startedAt` to the **original** timestamp (not `Date.now()`), so the elapsed timer continues from where it was.
- Do mode detects `resumeSessionId` + `resumeStartedAt` URL params on mount: sets `activeSessionId` to the existing DB row and calls `resumeSession()` with the original startedAt. Guards by `resumeAutoStarted` ref.
- Passing params: `/(trainer or client)/workout/${workoutId}?resumeSessionId=${id}&resumeStartedAt=${ts}`

### Exercise cards (Do Mode) — V4 Cards (current, June 2026)

> **⚠️ V1 card design preserved** — the original white-card-per-exercise layout (cardShadowWrap / cardOuter / exerciseCard, marginHorizontal:10, marginBottom:14) is fully backed up in the `SUPERSET_V1_BACKUP` comment block at the top of both Do Mode files.

**Card structure — each exercise (and each superset group) is wrapped in a two-layer card:**
- `exCardOuter`: `{ marginHorizontal:14, marginBottom:10, borderRadius:16, backgroundColor:'#fff', shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.10, shadowRadius:10, elevation:4 }` — holds the shadow (no `overflow:hidden`)
- `exCardInner`: `{ borderRadius:16, overflow:'hidden', backgroundColor:'#fff' }` — clips content to rounded corners
- Background stays white (`#fff`) — shadows alone create the "plastic" lifted look. No background color change.
- Dragging in edit mode: `isActive` applies `{ shadowOpacity:0.22, shadowRadius:14, elevation:8, transform:[{scale:1.02}] }` to the outer wrapper.

**`listData` always groups supersets** — `kind:'group'` items are produced for both normal and edit mode (no `if (!isEditMode)` flat-map branch).

**Collapsed row layout — `collapsedMainRow` (`flexDirection:'row', alignItems:'center', gap:8`):**
- **Left:** numbered chip (`numCircle`, 22×22, `borderRadius:11`, no border). Not done: `backgroundColor:'#f0f0ee'`, grey number (`#aaa`, 10px/600). Done: `backgroundColor:'#24ac88'`, white ✓ (11px/700). Trainer edit mode (`numCircleEditEmpty`): keeps `#f0f0ee` bg + dark-green outline (`borderWidth:1.5, borderColor:'#244e43'`) — becomes selection circle.
- **Center (`flex:1`, `flexDirection:'row', alignItems:'center', gap:0`):** animated drag handle (`width 0→16, marginRight dragHandleGap 0→10`, `useNativeDriver:false`) + name column (`flex:1`):
  - Name row: exercise name only (16px/600) — no `(i)` button here; Info is in the action row
  - `originalExerciseName` label below name if replaced
  - **`gap:0` on the center sub-row** — prevents phantom gap when drag handle is width:0
- **Right:** `MuscleThumb size={40}` — **rendered as a sibling of the expand `TouchableOpacity`, NOT inside it**. This prevents the expand gesture from firing when the thumbnail is tapped. The expand `TouchableOpacity` has `style={{ flex:1, flexDirection:'row', alignItems:'center', gap:8 }}` and wraps only the circle + name column. `MuscleThumb` is the next sibling in `collapsedMainRow`. The chevron row gets its own separate `<TouchableOpacity onPress={onToggleExpand}>` wrapper.
- **Collapsed set summary line** (July 2026) — under the name (only when `!isExpanded`), a compact one-liner of the sets as they sit on the card (`12 × 42kg   ·   8 × 46kg   ·   8 × 50kg   …`, first 3 then `…`) via `buildSetsSummary`, plus a green **name dot** (`nameNoteDot`) for a note newer than the last completed session. See the top "collapsed-set summary + note footer + new-note dot" RESUME note. (Before this the collapsed row was name + silhouette only.)
- **Chevron row** (`cardChevronRow`, `alignItems:'center', paddingTop:6`): below `collapsedMainRow`, inside the expand `TouchableOpacity`. `SymbolView` `chevron.down` (collapsed) / `chevron.up` (expanded), size 11, `#ccc`. Tapping anywhere on the collapsed card expands it (`activeOpacity:0.85` on the outer wrapper). Exercise name is plain non-tappable text (`numberOfLines:1, ellipsizeMode:'tail'`, `flexShrink:1`) — no `TouchableOpacity` wrapper.

**Expanded content** flows directly inside the card (no inner card wrapper). `paddingTop:4` spacer between collapsed header and expanded content. No divider line.
- **Action row** (top of expanded content, before bar/machine selector): **two** `flex:1` Type 2 buttons in a row (`actionBtnRow: flexDirection:'row', gap:8, marginBottom:6, marginTop:6, marginHorizontal:12`):
  - **Play video** — `play.fill` SF Symbol size 12 + label. **Always active** (ACCENT color, never disabled) — taps `onVideoPress` → `navigateToExerciseDetail` → opens `ExerciseVideoOverlay`. Shows black screen with "No media yet" when no media exists.
  - **Info** — `info.circle` SF Symbol size 12 + label. Always active. On press: sets `infoSeen = true` then calls `onOpenInfo` → opens `ExerciseInfoModal`. Shows a 6×6 ACCENT dot badge (`infoDotBadge: position:'absolute', top:5, right:6, borderRadius:3`) when `hasChangeIndicator && !infoSeen`. Dot disappears permanently once the user opens Info. No bounce animation.
  - Button style (`actionBtn`): `flex:1, paddingVertical:9, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, borderWidth:1.5, borderColor:ACCENT`. No disabled variant needed for Play video.
  - A thin `height:1, backgroundColor:'#e8e8e4'` divider sits below the action row (`marginHorizontal:12, marginBottom:10`), separating it from the bar selector / sets.
- **Neither `onOpenHistory` nor `onOpenProgress` are props on `ExerciseCard`** — both "See history →" and "See progress →" are accessed only inside `ExerciseInfoModal` (handled internally via `setHistoryOpen` / `setProgressOpen` states).
- **Inside expanded (after action row + divider):** bar/machine selector (if applicable) → "Sets" or "SUPERSET" label → KG/REPS/TOTAL header row → set rows → `addedSetsDivider` if applicable → Add Set/Dropset button → camera button
- **No `colHeaderDivider`** between KG/REPS/TOTAL header and set rows (removed).
- **`addedSetsDivider`**: `{ borderStyle:'dashed', borderTopWidth:1, borderColor:'#ccc', marginHorizontal:12, marginVertical:4 }` — only when `hasAnyOriginalSets` is true

**Drag handles** (`dragHandle`): animate in between circle and name (in the center sub-row). Width 0→16, opacity 0→1, `marginRight dragHandleGap 0→10`. In `SupersetGroupCard` (always edit mode): static, `marginRight:10`.

**Edit-mode DraggableFlatList `contentContainerStyle`**: `paddingBottom: insets.bottom + 90`.

**Edit mode circles (trainer):** `numCircleEditEmpty` (`#f0f0ee` bg + dark-green outline `borderWidth:1.5, borderColor:'#244e43'`) → `editSelCircle` (filled dark-green + white ✓). **Client edit mode:** done/not-done circles unchanged.

### Superset visual (current — V4)

- **`listData` groups supersets** in both modes → `kind:'group'` items in `DisplayItem`. All superset exercises share one `exCardOuter/exCardInner` card wrapper.
- **Normal mode group card:**
  - `ssGroupHeader` (`flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingTop:10, paddingBottom:4`): "SUPERSET" label as a `TouchableOpacity` (`hitSlop:8, activeOpacity:0.85`). Three visual states: normal `ssLabelText` / pulsing `<LiveSupersetLabel />` / dimmed `[ssLabelText, ssLabelTextPaused]` (`opacity:0.35`). State determined by `liveGroupIdsTriggered` + `liveGroupIds`.
  - Each member rendered via `ExerciseCard` with `isInsideGroupCard={true}`.
  - `ssInCardConnector` (`height:20, alignItems:'center', justifyContent:'center'`): centered "+" (`SymbolView name="plus"`, size 14, `#244e43`) between members, not after last.
- **Edit mode group card (`SupersetGroupCard`):** same `ssGroupHeader` at top, drag handles always visible (`marginRight:10`), `ssInCardConnector` "+" between members. No selection circles for client; dark-green selection circles for trainer.
- **No SS badge** on collapsed rows — the shared card header already says "SUPERSET".
- **`LiveSupersetLabel`** component: pulsing `Animated.Text` using `ssLabelText` style, opacity 0.35→1.0 loop (750ms each way, `useNativeDriver:true`). Replaces the old `LivePulseText` / `liveDimmedText` pattern — no "live" text anywhere.

### Do Mode edit mode — action bar (trainer only)
- Bottom action bar slides up (`editBarAnim`, translateY 100→0) when entering edit mode. Slides down on exit.
- Three buttons: **Remove from SS** (active when exactly 1 SS exercise selected) · **Create SS / Add to SS / Break SS** (context-sensitive middle button) · **Delete** (active when any selection).
- **Break SS**: replaces "Create SS" in middle slot when ALL members of a superset are selected. Calls `removeFromSuperset(..., 'dissolve')`.
- **Add to SS**: label used when selection mixes SS + standalone exercises.
- Selection cleared on exit. `selectedExerciseIds: Set<string>` state in parent component.
- **V1 card backup** at top of both files: `SUPERSET_V1_BACKUP` comment preserves the original superset card design with teal borders, frame caps, and per-card shadow wrapping.

### Exercise Info button — `hasChangeIndicator`
`hasChangeIndicator = hasExerciseNotes || movedFromLabel !== null || orderChangeDescription !== null || addedAt !== null`

The exercise `(i)` is **not** on the collapsed name row — it lives as the **Info** button in the action row (trainer and client). When `hasChangeIndicator` is true: a 6×6 ACCENT dot badge appears in the top-right corner of the Info button. The dot disappears as soon as the user taps Info (`infoSeen` local state set on press). No bounce animation. The **CHANGES & HISTORY** section of the info modal shows `addedAt` (first), `orderChangeDescription`, `movedFromLabel` — each with green-tinted `changesLogEntryNew` style and fade-in animation.

**`addedAt` — mid-session add detection:**
- Set in-memory (`addedAt = "Session X · date"`) immediately when an exercise is added mid-session → Info button dot turns on in the same session.
- Persisted across sessions: on load, `wasAddedMidSession = sessCount > 0 && targetSets.length > 0 && targetSets.every(s => s.is_added_during_session)`. If true, `addedAt = "Added · [formatDate(we.created_at)]"`. Relies on `workout_sets.is_added_during_session = true` being set for all sets of a mid-session-added exercise (done in `saveSession`).
- No label shown in the collapsed row — all info is in the Info modal CHANGES section.

### Other Do Mode rules
- **⋯ menu (client):** `DotsMenuSheet` bottom sheet — see dedicated section above. Training notes, Muscle Groups, Equipment, Session History all open as stacked panels. **No (i) button in client header** — training notes indicator is a green dot on the ⋯ button itself.
- **⋯ menu (trainer):** a slide-up **`BottomSheet`** (July 2026 redesign — was a centered modal) with 4 rows: **Training Notes** (first), Muscle Groups, Equipment, Session History. Category pill shown if set. **Training notes are now accessed from the ⋯ menu (July 2026), matching the client** — the old header (i) button was removed. Each row uses `close(() => setXxxOpen(true))` so the ⋯ sheet slides down before the sub-panel opens; a green (`#24ac88`) dot shows on the Training Notes row when `hasTrainingNotes && !trainingNotesViewed`.
  - **Sub-panels all slide up too.** `TrainingNotesModal` and the `InfoSheet` used for Muscle Groups / Equipment / Session History are slide-up sheets (`useSheetDismissGesture` + `KeyboardAvoidingView flex-end`), mirroring the exercise `ExerciseInfoModal` — Training Notes **raises for the keyboard** when typing. Do NOT revert these to centered `styles.centeredRoot`/`InfoSheet visible` modals.
  - **Done returns to the ⋯ menu; swipe/overlay closes everything.** Each sub-panel takes `onClose` (all away — just closes the sub-panel since ⋯ is already down) and `onBack` (`() => { setXxxOpen(false); setDotsMenuOpen(true); }`). The **Done** button calls `dismiss(onBack)` (slides down then reopens ⋯); **swipe-down / tap-outside** call `onClose` (stay closed). This lets the trainer view several sections without re-tapping ⋯. The hook's `dismiss(cb?: unknown)` runs `cb` when it's a function, else the default `onClose` — so `onPress={dismiss}` (passes a press event) still hits the default.
- **No header (i) button (removed July 2026 on both sides).** Trainer note access moved into the ⋯ menu; unread notes are indicated by a **green dot on the ⋯ button** (`position:absolute, top:2, right:2, 8×8, #24ac88`, hairline border) — identical to the client. The `headerInfoBtn*` styles and the `workoutInfoBounceAnim` bounce effect remain in the trainer file as unused dead code.
- **Thumbnail placeholder:** `<LinearGradient colors={['#2a4a3e','#3a7d6b']}...>` with white ▶. Never dashed border.
- **`ExerciseThumbnail` location:** only in the **expanded row** peek button area. Never in the collapsed row — the collapsed row uses `MuscleThumb` instead.
- **START prompt:** no confirmation dialog — tapping START fires immediately. Hard block for checkmark/photo before START still applies. No prompts once in_progress. Exception: past-session repeat shows a weight-choice modal ("Most recent weights" / "Weights from this session").
- **Category:** never shown in header. Only in ⋯ menu modal as info row.
- Import `CATEGORY_COLORS, WorkoutCategory` from `@/lib/workoutCategories`

### ExerciseVideoOverlay (both trainer and client)
The exercise name in the collapsed row is **plain text** — not tappable. Video is opened via the **Play video** button in the expanded action row (always active), which calls `onVideoPress` → `navigateToExerciseDetail` → sets `videoOverlayEx` state. Both trainer and client Do Mode files use identical patterns.

- **`OverlayVideoPlayer`**: wraps `VideoView` with a tap-to-toggle play/pause. `nativeControls={false}`. **Always muted** (`p.muted = true` in player initializer). Shows a play button overlay when paused. Uses `player.addListener('statusChange', ...)` to track playing state. Receives `key={`video-${mediaIdx}`}` so it remounts when switching between media items.
- **`ExerciseVideoOverlay`**: full-screen `Modal` with `animationType="fade"`, black `#000` background. Supports multiple videos and photos in a unified media gallery:
  - `allMedia = [...videoUrls.map(…'video'), ...photoUrls.map(…'photo')]` combined array
  - `mediaIdx` local state; if `allMedia` is empty → "No media yet" italic grey text
  - Current item: `OverlayVideoPlayer` for video, `Image resizeMode="contain"` for photo
  - **Top navigation bar** (shown only when `allMedia.length > 1`): ‹ pill counter `N / total` › — chevrons dimmed at first/last. `📷` prefix in counter for photo items.
  - **Bottom panel**: `LinearGradient transparent → rgba(0,0,0,0.72)` behind panel (height 180px) → grey meta string → exercise name (20px/700, white) → green "Done" pill. **No close/back button — Done only.**
- State: `videoOverlayEx: { exerciseName, muscleGroups, equipment, videoUrls: string[], photoUrls: string[] } | null`. `navigateToExerciseDetail` builds `videoUrls = [ex.videoUrl, ...ex.extraVideoUrls].filter(Boolean)` and `photoUrls = ex.extraPhotoUrls`.
- `SessionExercise` and `LibraryExercise` types include `extraVideoUrls: string[]` and `extraPhotoUrls: string[]`. All exercises queries must include `extra_video_urls, extra_photo_urls`.

### Session photo gallery (peek modal — both trainer and client)
Tapping a session photo thumbnail in the expanded exercise card opens a peek modal.

- **State:** `peekModal: { type: 'photo'; urls: string[]; idx: number; weId: string } | { type: 'video'; url: string } | null` — `weId` is the `workoutExerciseId`, required for delete
- **`onLongPressPhoto` signature:** `(url: string, allUrls: string[], idx: number) => void` — called as `onLongPressPhoto(url, photoUrls, i)` inside ExerciseCard; each call site passes `weId` via closure: `setPeekModal({ type: 'photo', urls: allUrls, idx, weId: ex.workoutExerciseId })`
- **Single photo / video:** plain `peekModalBox` (white, `borderRadius:16`, `width:'90%'`, `aspectRatio:4/3`, `overflow:'hidden'`, centered)
- **Multiple photos:** `peekRow` (`flexDirection:'row', width:'96%'`) wraps: ‹ arrow (`peekArrowBtn` 36px, dimmed at ends) · image box (`flex:1`, same rounded style) · › arrow. `1 / N` pill badge inside image bottom center (`peekIndexBadge`). Arrows are **outside** the image box — never overlaid on top of the photo.
- **Delete button:** `peekDeleteBtn` — `position:'absolute', top:8, right:8, width:30, height:30, borderRadius:15, backgroundColor:'rgba(0,0,0,0.55)'` — inside the image box for both single and multi-photo. `trash` SF Symbol 14px white. On tap: closes peek modal, shows `confirmModal` "Delete photo?" with red "Delete" + "Cancel". `deleteSessionPhoto(photoUrl, weId)` deletes from `session_exercise_photos` by `photo_url`, removes from `session-photos` storage bucket, updates `exercisePhotos` state and calls `notifyPhotosChanged`.

### ExerciseInfoModal — bottom sheet (both trainer and client)
`animationType="none"`, slides up via `useSheetDismissGesture`. Layout:
- Drag handle area (`infoSheetHandleHitArea` with `panHandlers`) → `infoSheetHandle` pill
- Title (exercise name)
- `ScrollView maxHeight: SCREEN_H * 0.55`: meta row, COACHING CUES, trainer notes, client notes, CHANGES log
- Two side-by-side outline buttons (`infoSheetBtnRow`): "See history →" and "See progress →" — these are the **primary access points** for history and progress (no dedicated action-row buttons for these anymore).
- Green Done pill (`centeredModalDoneBtn`) calls `dismissSheet`
- Pressing overlay calls `dismissSheet`
- Props: `workoutId`, `profileId` added (required for `ExerciseProgressSheet`). No `onSeeHistory` prop (handled internally).

### SetHistoryModal — bottom sheet (both trainer and client)
`animationType="none"`, same `useSheetDismissGesture` pattern. `ScrollView maxHeight: SCREEN_H * 0.55`. Done pill calls `dismissSheet`.

### ExerciseProgressSheet — bottom sheet (both trainer and client)
`animationType="none"`, same dismiss pattern. Shows weight progression graph.
- **Data query:** `workout_exercises` (by `exercise_id`) → `session_logs` (by `workout_exercise_id`, non-null `weight_kg`) → `sessions` (completed) → `workouts`. **Trainer file:** filters workouts with `eq('created_by', profileId)`. **Client file:** filters workouts with `eq('client_id', profileId)`. Each graph point: max weight per session+weId key, `isThisWorkout` flag, workout name.
- Filter state: `workoutFilter: WorkoutFilter ('all'|'this')` + `timeRange: TimeRange ('month'|'year'|'all')`. Filter chips rendered in two rows.
- Nested tooltip modal (`tooltipPoint` state) on dot/stat-row tap: date, workout name, weight kg, reps. Fade-in modal, tapping outside dismisses.
- Renders `ProgressionGraph` + `GraphStats` below filters.

### ProgressionGraph (both trainer and client)
SVG line chart using `react-native-svg` (imports: `Circle`, `Line as SvgLine`, `Polyline as SvgPolyline`, `Text as SvgLabel`, `Fragment` from react).
- `processGraphPoints()` groups/filters raw `GraphPoint[]` by workoutFilter+timeRange.
- Best point: larger dot (r=6), white stroke (sw=2), label above.
- Other points: r=4, 55% opacity, no stroke.
- Dashed horizontal grid lines, y-axis labels, x-axis labels at first/middle/last indices.
- Invisible tap-circle (r=16) over each dot for touch handling.

### GraphStats (both trainer and client)
`computeStats()` finds best/lowest for `thisWorkout` + `all`. Renders `StatRow` components with ↑/↓ arrow circles, label, weight+date. Tapping a row fires `onStatPress` → tooltip modal.

### useSheetDismissGesture(onClose) — shared hook (both trainer and client)
Defined at module level (not inside Screen). `SHEET_OFF_SCREEN = 900`.
- On mount: spring `translateY` from 900→0 (`tension:70, friction:12`).
- `dismiss()`: timing 900 in 220ms, then calls `onClose`.
- `PanResponder`: `onMoveShouldSetPanResponder: true`. On move: if `dy > 0`, set `translateY = dy`. On release: if `dy > 80 || vy > 0.5` → dismiss; else spring back (`tension:150, friction:8`).
- Returns `{ translateY, panHandlers, dismiss }`.
- Used by: `ExerciseInfoModal`, `SetHistoryModal`, `ExerciseProgressSheet` (all in both Do Mode files).

### MuscleThumb (`components/MuscleThumb.tsx`)

Shared component used in the collapsed exercise row in both Do Mode files — rendered at the **far right** of `collapsedMainRow`. `ExerciseThumbnail` remains in the expanded row only.

- **Props:** `muscleGroups: string[]`, `secondaryMuscleGroups?: string[]`, `size?: number` (default 54)
- **Primary muscles:** `intensity: 2` (full ACCENT `#24ac88`). **Secondary muscles:** `intensity: 1` (light `#b8ede0`).
- **Thumbnail:** single zoomed view. Side (front/back) and vertical focus area determined by `getThumbFocus` — uses the **first recognised primary muscle group** in the list. Body rendered at `scale = size/100`, positioned with `top = size/2 − yFocus × bodyHeight`, `left = −size/2`. Default: front, yFocus 0.35.
- **Tap target:** uses `TouchableOpacity` from **`react-native-gesture-handler`** (`GHTouchableOpacity`) — required because MuscleThumb lives inside a `DraggableFlatList` (RNGH context); standard RN touchables are blocked by the RNGH gesture handler. `hitSlop={{ top:10, bottom:10, left:10, right:10 }}`.
- **Muscle names** match the exact strings from `add-exercise.tsx` picker (case-insensitive). Key mappings and their side:
  - **Front:** Upper/Mid/Lower Chest · Front Delts · Lateral Delts · Shoulders · Biceps · Upper/Lower Abs · Core · Obliques · Forearms · Quads · Adductors
  - **Back:** Upper Traps · Mid Traps / Middle Back · Lats · Rear Delts · Lower Back · Triceps · Glutes · Hamstrings · Abductors · Calves
  - yFocus values: chest ~0.23–0.26 · delts/traps 0.22 · lats 0.28 · back 0.32 · biceps/triceps 0.30 · forearms 0.35 · abs/core/obliques 0.37–0.43 · lower back 0.42 · glutes 0.52 · adductors/abductors 0.58 · quads/hamstrings 0.62 · calves 0.78
- **No outer border** on the thumbnail container.
- **Single tap** → white centered modal (`animationType="fade"`, dimmed overlay `rgba(0,0,0,0.45)`). Card: `width: screenWidth−48, paddingHorizontal:16, borderRadius:16`. Modal layout (top to bottom):
  - **Muscle labels:** primary muscles joined by ` · ` (15px/700, ACCENT `#24ac88`) · secondary muscles joined by ` · ` (12px, `#999`, only if present). Both centered.
  - **Body silhouette:** single large side (the primary side from `getThumbFocus`), fills card width. `bodyScale = availWidth/200` capped at `screenHeight*0.56/400`. Centered via `alignItems:'center'`.
  - **Flip button:** `arrow.triangle.2.circlepath` SF Symbol (18px, `#244e43`) + "See back" / "See front" label (13px/600, `#244e43`). Tapping animates `scaleX` 1→0 (150ms), switches `activeSide` state, then animates 0→1 (150ms) — simulates body spinning on vertical axis. `activeSide` initialised to the primary side each time the modal opens.
  - Tap outside overlay to dismiss.

### Do Mode finish navigation
On `saveSession` completion (in both `app/(trainer)/client/[id]/workout/[workoutId].tsx` and `app/(client)/workout/[workoutId].tsx`):
- `isStretchSessionRef.current` is set on load: `true` when the workout's `category` is in `['Upper body stretching', 'Lower body stretching', 'Full body stretching']`
- If `isStretchSessionRef.current` → `router.replace` to `stretch-complete` (passing `clientId` / `clientName`)
- Otherwise → `router.replace` to `session-complete` (passing `sessionId`, `workoutId`, `clientName`, `sessionNumber`, `durationSeconds`, `exercisesDone`, `exercisesTotal`)
- Stretch sessions skip the `sessions_used` package increment (guarded by `if (!isStretchSessionRef.current)`)
- Trainer path: `/(trainer)/client/[id]/workout/session-complete` · Client path: `/(client)/workout/session-complete`
- Free sessions pass `workoutId='free'` — no stretch card shown on Session Complete for free sessions

### Session Complete (`components/SessionCompleteScreen.tsx`)
- Shared component; rendered by both trainer and client route files
- Fetches: today's session logs, previous session logs (same workout), all-time logs for PB check, stretch workout lookup, existing `sessions.client_notes`
- **Scroll indicator:** `Animated` bouncing dark-green circle with chevron — visible when content is scrollable, disappears when near bottom. Uses `onContentSizeChange` + `onLayout` + `onScroll` (threshold 40px).
- **Empty state card:** shown when `pbs`, `improvements`, and `regressions` are all empty. Same `s.card` style as other cards. Text: "Consistency is the foundation. Keep showing up — that's how progress is made." Style: `emptyStateText` — italic, `color:'#3a7d6b'`, `fontSize:14`, `lineHeight:22`, `padding:16`.
- **Stretch card:** shown when `workoutId !== 'free'` AND the workout has `stretch_type` set AND a workout with matching `stretch_type` + stretching category exists for this client — regardless of whether there is any performance data. Tapping → `router.push` to that workout's Do Mode.
- **Session note card:** always shown at the bottom of the scroll content (after stretch card). Label "SESSION NOTES", multiline `TextInput`, pre-populated from `sessions.client_notes`. On Done, saves to `sessions.client_notes` (UPDATE, only if changed; stores `null` when empty). Style: `noteCard` white card, `noteLabel` 11px/700 muted, `noteInput` 15px/22 lineHeight, `minHeight:80`.
- **"Last done" exclusion:** stretch sessions are excluded from `lastSess` in `lib/clientTraining.ts` and from the "Last Session Highlights" queries in both trainer and client training tabs.

---

## 6. Exercise Slot Tracking

- Before first completed session: silent edits, no tracking, no labels
- After first completed session: all deviations tracked with dates and session numbers
- Auto order tracking: `slot_order_history` with `is_permanent=false`
- Deliberate drag reorder: `is_permanent=true`, update `slot_number` and `order_index`

---

## 7. Exercise Detail Screen

### Header
- **Background:** white (`#fff`) — NOT dark green. `SafeAreaView` and `root` both use `#fff`.
- **Back chevron:** `tintColor={DARK_GREEN}` (dark, not white)
- **Exercise name:** `color: TEXT` (dark)
- **Session timer:** bare `<Text>` only — no pill/chip wrapper, no icon. Style: `fontSize:12, marginLeft:8, color:'#555', fontVariant:['tabular-nums']`. `marginLeft:8` keeps it away from the back arrow.
- **START pill:** `backgroundColor: ACCENT, borderRadius:20, paddingHorizontal:14, paddingVertical:8`, text `color:'#fff', fontWeight:'700', fontSize:13` — identical to Do Mode `startBtnGreen`
- **FINISH pill:** same style as START (ACCENT bg, white text)
- **(i) button:** 15×15 outline circle right of exercise name (`headerNoteBtnCircle`: `borderWidth:1.5, borderColor:'#ccc', backgroundColor:transparent`). Active when `hasNotes`: border + text turn ACCENT (`headerNoteBtnCircleActive: { borderColor: ACCENT }`, `headerNoteBtnTextActive: { color: ACCENT }`). Never filled — same style as the exercise (i) button in Do Mode. Bounce animation: `noteBtnBounceAnim` springs to 1.35× on first visit when notes are present (`noteBtnBounceFiredRef` prevents re-firing); reset on `currentIdx` change.

### Card pattern (sets, graph, muscle diagram)
- Each content card uses a **shadow wrapper + inner card** pattern — `overflow:'hidden'` clips iOS shadows so they must be separated:
  - `sectionCardWrap`: `{ marginHorizontal:12, marginTop:12, borderRadius:16, backgroundColor:'#fff', shadowColor:'#000', shadowOffset:{width:0,height:3}, shadowOpacity:0.10, shadowRadius:8, elevation:4 }` — outer wrapper, no overflow
  - `sectionCard`: `{ backgroundColor:'#fff', borderRadius:16, borderWidth:1.5, borderColor:'#d0d0cc', overflow:'hidden' }` — inner card, clips content. No margin.
  - JSX: `<View style={styles.sectionCardWrap}><View style={styles.sectionCard}>…</View></View>`

### Other rules
- Hard block modal: custom white centered modal (state: `hardBlockModal`) — NOT Alert.alert
- Photos bridge: `registerOnPhotosChangedDoMode` and `registerOnPhotosChangedDetail` are independent slots — never share one registration
- `notifyPhotosChanged` must be called OUTSIDE setState
- `exercisePhotosRef.current = exercisePhotos` assigned synchronously in component body
- `loadPhotos`: queries by `workout_exercise_id IN (all weIds)` with NO session filter. Merge DB+memory with Set dedup.
- Photo thumbnails tappable → white centered modal with `aspectRatio:4/3, overflow:'hidden'`
- Dropset rows can be checkmarked. Set-number press disabled for dropsets.
- Muscle diagram: `react-native-body-highlighter`, `MUSCLE_SLUG_MAP`, separate front/back `<Body>` components

---

## 8. General Rules

- **Category system:** `lib/workoutCategories.ts` — `WorkoutCategory`, `CATEGORY_OPTIONS`, `CATEGORY_COLORS` with `{border, pillBg, pillText}`. Always import — never hardcode. `border` = 3px left stripe on cards, use `alignSelf:'stretch'`.
- **Exercise builder muscle picker:** hierarchical Upper/Lower toggle → group headers → muscle pills. Primary/secondary separate pickers. Selecting as primary removes from secondary. All active pills use `selectPillActive` (ACCENT bg+border) — no separate secondary style. Muscles are stored as the **granular** names from this picker (e.g. `Upper Chest`, `Front Delts`, `Upper Abs`, `Mid Traps / Middle Back`), NOT the group headers.
- **Exercise builder equipment (`EQUIPMENT_OPTIONS` in `app/(trainer)/add-exercise.tsx`):** None · Barbell · Z Bar · Dumbbell · Kettlebell · Machine · Bodyweight · Cable · Resistance Band · TRX.
- **Body-part filter (`lib/exerciseFilters.ts`):** the Library tab and Add-Exercise picker share `filterExercises` + `MUSCLE_FILTER_OPTIONS` (Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Full Body) + `EQUIPMENT_FILTER_OPTIONS` (…Kettlebell, TRX). `MUSCLE_MAP` maps each filter label → the **granular** muscle names the builder now stores **plus** the legacy group names, so both old and new exercises match. The filter tests **primary** `muscle_groups` only. **Whenever the builder muscle picker changes, update `MUSCLE_MAP` too** — otherwise the body-part filter silently matches nothing (this was the exact bug: the map still pointed at old group names like `Chest`/`Shoulders`/`Core`).
- **ExerciseRow muscle tag (both `library.tsx` ExercisesTab and `exercise-library.tsx` picker):** shows the first primary muscle; when `muscle_groups.length > 1`, a muted `+N` (`muscleTagMore` style, `#7fbfae`) sits inside the tag next to the name (e.g. `Upper Chest +2`). `muscleTag` is `flexDirection:'row'`.
- **Workout Builder category picker:** tappable row → white centered modal. None + 9 standard options + "STRETCHING" section separator + 3 stretching categories. Selecting a stretching category auto-sets `stretch_type` and hides the Post-workout stretch toggle.
- **Workout Builder Post-workout stretch selector:** Type 1 segmented switcher (None · Upper · Lower · Full) — shown only when category is NOT a stretching category. Sets `stretch_type` on the workout. File: `app/(trainer)/workout-builder.tsx`, state: `stretchType`.
- **Workout Builder superset drag guard:** dragged item must never land between exercises in same superset. `resolveInsertKey()` snaps to superset start. Apply in both move and release.
- **Strength tab compare picker:** white centered modal (`animationType="fade"`) — NOT bottom sheet. `maxHeight:320` ScrollView.
- **Library Workouts ⋯ → Set Category:** `CategoryPickerModal` (white centered modal). Options: None + 9 standard + "STRETCHING" separator + 3 stretching categories. Updates Supabase + local state immediately.
- **Library Workouts ⋯ → Change Photo:** `expo-image-picker` (16:9, quality 0.85) → `arrayBuffer()` → `workout-covers` bucket (`upsert:true`) → update DB + local state. Trainer only.
- **Library Workouts ⋯ → Post-workout Stretch:** `StretchPickerModal` (white sheet modal). Options: None · Upper body · Lower body · Full body. Sets `stretch_type` on the workout. Only shown for non-stretching-category workouts.
- **Library Workouts ⋯ → Mark as done / Reactivate:** toggles `workouts.status` between `'active'` and `'completed'`. Immediate update, no confirmation. Same option exists in trainer client profile and trainer client all-workouts ⋯ menus.
- **⋯ → View exercises** (trainer client profile `index.tsx`, trainer `all-workouts.tsx`, trainer `routine/[routineId].tsx`): opens `WorkoutExercisesModal`. Always the first option in the menu.
- **Library Workouts search:** filters by `w.name` AND `w.clientName`.
- **Library Workouts filter row** (`WorkoutsTab` in `app/(trainer)/(tabs)/library.tsx`): two dropdown buttons — **Category** (left) + **Client** (right). There is **no Recent/Oldest sort toggle** — it was removed. Sorting is **always most-recent first**: performed workouts newest→oldest (by `lastSessionDate`), then never-done ones newest→oldest (by `createdAt`). The **Client dropdown** button label reads `"All Clients"` when nothing is selected (else the client's first name); its panel lists "All clients" + one pill per client, derived from the loaded workouts (`clientOptions`, no extra query). Opening one dropdown closes the other. Category + Client + search all combine.
- **Library workout card client pill** (`WorkoutLibraryRow`, July 2026): the client's **first name** is shown as a `person.fill` pill (`clientPill`, top-left, `rgba(0,0,0,0.55)` bg) on the cover card — moved out of the subtitle. The **subtitle is now just the last-done date** ("Not yet done" fallback). The same `person.fill` pill is used on the Workouts Library day picker (`add-workout.tsx`) workout cards.
- **Workouts Library picker** (`app/(trainer)/client/[id]/add-workout.tsx`, header title **"Workouts Library"** — renamed from "Add Workout", July 2026): the destination of the "Add workout to this day" option. Query params: `id` (clientId), `date` (the selected day, YYYY-MM-DD). Dark-green header showing "Workouts Library" + the formatted day.
  - **Workouts / Templates sub-tabs** (Type 1 pill switcher at top). **Workouts tab:** Category + Client dropdowns ("All Clients" default) + search; **all workouts across all clients** (`created_by = profile.id`, includes stretching). Client shown as a `person.fill` pill (top-left of the cover card, first name); subtitle is the last-done date ("Not yet done" fallback). **Templates tab:** Category dropdown + search only (no Client filter); lists `workout_templates` (`created_by`) as cover cards with a "TEMPLATE" badge + exercise count. Cover cards are the shared 100px style.
  - **On tap (no longer instant-schedules — opens the builder in edit mode, July 2026):** a **workout** → `router.replace('/(trainer)/workout-builder?clientId=${id}&editWorkoutId=${w.id}&scheduleDate=${date}')`; a **template** → `router.replace('…?clientId=${id}&templateId=${t.id}&scheduleDate=${date}')`. The builder loads it (weights pre-filled from the client's last performance), the trainer reviews/tweaks, and **Save** both saves to the library and schedules a `sessions` row on `date`. `router.replace` (not push) so the builder's post-save `router.back()` returns to the client profile, not this picker. The old `copyWorkoutToClient()` instant-copy path was removed — copying-to-this-client now happens inside the builder's update-in-place-vs-copy logic.
- **Workout cover cards** (Library · All Workouts · Routine detail): `height:100, borderRadius:14, overflow:'hidden'`. Name `fontSize:14, fontWeight:'600', color:'#fff'`. Subtitle `fontSize:10, color:'rgba(255,255,255,0.65)'`. Category pill: `backgroundColor: CATEGORY_COLORS[category].border`, white text 9px/700, `borderRadius:100` — no transparency, no border. ⋯ button: `position:'absolute', top:9, right:10` — **trainer screens only, never on client screens**.
- **Workout Picker:** `app/(trainer)/workout-picker.tsx`. Deep-copies workout into target routine. Query params: `clientId`, `routineId`.
- **Training tab + button (trainer, week strip empty state):** 5 options — Create new workout · Add workout to this day · **Plan a workout** · Continue routine (if activeRoutine) · Start Free Session — white centered modal
- **Plan a workout flow (trainer):** two-step. Step 1: workout picker — 70px cover cards with photo or category gradient; green ✓ badge (20×20 ACCENT circle, top:7, right:7) on workouts already done this week (fetched in parallel with workout list via `sessions` query for current week). Stretching-category workouts excluded. Step 2: schedule — date (‹/›, 1-day steps), "Repeat weekly" custom toggle (ACCENT `#d8d8d4` → ACCENT bg, 42×24 thumb 20×20), DOW pills Mo–Su pre-filled from date's day (selecting a day calls `nextDowFrom` to snap date to that weekday), "End after" Type 1 switcher (No end | Weeks) + stepper (1–52) when Weeks. Save inserts `sessions` rows with `status='scheduled'` at date + i×7 days (No end = 52 occurrences). Calls `onReloadStrip()` after save. All state in `WeekStripCard`; prop `onReloadStrip: () => void` passed from `TrainingTab`.
- **Helper functions for Plan flow (module-level in index.tsx):** `PLAN_DOW_ORDER = [1,2,3,4,5,6,0]` (Mo–Su → JS getDay()), `PLAN_DOW_LABELS`, `addDaysToDateStr(dateStr, n)`, `nextDowFrom(fromDate, jsDow)`, `fmtPlanDate(dateStr)`.
- **Client Training tab + modal:** exactly **two options** — "Log workout" (faded opacity:0.4, non-tappable when `standaloneWorkouts` is empty) and "Log routine" (faded, non-tappable when `!activeRoutine`). No subtitle text. No other options. Title: "Training".
- **Logging a workout for a non-today day (`pendingLogDate` in `store/sessionStore.ts`):** when the client logs from a **selected day that isn't today** (past/other week), the session must be dated to that day — not the current day. Because logging funnels through multiple screens (all-workouts / all-routines / routine detail → session-intro → Do Mode), the picked date is passed via the store rather than URL params. Both "Log workout" and "Log routine" modal handlers call `setPendingLogDate(selectedDate !== todayStr ? selectedDate : null)`. Client Do Mode consumes it once in `createInProgressSession` (`pendingLogDate ?? today`) and clears it; the fallback insert in `saveSession` does the same. **`saveSession`'s UPDATE branch must NOT set `date`** — it would overwrite the creation-time date and jump a past-week log back to the current week (this also preserves the original date for resumed sessions). The Training tab's `useFocusEffect` calls `clearPendingLogDate()` on focus so a backed-out log flow never leaves a stale date that a later "start now" log would pick up.
- **Routine card + button:** 4 options (New Workout / From Workouts / From Template / Start Free Session) — white centered modal

### All Workouts screen — client (`app/(client)/all-workouts.tsx`)
- **Workouts / Stretching tab switcher:** underline style — NOT Type 1 pill. Centered, `gap:32`, 17px/600, `#bbb` inactive, dark text + 2px ACCENT underline active. Same as Body composition / Strength in the Progress tab. Styles: `tabBar / tabItem / tabItemActive / tabText / tabTextActive` in `awStyles`.
- **THIS WEEK label row** (shown only when `weeklyGoal != null`): left "THIS WEEK" (12px/700 `#999` uppercase, `letterSpacing:0.4`), right count e.g. "2" (14px/700 dark; amber `#f5a623` when exceeded) + " / 3" (13px/400 `#999`). `paddingTop:16, marginBottom:12`. No bar, no pip, no message. Component: `WeekProgressBar({ goal, completed })`.
- **fetchWeeklyGoal(clientId):** parallel fetch of `availability_submissions.sessions_wanted` (current week Monday) + `users.weekly_session_goal` fallback + completed session count for the week. Called from `load()` alongside `fetchAllWorkouts`.
- **thisWeekCount field:** `WorkoutRow` has `thisWeekCount: number`. Computed in `fetchAllWorkouts` alongside session data — `thisWeekCountMap: Map<string, number>` counts completed sessions within weekStart–weekEnd per workout ID. Sessions query filters `status='completed'`.
- **Section sorting** (Workouts tab only): `doneList = workouts.filter(w => w.thisWeekCount > 0)` shown first; `restList = workouts.filter(w => w.thisWeekCount === 0)` below. "NOT DONE THIS WEEK" label (`sectionLabel` style: 12px/700 `#aaa` uppercase, `marginTop:6`) between groups — only rendered when both non-empty.
- **Workout card layout (`WorkoutItem`):**
  - **⋯ button:** `position:'absolute', top:8, right:8`, 28×28 dark circle (`rgba(0,0,0,0.55)` bg). Opens `WorkoutExercisesModal`. When `isDone` (archived workout "Done" badge also at top-right), ⋯ shifts to `right:52`.
  - **Done-this-week badge:** 16×16 green circle (`#24ac88`), `fontSize:9` ✓ text. Rendered **inline in the name row** (`nameRow: flexDirection:'row', alignItems:'center', gap:6`) immediately to the right of the workout name text. Not shown when `status='completed'`.
  - **Bottom row:** `[bottomLeft flex:1 (nameRow + subtitle)] [catPill]`. `alignItems:'center'`.
  - **"Done" archived badge:** `position:'absolute', top:8, right:8`, text "Done" — only when `status='completed'`.
- **⋯ quick-look:** tapping ⋯ sets `quickLookWorkout: {id, name}` state → renders `WorkoutExercisesModal` at screen level.

### All Routines screen — client (`app/(client)/all-routines.tsx`)
- **THIS WEEK label row:** same `WeekProgressBar` component and `fetchWeeklyGoal` helper as all-workouts. No section sorting for routines.
- **⋯ quick-look on routine cards:** small ⋯ button (`rcStyles.menuBtn: position:'absolute', top:8, right:8, padding:6`) on each `RoutineCard`. Tapping opens `RoutineQuickLookModal` — white centered modal fetching workouts for that routine (`workouts` table filtered by `routine_id`) with exercise counts per workout (from `workout_exercises`). Shows workout name + "N exercises" per row. Done pill closes.
- **All Routines screen:** Active/Closed segmented tab at top — Active shows `status='active'`, Closed shows `status='closed'`. Closed routine cards show `D.M.YYYY – D.M.YYYY` date range as subtitle. Trainer ⋯ menu shows "Deactivate" for active routines and "Reactivate" for closed routines. Both use custom `confirmModal` pattern.
- **Routine status_history:** append-only JSONB array on `routines` table (`status_history JSONB NOT NULL DEFAULT '[]'`). On deactivate: fetch current array, append `{status:'closed', at: now}`, update + set `closed_at`. On reactivate: append `{status:'active', at: now}`, update — do NOT clear `closed_at` (it is the fallback for period reconstruction).
- **Routine detail (i) button:** Semi-transparent white circle (18×18px, `backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.3)'`) next to routine name in header. Opens white centered modal showing full activation history from `buildPeriods(created_at, status_history, closed_at)`. Oldest period first. Green dot = open period (to: null), gray dot = closed period. Files: `app/(trainer)/client/[id]/routine/[routineId].tsx` and `app/(client)/routine/[routineId].tsx`.
- **Routine detail program order display:** Above the workout sections, a row shows "PROGRAM ORDER" label (11px, 700, `#888`, uppercase) then two rows matching the routine card style: (1) `stripsRow` — one colored `strip` per workout (`flex:1, height:4, borderRadius:2`, `backgroundColor: CATEGORY_COLORS[category].border ?? '#888'`); full opacity if done/next/cycleJustCompleted, 0.4 otherwise. (2) `labelsRow` — one `labelCell` per workout: truncated name (max 9 chars + …, 10px, `#666`) + statusChar (→ for NEXT UP, ✓ for done, — for not started, 10px/600; ACCENT when active/done, `#ccc` when pending). When `cycleJustCompleted`: all strips full opacity, all statusChar = `'✓'` ACCENT. `cycleRow` has `marginBottom:12` for breathing room below. Trainer only: "Edit" text link (ACCENT, 12px/600) top-right of header row opens the reorder modal. Styles: `secStyles.cycleRow / cycleHeader / cycleLabel / cycleEdit / stripsRow / strip / labelsRow / labelCell / labelText / statusChar`.
- **Routine detail reorder modal (trainer only):** White centered modal. Each row: colored dot (10×10, category border color) + workout name (15px/500) + up ▲ / down ▼ `chevron.up/down` buttons (gap:14). Top item disables ▲; bottom item disables ▼. "Save Order" green pill (`borderRadius:100, ACCENT bg`) saves new `order_index` values via `Promise.all` Supabase updates + updates local state. Cancel text link below. Styles: `reorderStyles.row / dot / name / arrowBtns / saveBtn / saveBtnText`. Files: trainer `app/(trainer)/client/[id]/routine/[routineId].tsx` only — client has no Edit/reorder.
- **Routine detail cycle detection:** Sessions are fetched with `status='completed'` filter, sorted ascending by date+created_at. Walk through all sessions; track which workouts are done in `currentCycleDone` Set. When `currentCycleDone.size === totalWorkouts` → cycle complete, reset Set, set `hasCyclesCompleted=true`. After loop: `cycleJustCompleted = hasCyclesCompleted && currentCycleDone.size === 0`. The `lastDateMap` (workout → most recent date) is populated as sessions are processed (ascending → last write = most recent).
- **Routine detail workout cards:** Sectioned layout — cycle-aware. Never-done in current cycle → NEXT UP / queue. Done in current cycle → COMPLETED with green ✓ badge.
  - **NEXT UP** label + first workout not in `currentCycleDone` (by `order_index`) → remaining queue below (no label) → **COMPLETED** label + workouts in `currentCycleDone` (green ✓ badge inline next to name)
  - When `cycleJustCompleted`: show "Start routine again?" title + "Start with" subtitle, then first workout by `order_index` as a tappable suggestion card (no NEXT UP / COMPLETED sections). `restartHeader / restartTitle / restartSub` styles.
  - When the client does the first workout again: `currentCycleDone = {thatWorkout}`, new cycle begins, layout reverts to normal NEXT UP queue
  - `isDone={true}` only for cards in `completedWorkouts`; always `isDone={false}` for nextUp, queue, and restart suggestion cards
  - Section label style: `fontSize:12, fontWeight:'700', color: HEADER, marginTop:4, marginBottom:2` for NEXT UP; `color:'#bbb', marginTop:16` for COMPLETED.
  - **Workout card layout (both client and trainer routine detail):** `coverCardStyles.menuBtn` at `position:'absolute', top:8, right:8`, 28×28 dark circle. `doneBadge` (15×15 green circle with `checkmark` SF Symbol size 7) rendered **inline in `nameRow`** (right of workout name, left of catPill). `nameRow: flexDirection:'row', alignItems:'center', gap:6`. `itemName` has `flexShrink:1`. Bottom row `alignItems:'center'`.
  - **⋯ button (both client and trainer):** tapping opens `WorkoutExercisesModal`. Trainer ⋯ also has the full menu (Rename / Change Photo / Add to Routine / View exercises / Delete). `WorkoutMenuModal` + `RoutinePickerModal` + `WorkoutExercisesModal` rendered at screen level.
- **Workout Builder conflict prompt:** when saving as "New Routine" and the client already has an active routine → white centered modal before inserting. A client can only have one active routine, so it's now **"Deactivate & continue" (green) / Cancel** only — the old "Keep Both Active" option was removed (July 2026). The Save sheet is closed (`setSaveSheetOpen(false)`) **before** this prompt opens — two stacked native Modals block touches on iOS, which made the prompt unresponsive.
- TypeScript strict mode always
- All user-facing strings in `i18n/en.ts`
- Free sessions: `workout_id=null`, `name=freeSessionNameRef.current`
- Floating assistant button (Phase 2): will be global overlay — never block it with navigation structure

### Nutrition screens

See **[CLAUDE-nutrition.md](CLAUDE-nutrition.md)** for full rules covering:
- Library Nutrition tab (`NutritionTipsTab` + `RecipesTab`)
- Client Food Log (`app/(client)/nutrition/index.tsx`) — CalorieRing, meal sections, calendar picker
- Client Favourites tab (`app/(client)/nutrition/favourites.tsx`) — FullWidthCard, Recipes/Meals/Days lists
- Client Tips tab (`app/(client)/nutrition/tips.tsx`) — HeroCard, strip cards, recommendation detail modal

---

## 9. Schedule Tab (`app/(trainer)/(tabs)/schedule.tsx`)

### Layout
- `s.root` = `backgroundColor: HEADER` (dark green behind status bar). `s.content` = `flex:1, backgroundColor: BG` wraps week strip + grid below the header.
- Header: `SafeAreaView edges={['top']}` + flex row — empty 44px side left · "Schedule" 18px/700 center · 44px side right with plain white `+` (`padding:8, fontSize:24, fontWeight:'300'`).
- Week strip: `borderRadius:16` white card, `margin:12, marginBottom:6`.
- Time grid: `flex:1` white card, `marginHorizontal:12, marginBottom:12, borderRadius:16, overflow:'hidden'`. Internal `ScrollView` is the only scrollable element.

### Week strip
- **Header — two rows:**
  - **Row 1**: week label `fontSize:17, fontWeight:'700', textAlign:'center'`. "This week" on `weekOffset===0`; date range otherwise. `marginBottom:4`.
  - **Row 2** (`flexDirection:'row', justifyContent:'space-between'`): session count in `ACCENT` green (`fontSize:12, fontWeight:'600'`, "No sessions" when zero) left · row with `gap:10` right — **today button** (only when `weekOffset !== 0`: 26×26 `HEADER` circle with today's date number in white; taps to `setWeekOffset(0)` + `setSelectedIdx(todayIdx)`) + **calendar icon** (`SymbolView name="calendar" size:20 tintColor:HEADER`).
- **Day row**: `‹` arrow (18px `#ccc`) · 7 `flex:1` day columns (Mo–Su) · `›` arrow. Each column: day label 10px/500 muted · 28×28 circle (ACCENT when selected, plain when not) · 5px ACCENT dot only when `dotDays.has(ds)`.
- Swipe via PanResponder: threshold 8px horizontal > vertical.
- `dotDays` set built from all non-cancelled appointments in the current week.

### Time grid
- `HOUR_H = 44`, `LABEL_W = 44`. Full 24h: `24 × 44 = 1056px` total.
- **Working hours** `08:00–20:15` (`WORK_START=8, WORK_END_FRAC=20.25`): white `#fff` background rectangle (`position:'absolute', top: 8×44, height: 12.25×44`).
- **Off-hours**: grid content background `#f5f5f3`; hour labels use `#d0d0cc`; lines use `#eaeae8`.
- 25 hour markers (00:00–24:00). Label `fontSize:9` right-aligned in `LABEL_W` column, offset `marginTop:-6` to align with line. 0.5px solid lines at each hour; 0.5px `#f8f8f8` lines at :30.
- On mount: `onLayout` fires once (`initScrollDone` ref), scrolls to `WORK_START × HOUR_H − 8 = 344px`.
- Each hour row has two invisible `TouchableOpacity` halves (top = :00, bottom = :30) that open the new appointment sheet pre-filled.
- **Current time line**: `height:1.5, backgroundColor:'#e85d4a'`, 7×7 dot at left edge. Shown only on today. `nowMinutes` updates every 60s via `setInterval`. `nowY = nowMinutes / 60 × HOUR_H`.

### Appointment cards
- Absolutely positioned: `left: LABEL_W+4, right:8`. `top = parseTimeToMinutes(start_time)/60 × HOUR_H`. `height = max(42, duration/60 × HOUR_H)`.
- Style: `borderRadius:8, borderLeftWidth:3, borderLeftColor: clientColor, backgroundColor: rgba(clientColor, 0.10)`.
- Guests (no `client_id`): always `borderLeftColor:'#f5a623', backgroundColor:'#fdf3e8'`.
- `COLOR_POOL = ['#24ac88','#4a90d9','#9b59b6','#e67e22','#e74c3c','#1abc9c','#3498db','#f39c12']`. Auto-assigned on first appointment save for a client; stored in `client_colors` table.
- Card text: name `fontSize:12, fontWeight:'600'`; `start_time · type` `fontSize:10, color:MUTED`.
- **Confirmed badge**: `checkmark.circle.fill` SF Symbol, size 13, ACCENT green, `position:'absolute', top:4, right:4` — visible when `is_confirmed = true`.
- **Gap indicators**: italic `#ccc` text centered between two consecutive cards when gap ≥ 30 min. Format: "1h free" / "1h 30m free" / "45m free".

### AppointmentCard gesture system
Each card is an `AppointmentCard` component with a single PanResponder handling all four gestures. `onStartShouldSetPanResponder: () => true` captures all card touches. `onPanResponderTerminationRequest` returns `true` for clear vertical scrolls (dy > 15, dy > 2×dx) so the ScrollView can reclaim vertical-only touches.

- **Tap** (dx < 8, dy < 8, no long press) → `onTap` → opens view/confirm/delete sheet
- **Long press** (400ms timer, `Vibration.vibrate(60)`) → `gestureMode = 'longpress'` → `onLongPress(currentDy)` → drag mode
- **Swipe right** (dx > 5 first, dx > dy×1.2, dx > 60 on release) → `gestureMode = 'swipe-right'` → `onConfirm`
- **Swipe left** (dx < -5 first, |dx| > |dy|×1.2, dx < -60 on release) → `gestureMode = 'swipe-left'` → `onDeleteSwipe`

`gestureMode` type: `'none' | 'longpress' | 'swipe-right' | 'swipe-left'`. Long-press timer cancelled on any significant movement (> 8px). `swipeX` Animated.Value follows the card horizontally during swipe (clamped 0–90 right, 0–-80 left), springs back to 0 on release regardless of outcome. Callbacks stored in `cb = useRef({...}); cb.current = {...}` pattern — always fresh, PanResponder closure stays stable.

### Drag to move (day + week view)
- Original card fades to `opacity:0.3` while dragging; the ghost is a persistent overlay in `gridWrap` **outside** the ScrollView (so it survives day-paging), following the finger via an Animated transform.
- **Day-view drag is CONTAINER-owned (July 2026) so it survives day-paging.** The appointment card (`AppointmentCard`) only **initiates** on long-press (`onLongPress(px,py)` → `startDayDrag`) — it no longer owns the move/release. The **day-grid container** (`gStyles.gridWrap`, `{...dayGridPan.panHandlers}`, `ref={dayGridRef}` measured via `measureDayGrid`) owns the gesture: `onMoveShouldSetPanResponderCapture` returns true whenever `dayDraggingRef.current` (steals every move so the drag continues even as cards unmount on page-change), and its move/release call `dayDragCb.current.move/drop`. `dayDragMove(px,py)`: ghost follows the finger (`dayGhostY`, absolute, lifted by card height) + **edge-paging** (finger within 40px of the grid's left/right edge → `changeDay(±1)`, **950ms** debounced with a short `Vibration.vibrate(15)` tick per flip). `dayDragDrop(py)`: 15-min-snap time, drop on the **current** day (`selectedDateRef.current`, which may have changed via edge-paging) → opens the edit sheet (setup-window). The persistent ghost renders in `gridWrap` (outside the ScrollView). A long-press-then-lift with no movement is handled by the card's `onLongPressEnd` (the container never captured). **Planning mirrors this** (`DayApptCard` + `dayGridPan` + `dayGridRef`/`dayMeasure`, `dayDragActiveRef`, `selDayDateRef`). No optimistic DB write; drop always opens the sheet.
- **Week-view cross-day drag (July 2026):** `WeekApptCard` (Schedule) / `PwWeekApptCard` (Planning) add long-press → 2-D drag to the week grid. The parent measures the grid container (`measureInWindow` on `onLayout` → `geomRef {pageX,pageY,width}`), tracks scroll offset, and renders a **ghost** (Animated `translateX/Y` from the finger's `pageX/pageY`) outside the ScrollView. On release: `col = clamp(floor((pageX - gridX - LABEL_W)/colW), 0, 6)` → `weekDates[col]` = new **date**; `contentY = (pageY - gridY) + scrollOffset` → 15-min-snapped **time**. Then it opens the edit sheet pre-filled with the new day + time (`onMoveAppt` / `weekEndDrag` → `setEditAppt` + `setShowNew`). Because the drop opens the sheet (not a direct commit), imprecise column/time is recoverable — the trainer adjusts before saving. The **ghost is lifted its full card height above the finger** (finger at the ghost's bottom edge) so it isn't hidden under the fingertip; the drop math subtracts the same `lift` so the landing matches what's shown.
- **Edit sheet is draft/send-aware:** `save(send)` — for a **new** appt or when **editing a draft**, two buttons "Save & send" (`send=true` → `sent_to_client:true` + notify) / "Save as draft" (`send=false`); for **editing an already-sent** appt (or Block), a single "Save" that updates silently. Notify fires only when `send && client && (!editing || !editing.sent_to_client)`, so moving a sent appt updates the client's calendar without spamming a new notification. Both `schedule.tsx` and `plan-week.tsx` sheets share this logic (Planning's sheet gained an `editing` prop + a `notes` column in its query/type so drag-editing preserves notes).

### Confirm appointment
- **Swipe right** or **"Confirm appointment" button** in view sheet → `handleConfirmAppt(appt)`.
- Toggles `is_confirmed`. Optimistic update to both `appointments` state and `viewAppt` state (so the open sheet re-renders immediately).
- When confirming (`newConfirmed = true`) for a registered client (`client_id` non-null): inserts `client_notifications` row `{type:'appointment_confirmed', area:'training', title:'Appointment confirmed', body:'Your [type] on [date] at [time] is confirmed.', reference_id: appt.id}`.
- When un-confirming: updates DB only, no notification.
- **New appointment creation** (`NewAppointmentSheet.save()`, non-block, non-edit): generates `newId = makeUUID()`, inserts appointment with that ID, then inserts `client_notifications` row `{type:'appointment_planned', title:'New appointment scheduled', body:'Your [type] on [date] at [time] has been scheduled.', area:'training', reference_id: newId}`. Client sees it immediately in the kettlebell overlay.
- View sheet button: ACCENT green filled pill ("Confirm appointment") / HEADER dark green filled pill ("✓ Confirmed"). Uses `vw.confirmBtn` / `vw.confirmBtnDone` styles.

### Delete swipe
- `onDeleteSwipe` sets `deleteConfirmAppt` state → white centered modal appears (using existing `pk.modal` style).
- Modal content:
  - Title: "Delete appointment?"
  - If `is_confirmed`: orange warning line — "This appointment was confirmed. The client will be notified about the cancellation." (notification sending is Phase 2 — text shown to trainer only)
  - "This cannot be undone." in muted grey
  - Red filled pill "Delete" + gray "Cancel" text link
- On confirm: delete from Supabase, clear state, `fetchData()`.

### New/edit appointment sheet
- Slides up from bottom via `useSlideSheet` hook (spring in, timing out, PanResponder drag-to-dismiss).
- White background, `borderTopLeftRadius:20, borderTopRightRadius:20`, drag handle at top. Sheet is `position:'absolute', bottom:0` — **do NOT wrap in KeyboardAvoidingView** (causes elevation and positioning bugs).
- **Type switcher**: **PT Session · Nutrition · Block** — Type 1 pill row, `HEADER` bg + white text when active. `trial` and `consultation` are removed from the UI (legacy DB values only). "Nutrition" = `nutritional_advising` in DB.
- **Block type**: label `TextInput` replaces the client field. On save → inserts into `schedule_blocks` table (not `appointments`). end_time derived from start + duration.
- **Client field** (PT Session + Nutrition): tappable row opens white centered modal with scrollable client list. No guest name field for any type.
- **DATE + TIME row** (side by side): DATE tappable → **calendar month-grid picker** (`dp` styles + module-level `monthGrid(date)`; ‹ Month Year ›, Mo–Su, tap a day → sets date + closes; selected = ACCENT circle, today = ACCENT number). Replaced the old raw `YYYY-MM-DD` TextInput (Vitek found it unusable). `pickerMonth` state; the DATE row sets it from the current date on open. **Same picker is used in the Planning sheet** (`plan-week.tsx`). TIME tappable → **combined time picker modal**: START + END TextInputs (auto-calc) + 4 duration preset pills. TIME field displays "HH:MM → HH:MM".
- **Notes** (non-block only): tappable row → white centered modal with multiline `TextInput` + Confirm + Cancel.
- **Save buttons (July 2026):** a **new** PT/Nutrition appointment shows **"Save & send"** (`save(true)` → inserts `sent_to_client:true` + notifies) **and "Save as draft"** (`save(false)` → `sent_to_client:false`, no notification). **Block type and editing keep a single "Save."** Same two-button pattern in the Planning sheet.
- `addMinutes(timeHHMM, mins)` and `minutesBetween(start, end)` helpers defined at module level.

### Drafts on the Schedule tab (July 2026)
- The Schedule tab can now create **drafts** (Save as draft) just like Planning. Draft appointment cards render **dashed + dimmed** in both the day grid (`AppointmentCard`) and week view (`wv.apptCard`), with " · Unsent" appended in the day card. `Appointment` type gained `sent_to_client: boolean` (fetched via `select('*')`).
- **`ViewAppointmentSheet`** is draft-aware: a draft shows an amber "Not sent yet" note + a green **"Send to client"** button (`onSend` → `handleSendAppt`: set `sent_to_client:true`, insert `appointment_planned` notification, refetch) and hides the "Confirm appointment" / "Cancel — client pays" actions (those are for already-sent appts). A sent appt shows the normal Confirm/Cancel actions.

### Monthly calendar — INLINE month view (redesigned July 2026)
- **NOT a modal** — it's an inline third mode of the Schedule content, controlled by `showCalModal`. The app header (`TrainerLogoButton` · "Schedule" · +) stays; only the area **inside `s.content`** swaps: `{showCalModal ? <month view> : <normal week strip + grid>}` (a ternary right inside `s.content`). This avoided the modal safe-area problem (`SafeAreaView` gives zero insets inside a RN Modal) AND the "too big / bottom dead space" of a full-screen version — the grid fills the smaller `s.content`, so `flex:1` rows are naturally the right size.
- **Month bar** (`cal.monthBar`, light/CARD, replaces the week strip): **X** (left, `setShowCalModal(false)`) · centered **‹ full-month + year ›** month nav (`MONTHS_FULL`, `changeCalMonth`) · empty right. Then Mo–Su labels, then the grid (`cal.grid` `flex:1`, no ScrollView).
- Each `cal.weekRow` is **`flex:1`** (fills `s.content` evenly). Day cells (`overflow:'hidden'`) show the day's appointments as small solid colour chips (client first name, `getApptColor` bg + `chipTextColor` luminance helper; **drafts at 0.5 opacity**), up to **4**, then a `+N more` line; hairline borders; today's number in an ACCENT circle.
- Tapping a day → `onCalDayTap` (weekOffset via `getWeekOffsetForDate` + `selectedIdx`) → sets `showCalModal=false` and jumps to that day's Day view. **It resets `initScrollDone.current = false`** so the remounting day grid re-scrolls to the working-hours start (08:00) instead of 00:00. The **X** returns to the week/day view.
- `loadCalModal(year, month)` fetches the month's appointments (`select('*')`, non-cancelled, ordered by `start_time`) grouped into **`calModalDays: Record<string, Appointment[]>`**. Re-fetches on `changeCalMonth`.

### Automatic session counting
- Edge function `count-completed-sessions` deployed (v2). pg_cron job ID 1 runs every 15 minutes. Its query filters `status='scheduled' AND type='pt_session' AND sent_to_client = true AND client_id NOT NULL` — **draft (unsent) Planning appointments are skipped** so they never auto-complete or consume a package session.
- **Do NOT add `sessions_used` increment to `saveSession` in Do Mode** — it was intentionally removed. Session package counting is handled entirely by the edge function via completed appointments.
- **Exception:** `cancelled_charged` action (trainer manually cancels but charges) DOES increment `sessions_used` immediately via `handleCancelCharged` in schedule.tsx — this is intentional and separate from the edge function.

### Day / Week view — no toggle, calendar-style attached day header (redesigned July 2026)
- **There is NO Day/Week toggle button** (the old `vm.switcherRow` was removed). The **attached day header** (`ah` StyleSheet, Google-calendar style) is the control: **`selectedIdx: number | null`** — a number → that day's **Day view** (single-column grid, `gStyles.gridWrap`, `HOUR_H = 44`); `null` → **Week view**. Defaults to today's index.
- **Layout order:** `ws.card` (an **edge-to-edge white info bar — NOT a floating card** any more; just `paddingHorizontal:16, paddingVertical:10`, no margin/radius/shadow — holds the tappable week-range title + session count + today/calendar/pencil icons, **no day circles**) → `ah.header` (edge-to-edge Mo–Su day header, a `LABEL_W`-wide leading gutter + 7 `flex:1` cells) → the grid (edge-to-edge, fills to bottom). Everything from under the dark app header down to the grid is **one continuous white surface** (the `#edede9` `s.content` bg is fully covered) — Vitek didn't want a small card sitting alone on grey.
- **`ah.header` cells** = weekday label + a **30×30 circle** around the date number (`ah.numWrapSel` ACCENT fill + white number when selected; ACCENT number when today-not-selected) + an ACCENT dot below days with appointments (`dotDays`). `onPress` → `setSelectedIdx(isSel ? null : i)` (tap a day → Day view; tap the selected day again → Week view). Swipeable (`stripPan`). The week-range **title in `ws.card` is also tappable** → `setSelectedIdx(null)`; it carries a **grey underline** (`ws.titleBtn` + `ws.rangeText` `borderBottomWidth:2 #cecec8`) as a tap affordance that turns ACCENT (`ws.rangeTextActive`) in week view — not just a colour swap.
- Anywhere `selectedIdx` is read as a number (e.g. `selectedDate`), use the `selIdx = selectedIdx ?? 0` fallback.
- **Week navigation is swipe-only** — the strip `‹ ›` arrows were removed. **Two SEPARATE PanResponder instances** (`cardPan` on `ws.card`, `headerPan` on `ah.header`) built from a `makeWeekSwipe()` factory. **Never share one PanResponder instance across two views** — the gesture state bleeds between them (this was a Planning bug: `infoBarPan`/`weekHeaderPan` now separate; Planning's `weekDates` is also a pure `getWeekDates(param, offset)` with no memo). **Swipe direction uses `g.moveX - g.x0`, NOT `g.dx`** — after an `onMoveShouldSetPanResponder` grant, `gestureState.dx` is unreliable (every swipe read as one direction / "always went back"). Today button + calendar + pencil icons remain in the info card.
- **Day-view paging (swipe left/right to change the day):** the same `dayGridPan` container responder that owns the drag also pages when NOT dragging — on release, `dx = moveX - x0` (>24px) → `changeDay(±1)` (wraps across weeks via `setWeekOffset` + `setSelectedIdx`). Direction uses `moveX - x0` (not `dx`). **This supersedes the Schedule day-card swipe-confirm/swipe-delete** — Confirm / Cancel-charged / Delete stay in the appointment view sheet. Cross-day moves work both by **edge-paging during a day-view drag** (above) and by the **week-view drag**.
- **Both grids are edge-to-edge** (no rounded card / margins): `gStyles.gridWrap` and `wv.container` are now `flex:1` white, so they sit flush under the attached header. `WEEK_LABEL_W = 44` (= `LABEL_W`) so **week-view columns align exactly with the attached header cells** and the day grid.
- **Header + grid styling:** `ah.header` is **white** with a single darker underline (`HDR_UNDERLINE #c4c4be`, `borderBottomWidth:1`), no grey fill, no vertical cell dividers. Grid lines/labels use the shared darker constants `GRID_LINE #d3d3cd` (hour + column lines), `GRID_HALF #e6e6e0` (30-min lines), `GRID_LABEL #8a8a8a` (hour labels) across both the day grid (`gStyles`) and week view (`wv`) — the old `#f0f0ee`/`#bbb` were too faint. Same constants/treatment as Plan Week.
- **Week view** (`WeekView` component): **7 columns Mon–Sun** (`weekDates.slice(0,7)`, column border `colIdx < 6`). Its own internal day header was removed — the attached `ah.header` is the single Mo–Su labels row. `WEEK_HOUR_H = 44px`, off-hours `#f5f5f3` / working `#fff`, appointment + block cards as tiny absolute chips, now-line on today's column, tap a cell → `NewAppointmentSheet`. (Unused `wv.headerRow`/`headerCell`/… and `ws.dayCircle`/`daysRow`/… styles are left in place.)

### Schedule blocks (personal time blocks)
- `schedule_blocks` table: `trainer_id, date, start_time, end_time, label`.
- Fetched alongside appointments in `fetchData` for the current week.
- **Day view**: grey cards (`backgroundColor:'#f0f0ee', borderLeftColor:'#bbb'`). Tap → white centered modal showing label + time + single Delete button.
- **Week view**: same grey chips.
- **Delete confirmation**: custom `confirmModal` pattern (`deleteConfirmBlock` state). `dotDays` includes block dates.
- **Block type in sheet**: selecting "Block" in type switcher replaces client field with label TextInput. Saves to `schedule_blocks`, NOT `appointments`.

### Week strip labels
- `weekOffset === -1` → "Last week", `=== 0` → "This week", `=== 1` → "Next week", all others → date range (e.g. "15–21 Jun").
- Pencil icon (`SymbolView name="square.and.pencil"` size 20, `style={{ marginTop:-2 }}` to optically align with the calendar icon) in week strip header row → `router.push('/(trainer)/plan-week?weekStart=...')`. Replaced the former `sparkles` icon.
- **`date` URL param:** `useLocalSearchParams<{ date?: string }>()` — a `useEffect` on `paramDate` computes the week offset from that date's Monday and sets `selectedIdx` to the day, jumping the grid to that exact week + day. Used by the trainer client-profile "THIS WEEK'S SESSIONS" card (`/(trainer)/(tabs)/schedule?date=YYYY-MM-DD`). Separate effect from the `weekStart` param handler.

### Availability overlay — removed from Schedule tab
- The availability toggle has been removed from the Schedule tab. Availability is now visible only in the **Plan Week** screen (`app/(trainer)/plan-week.tsx`), which always shows it.
- `NewAppointmentSheet` still accepts `prefillClientId` (used by Plan Week).

### Cancelled_charged appointments
- `appointments.status` CHECK constraint now includes `'cancelled_charged'`
- Visual on trainer grid: `borderLeftColor: '#e85d4a'`, `backgroundColor: '#fdf0f0'`, small "CANCELLED" label in red
- Client-side `Appointment` type also includes `'cancelled_charged'` — shown as cancelled dot on client calendar

### Appointment move requests
- `move_requests` table: `appointment_id, client_id, trainer_id, note, status ('pending'|'actioned')`
- Client submits via the move request modal in the Appointments tab (only for scheduled appointments > 24h away)
- If appointment ≤ 24h away: show WhatsApp link using trainer's `users.phone` value
- Trainer sees pending count as badge on TrainerLogoButton (sum of move_requests + availability_notifications); marks as actioned from the Notifications modal

---

## 10b. Client Availability Screen (`app/(client)/availability.tsx`)

- **No ScrollView on the screen** — prevents gesture conflicts with per-column PanResponders. The grid fills remaining space via `flex:1` on the card.
- **Slot cells use `flex:1`** — no explicit height needed. Slot height measured from slot 0's `onLayout` → `slotHRef`.
- **`pageY` approach for hit-testing** — `locationY` is relative to the touched child cell. Use `e.nativeEvent.pageY - colTopYRef.current[col]` (populated via `measureInWindow` on each column's `onLayout`).
- **Per-column PanResponders** — 5 independent PanResponders (one per day column).
- **Drag direction determines mode** — first `dy ≥ 0` → ADD; `dy < 0` → DELETE. Tap (< 6px) → toggle single slot.
- **25 slots** (08:00–20:30, 30min each). Grid lines only at hour boundaries.
- **Week picker** — `weekOffset` initialised from optional `weekStart` URL param. Minimum 0, no maximum. Week change clears selection + fresh DB load.
- **Recurring slots shortcut** — on load, also fetches `is_recurring=true` slots for this client. If `hasRecurring=true`, shows a white card: "Your usual availability is saved" + two buttons:
  - **"Use same availability"** — fills `selected` from recurring slots → immediately opens save popup
  - **"Change it"** — pre-fills grid with recurring slots, lets user edit
- **Loading existing slots** — fetches `is_recurring=false` slots for `client_id + week_start` (this week's specific slots); also fetches all `is_recurring=true` slots. Existing-slots info note shown when `hasExistingSlots=true`.
- **Save button** → opens a white centered **save popup modal**:
  - "How often do you want to train?" — 1× / 2× / 3× Type 1 pills (default 1×)
  - "Note for Vitek (optional)" — multiline TextInput
  - **"Save for all coming weeks"** (ACCENT filled pill) — if recurring slots already exist → second confirm modal "This week only" / "All coming weeks"; if none → inserts directly as `is_recurring=true`
  - **"Save for this week only"** (ACCENT outline pill)
- **Submit logic** (`doSave(isRecurring: boolean)`):
  - Deletes `is_recurring=false` slots for `client_id + week_start`
  - If `isRecurring=true`: also deletes all `is_recurring=true` slots for this client, **deletes any `is_recurring=false` slots AND `availability_submissions` for future weeks (`week_start > weekStart`)** so an already-customised future week can't keep overriding the new pattern (this was a real bug — a week 2 that had its own saved slots stayed unchanged after "all coming weeks" because its week-specific rows still won in the trainer's `effectiveSlots`), inserts new recurring rows, then also inserts as `is_recurring=false` for the current week
  - Upserts `availability_submissions` (sessions_wanted, note, is_recurring)
  - Upserts `availability_notifications` with `is_update` flag
  - If zero slots: deletes `availability_notifications` for this week
- `slotToTime(slotIdx)`: `08:00 + slotIdx × 30min` → `"HH:MM:00"` string.
- **`getTrainerId()`:** tries `appointments` then `availability_slots` (both `.maybeSingle()`), then falls back to `users` where `role='trainer'` — a brand-new client has no appointments or slots yet, so the fallback prevents the "Could not find trainer" error on first submit. See the single-trainer rule in §1 Scope.

## 10c. Plan Week Screen (`app/(trainer)/plan-week.tsx`)

> **Redesigned July 2026 (Phase 1 done).** Availability is no longer a wall of per-30-min name tags. See the "IN PROGRESS" note at the end for Phase 2/3.

- **Entry**: pencil icon (`SymbolView name="square.and.pencil"`) in the Schedule week strip header row → `router.push('/(trainer)/plan-week?weekStart=YYYY-MM-DD')`.
- **Header**: dark green — **empty left slot** (the old hamburger client-filter was removed; the client strip is now the single client control), title "Plan Week · [Mon DD] – [Sun DD]" centered, `xmark` right → `router.back()`.
- **Grid**: full **7-column (Mon–Sun)**, `HOUR_H = 52px`, uniform white (no off-hours grey shading). Separate left label column (`LABEL_W + 4`). Every cell tappable at :00 and :30 → `NewAppointmentSheet` pre-filled with date + time. Vitek sometimes trains weekends, so Sat/Sun are always shown.
- **Working-hours boundary lines** (`s.workLine`, `rgba(36,78,67,0.4)`, 1.5px): a darker line per day column at **08:00** (start) and at the **end — 20:15**, except **Friday which ends 19:00** (`dow === 5 ? 19*60 : 20*60+15`). `pointerEvents="none"` so taps pass through.
- **`effectiveSlots` (memo)** — fixes the duplicate-name bug: for each client, week-specific slots (`is_recurring=false` for this `week_start`) **override** the recurring pattern; falls back to recurring if none. Deduped by day+time (the client `availability.tsx` `doSave` double-inserts recurring rows as both recurring and non-recurring for the current week, and the query `.or(week_start.eq.X,is_recurring.eq.true)` fetched both).
- **Availability = collapsed initial-chips**, not name tags. `buildDayBlocks()` merges each client's contiguous 30-min slots into ONE block, lane-packs overlapping clients. Each block renders a thin colored vertical **track** (client color, 0.5 opacity, in the left gutter, `left: 2 + lane*4`) + a small **initial chip** (`s.availChip`, client color bg, white letter, `left: 1 + lane*16`). Lanes > 2 render track only (the popup covers everyone). **Initials** = first letter, or 2 letters when two clients this week share a first letter (`initialsMap`). Tap a chip → **"Who's free" popup** (`whoFree` state).
- **Client colors**: `displayColor` memo gives every client a distinct color even before they're booked (persisted `client_colors` first, else next unused `COLOR_POOL` entry). Booking (sheet `save()` and `applyAll`) **persists** that exact color to `client_colors` so it matches the Schedule tab / client profile. `getClientColor` reads `displayColor`.
- **Client summary strip** (`s.summaryWrap`, **white** bg with a bottom border so it separates from the grey day-of-week header): horizontal `ScrollView` of chips, one per client. Each: color dot · first name · **scheduled/requested** count · 💬 (`bubble.left.fill`, AMBER) when the client left a submission note. **Sorted submitters first**, then non-submitters as **muted dashed chips** (`sumChipMuted`, hollow dot `sumDotEmpty`, "—") so the trainer sees **who hasn't submitted availability**. Active (filtered) chip = `HEADER` bg. Tap → client detail popup.
- **Scheduled/requested count** = `bookedCountByClient` (scheduled + completed appts that week) `/` `requestedFor(clientId)`. `requestedFor` = `availability_submissions.sessions_wanted`, else **default 1 whenever the client gave any availability** (requesting availability implies ≥1×), else `null` (→ "—"). Shows `1/2` form; when requested known and `booked >= wanted` the number turns ACCENT green. Data: `availability_submissions` (`sessions_wanted`, `note`) fetched in `load()`.
- **"Who's free" popup** (`whoFree`): white centered modal listing every client whose block overlaps the tapped time — color dot · name · "Free HH:MM–HH:MM · booked/requested booked" · italic note if any · green **Book** pill (prefills `NewAppointmentSheet` with that client + the tapped start time).
- **Client detail popup** (`clientDetail`): color dot + name · "Wants N× this week · M booked" · note box if any · **"Show only this client" / "Show all clients"** filter toggle (`filterClientId`).
- **Consecutive days warning**: amber banner when the same client has availability on two adjacent days (now across all 7) with no appointment yet — **dismissible** via an `xmark` (`warningDismissed`).
- **Suggest schedule** (ACCENT outline) → dashed semi-transparent overlay cards (tap to reject); **Apply all (N)** (ACCENT filled) books all non-rejected as real appointments + `notifyAppointmentPlanned`.
- **Appointment cards** (`s.apptCard`, `left: 6` to clear the availability gutter): colored left border, translucent bg. Block cards grey. Guests AMBER, `cancelled_charged` red.
- **`NewAppointmentSheet`** is identical to schedule.tsx: PT Session · Nutrition · Block, combined time picker, notes modal. Receives `displayColor` as its `colorMap` prop.

### Plan Week — mirrors the Schedule layout, burger client menu + Day view (Phase 2, redesigned July 2026)
- **Same structure as the Schedule tab** (dark header → edge-to-edge white info bar → attached Mo–Su header → grid — one continuous white surface). **Dark header bar:** back **chevron.left** left → `router.back()` · static **"Planning"** title center · empty right slot (the burger was removed — the client menu moved into the info bar).
- **Info bar** (`s.infoBar`, mirrors Schedule's `ws.card` row layout): centered tappable week title (`s.infoTitle` — **"This week" / "Next week" / "Last week"** computed via `weeksFromNow` (displayed Monday vs today's Monday), else the date range; ACCENT `s.infoTitleActive` when `selectedDayIdx === null`) → `setSelectedDayIdx(null)` (week view). Below it, an `s.infoRow` (space-between): **"<N>/<M> scheduled"** count left (`s.infoCount`, ACCENT; `totalScheduled` = Σ `bookedCountByClient` / `totalRequested` = Σ `requestedFor` over all clients) + a **`person.2.fill` icon right** → opens the client menu modal. This mirrors Schedule's "N sessions" (left) + calendar/pencil icons (right).
- **No Day/Week toggle button, no client-pill strip.** There is **only ONE Mo–Su row** (`s.weekHeader`) attached directly on top of the grid (aligned with columns via a `LABEL_W + 4` leading spacer, Google-calendar style). State is **`selectedDayIdx: number | null`** (`null` → week view / all 7 days; a number → that day's Day view). **Defaults to `null`**.
- **Mo–Su header cells are the day selector:** `onPress` → `setSelectedDayIdx(isSel ? null : i)` (tap a day → Day view; tap the selected day again → back to week view). Selected day = an **ACCENT circle** around the date number (`s.weekHeaderNumWrapSel` + white number) — NOT a full dark-green cell (Vitek found the full-cell fill too heavy). Today-not-selected = ACCENT number. In week view no day is highlighted. (Mirrors the Schedule tab's `ah.header` day cells.)
- **Client menu modal** (`cmm` styles, white centered — the burger target): lists each client (submitters first) with a color dot, name, optional note, and **booked / requested** count (`bookedCountByClient` / `requestedFor`, ACCENT when met, "—" when nothing submitted). Tapping a row filters availability to that client (`setFilterClientId`); a "Show all clients" row appears at top when a filter is active. Replaces the old summary strip + client-detail popup as the primary client control.
- **Consecutive-days note lives in the burger, NOT a top banner** (Vitek found the banner annoying). `consecutiveWarnClientIds: Set<string>` marks clients who might land on consecutive days; those rows show a tappable amber `exclamationmark.triangle.fill` next to the name → toggles `warnNoteClient` to reveal an inline amber note ("Might be on consecutive days — check if that works."). The nested icon `TouchableOpacity` captures its own tap so the row's filter action doesn't fire. The old `warningBanner`/`warningDismissed` were removed.
- **Active-filter indicator** (`s.filterBar`, light green, below the header when `filterClientId` set): "Showing <Name> only · Show all ✕" → tap clears the filter.
- **Day header + grid styling:** `s.weekHeader` is **white** with a single darker underline (`HDR_UNDERLINE #c4c4be`, `borderBottomWidth:1`), no grey fill, no vertical cell dividers. Grid lines/labels use the shared darker constants `GRID_LINE #d3d3cd` (hour + column lines), `GRID_HALF #e6e6e0` (30-min lines), `GRID_LABEL #8a8a8a` (hour labels, `fontWeight:500`) — the old very-light `#f0f0ee`/`#bbb` values were too faint to read.
- **Grid conditionals:** `selectedDayIdx === null` → the 7-column week grid (`s.gridOuter`, `HOUR_H = 52`); `selectedDayIdx !== null` → the single-column Day view.
- **Day view** (`dv` StyleSheet): single wide column, taller rows `DAY_HOUR_H = 64`, for `selDate`/`selDow` (from `selDayIdx = selectedDayIdx ?? 0`): hour rows + tap-to-create half-hour cells, working-hours boundary lines (08:00 + day end, Fri 19:00), availability initial-chips (reuses `buildDayBlocks`, left-offset by `LABEL_W`), suggested-appt overlays, appointment cards, block cards, now-line.
- **Drag-to-move** mirrors the Schedule tab's **container-owned day drag** (see §9 "Drag to move"): `DayApptCard` only initiates on long-press (`onLongPress`/`onLongPressEnd`); the `dv.gridWrap` container (`dayGridPan`, `dayGridRef`/`dayMeasure`, `dayDragActiveRef`, `dayGhostY`) owns the gesture with edge-paging, and `dayDragDrop` opens the edit sheet on the current day (`selDayDateRef`). Tapping an appointment opens the **send/delete sheet** (`apptAction`). Uses `DAY_HOUR_H`, a separate `dayScrollRef`/`dayScrollOffsetRef`/`dayInitDone`. No optimistic write — drop always opens the sheet.
- Empty half-hour cell tap → `NewAppointmentSheet` pre-filled with `selDate` + time. Header **"+"** opens the sheet too (prefilled with `selDate` when a day is selected, else `todayStr`).
- **Info bar title has an underline affordance** (`s.infoTitleBtn` + `s.infoTitle` `borderBottomWidth:2` grey `#cecec8`, ACCENT `s.infoTitleActive` when in week view) so it reads as tappable — NOT just a green text-colour swap. Same treatment on the Schedule tab (`ws.titleBtn`/`ws.rangeText`/`ws.rangeTextActive`).
- **Week swipe:** Planning now navigates weeks like Schedule. `weekOffset` state; `weekDates` is a `useMemo` off `baseWeek` (`getWeekDates(weekStartParam)`) + `weekOffset*7`; `weekStartStr` derives from it and `load` deps on it. `stripPan` PanResponder (same as Schedule) is on **`s.infoBar` and `s.weekHeader`** — horizontal swipe changes the week (and clears any pending suggestions).
- **Draft appointments + send flow:** appointments created on Planning default to **drafts** (`sent_to_client: false`, no `notifyAppointmentPlanned`) — a draft the client can't see. **The `NewAppointmentSheet` (header "+", empty-cell tap, who's-free "Book") offers TWO buttons for appointment types: "Save & send" (`save(true)` → `sent_to_client:true` + notify) and "Save as draft" (`save(false)`)**; Block type keeps a single "Save". Suggestions "Apply all" always creates drafts. Draft cards render **dashed + dimmed** (`{ borderWidth:1, borderStyle:'dashed', borderColor: color, opacity:0.6 }`; day view appends " · Unsent" via the `draft` prop on `DayApptCard`). Tapping any appointment (week-grid cards are now `TouchableOpacity`; `DayApptCard.onTap`) opens `apptAction` (`aa` styles): draft → amber "Not sent yet" note + **Send to client** (`sendAppt`) + **Delete** (`deleteDraftAppt`, drafts only); sent → "Sent to client ✓". Bottom bar (`s.bottomRow`): when idle **Suggest schedule** + **Send all (N)** (`sendAllDrafts`, `s.sendAllBtnDim` + `disabled` when `draftCount === 0`); **when suggestions are showing → Discard (`setSuggestions([])`) + Apply all (N)** so there's always a way out. `draftCount` = unsent appts with a `client_id`; guest drafts can only be deleted. **Client side** filters `sent_to_client = true` in all appointment queries (`app/(client)/index.tsx`, `past-sessions.tsx`, `(tabs)/schedule.tsx`); the **`count-completed-sessions` edge function** also filters it so a draft never auto-completes / charges a package. (The trainer Schedule tab still shows drafts as normal cards — not dashed there.)

> **IN PROGRESS — Plan Week redesign, resume here next session:**
> - **Phase 3 (next):** pinch-to-zoom on the grid (adjust `HOUR_H` / `DAY_HOUR_H`).
> Staged rollout — Vitek tests each phase on TestFlight before the next.

### Info tab — Availability Type field
- File: `app/(trainer)/client/[id]/index.tsx` → `AvailabilityTypeField` component at the bottom of the Info tab (before Trainer Notes).
- Three pills: **Fixed** · **Flexible recurring** · **Variable**. Selected = `backgroundColor:'#244e43', color:'#fff'`.
- Description text shown below selected pill. Saves immediately on tap to `users.availability_type` (no Save button needed).
- **Fixed**: "Same slot every week — no availability needed". **Flexible recurring**: "Same general pattern, repeats automatically". **Variable**: "Submits fresh availability each week".

### Info tab — Weekly Session Goal field
- File: `app/(trainer)/client/[id]/index.tsx` → `WeeklySessionGoalField` component, placed immediately after `AvailabilityTypeField` (before Trainer Notes).
- Five pills: **1 · 2 · 3 · 4 · 5**. Selected = `backgroundColor:'#244e43', color:'#fff'`; unselected = `backgroundColor:'#f5f5f3', color:'#999'`.
- Tapping a selected pill deselects it (saves `null`). Saves immediately on tap to `users.weekly_session_goal`.
- Description below pills: "Total sessions per week including solo training".

---

## 11. Finance Tab

- File: `app/(trainer)/(tabs)/finance.tsx`
- Header: VFIcon left · "Finance" center · + green circle right (→ `invoice/new`)
- Invoices/Earnings: **plain UNDERLINE switcher** (`st.mainTab*` — active = accent-green text + 2px accent underline, `fontSize:15`; matches the Library main tabs — July 2026, was the dark-green Type-1 pill). Default: Invoices. Sits in `st.segmentWrapper` right under the `LightHeader` (padded `headerH + 12`). `activeTab` (`'invoices' | 'earnings'`) drives it. The old `segmentBar`/`segmentItem`/`segmentText` styles were removed. *(An intermediate `GlassToggle` version was tried and rejected — Vitek wanted the underline like Library.)*
- **Filters are DROPDOWNS, not pill rows (July 2026, Vitek):** the invoice **status** filter (All/Draft/Sent/Updated/Paid) is now a single **Status dropdown pill** (`invStatusPickerOpen` → `BottomSheet` picker, reusing `st.picker*`) that turns **light-green `ACCENT`** when a specific status is set (the Year pill stays beside it, also green when set). The earnings **time-range** filter is a single **dropdown pill** (`st.rangeDrop` → `rangePickerOpen` `BottomSheet`) over `TIME_RANGE_OPTIONS` = **month / last month / quarter / all time** (`'year'` was dropped from the UI per Vitek; the `TimeRange` type still has it). **Earnings default is `month`** (was `quarter`). The old status-pill row + earnings `pills`/`pill`/`pillActive` styles were removed. Filter-pill **text is black (`TEXT`)** when inactive (was grey `MUTED` — Vitek: "make them black like earnings so they're visible"); active pill text stays white. **Picker `BottomSheet` polish:** title is **centered** (`pickerTitle textAlign:'center'`), the `pickerBox` dropped its nested-card look (no border-radius/shadow — it reads as one white panel with the sheet), and the **last option's divider is removed** (`pickerOptionLast`) so there's no dangling line above the safe-area padding.
- `invFiltersWrap` (bg: BG) wraps search + filter — prevents header color bleed
- Search (pill, white) + **Status dropdown + Year dropdown** (both open a `BottomSheet` picker; see the dropdown note above)
- Invoice list: white card rows, gap:8. Shows: number · client · amount · date · status pill. All pills `minWidth:72` — layout never shifts.
- `filteredInvoices`: useMemo, client-side filter on status + year + search
- **Earnings:** a single **time-range dropdown pill** (`st.rangeDrop` → `BottomSheet`, options month/last month/quarter/all time, default month). Hero dark green card: period · €total · comparison. Stats row: sessions delivered + invoiced amount. Bar chart + per-client breakdown. `CLIENT_COLORS = ['#9b8ec4','#4a9eff','#ef9f27','#24ac88','#e05555','#3a7d6b','#e8763a','#4ac1a4']`
- **Finance data:** session income = `session_packages.price_eur` by `activated_at`. Manual entries = `finance_manual_entries` by year/month from `dateRange.start`. Invoice income = `invoices.gross_amount_eur` where sent/updated in period — stats row only, NOT in bar chart or totalIncome.

---

## 12. Session Packages

- `session_packages`: `package_type TEXT`, `duration_minutes INT`, `price_eur NUMERIC`, `status_closed_early BOOL DEFAULT false`, `expires_at DATE`
- `package_defaults`: 9 rows (3 types × 3 sizes) — pre-fills price in new package modal
- `finance_manual_entries`: `label`, `amount_eur`, `entry_month` (nullable 1–12), `entry_year`, `created_by`
- New package while active: mark existing `completed` first, then insert new `active`
- Close early: `status=completed` AND `status_closed_early=true`
- Session counting in `saveSession`: increment `sessions_used` on active package. If `sessions_used >= total_sessions` → set `status=completed`
- Package validity auto-calculated from activation: 6 sessions → +6 months, 12 → +9 months, 20 → +12 months. Stored in `expires_at`. Editable by trainer. Amber warning when ≤30 days remaining.
- Type buttons in New Package modal: vertical column layout, full-width, `paddingVertical:13`

### Sessions tab — "THIS WEEK'S SESSIONS" card (`SessionsTab` in `app/(trainer)/client/[id]/index.tsx`)
> **Sessions is now a top-level client-profile tab** (Training / **Sessions** / Nutrition / Progress / Info), not a sub-tab of Training. `SessionsTab` is rendered at `activeTab === 'sessions'` with props `clientId, clientName, client, packages, onReload` from `ClientProfileScreen`.
- Replaces the former "NEXT SESSION" card (which used the Google Calendar `calendar-next-session` edge function — no longer used).
- `loadWeekSessions()` queries `appointments` for `client_id` + `status='scheduled'` within the current calendar week (Mon–Sun, computed like the plan-flow week helper), ordered by date then start_time. Stored in `weekSessions: { date; time; type }[]`. Loaded via `useFocusEffect`.
- Renders one **tappable** row per appointment: `fmtWeekApptDay(date)` (Today/Tomorrow/Yesterday/weekday+date) + `HH:MM · apptTypeLabel(type)` subtitle + `chevron.right`. Tapping → `router.push('/(trainer)/(tabs)/schedule?date=YYYY-MM-DD')` (jumps schedule to that week + selects the day). Empty state → "No sessions this week" + muted calendar icon.
- Helpers `apptTypeLabel` and `fmtWeekApptDay` are module-level in `index.tsx`. `formatNextSession` is retained but no longer called.

---

## 13. `lib/clientTraining.ts`

- `fetchClientTraining` filters to **completed sessions only** for all computed values
- Never use `(allSessions??[])[0]` — always filter to `completedSessions` first
- **Active-routine query is `.order('created_at',{ascending:false}).limit(1).maybeSingle()`** — NOT a bare `.maybeSingle()`. `maybeSingle()` throws if more than one row matches, and a client can transiently end up with >1 `status='active'` routine; ordering + `limit(1)` picks the newest and never throws.
- Sessions query: `.order('date',{ascending:false}).order('created_at',{ascending:false})`
- **Cycle detection:** after fetching `completedSessions` descending, reverse to get ascending order, then walk them tracking `cycleDone: Set<string>`. When `cycleDone.size === routineTotal` → reset the set, set `hasCycled=true`. Returns `cycleDoneCount` (current set size) and `cycleJustCompleted` (`hasCycled && size===0`). `nextUpWorkout` is also cycle-aware: first workout by `order_index` not in `cycleDone` (or `sortedByOrder[0]` if `cycleJustCompleted`). `nextUpPosition` remains the 1-indexed position of `nextUpWorkout` in the routine order — used for "Workout X of Y" text, not for ring values.

---

## 14. Account Screen (`app/(trainer)/(tabs)/account.tsx`)

- `trainer_settings` RLS: SELECT/INSERT/UPDATE scoped to `trainer_id = auth.uid()`
- Field modals update local state only via `patchField()` — no DB call per confirm
- Single Save button calls `saveAll()`: parallel upsert of `trainer_settings` + update on `users`. `isDirty` checks both.
- On save: sync saved state, show "✓ Saved" 2s then revert
- **Logo upload:** stubbed — shows Alert. `trainer-assets` bucket exists with INSERT policy.
- Never import `uuid` — use `makeUUID()` helper defined at module level

### Banner photo editor (Account + Info tab)

Both `account.tsx` and `app/(trainer)/client/[id]/index.tsx` (InfoTab) use identical banner editor logic:

- **Upload:** `expo-image-picker` → `client-banners` bucket via `arrayBuffer()`. Resets offsetY=50, zoom=1.0 on new upload.
- **Remove photo:** "Remove photo" red link (`#e85d4a`) appears at the bottom of the banner card when a photo is set. In account.tsx: clears `bannerPhotoUrl` to `''` and `bannerNaturalDims` to `null` — saved as `null` on next Save. In InfoTab: calls `onRemoveBannerPhoto()` which clears parent state (`bannerPhotoUrl → null`, `bannerNaturalDims → null`) — saved as `null` on next Save. Client home screen falls back to the trainer's account banner when the client's `banner_photo_url` is null.
- **Client home fallback + RLS (critical):** the account-tab banner is the default for ALL clients; the client's own `banner_photo_url` (set in the Info tab) overrides it. The `users` SELECT policy is `(id = auth.uid()) OR is_trainer()`, so **a client cannot read the trainer's `users` row** — any `from('users').eq('role','trainer')` query returns null for a logged-in client. The client home (`app/(client)/index.tsx`) must therefore fetch the fallback via `supabase.rpc('get_trainer_banner')` (a `SECURITY DEFINER` function returning only `banner_photo_url, banner_photo_offset_y, banner_photo_zoom`). Never widen the `users` RLS policy to fix trainer-data reads from the client side — it would leak trainer PII; add a narrow `SECURITY DEFINER` RPC instead. The RPC result is untyped (`{}`) — cast it when reading fields.
- **Natural dimensions:** `Image.getSize(url, (w, h) => setNaturalDims({w, h}))` called on load and after upload. `previewContainerW` measured via `onLayout` on the clip container.
- **Rendering:** `baseH = round(naturalH × containerW / naturalW)`. Both dimensions scale uniformly: `imageW = containerW × zoom`, `imageH = max(PREVIEW_HEIGHT, round(baseH × zoom))`. Centered horizontally: `left = -round(containerW × (zoom−1) / 2)`. Uses `resizeMode="stretch"` — no internal cropping.
- **Drag:** RNGH `GestureDetector` + `Gesture.Pan().runOnJS(true).minDistance(0)`. `overflow = max(baseH × zoom − PREVIEW_HEIGHT, 0)`. drag reads `bannerBaseHRef` and `bannerZoomRef` (mutable refs, updated each render).
- **Zoom buttons (−/+):** range 1.0–2.5. Center-preserving: `newOffsetY = clamp(round(offsetY × oldOverflow / newOverflow), 0, 100)` where overflows use `baseH × zoom`.
- **Saved fields:** `banner_photo_url`, `banner_photo_offset_y` (0–100, default 50), `banner_photo_zoom` (1.0–2.5, default 1.0) on the `users` record.
- **VF icon position:** `vf_icon_pos_x` and `vf_icon_pos_y` (both 0.0–1.0 floats) on the `users` record. Draggable in the preview (separate nested `GestureDetector`). Saved alongside banner fields. On the client home screen, read fresh from the client's own `users` row (NOT the trainer's row). **Known limitation:** the preview (220px × ~330px) has a different aspect ratio from the actual hero (~400px × full screen width), so the icon position in the preview does not exactly match where it appears on the client home screen — a known visual discrepancy, not a bug to fix now.

---

## 15. Invoice Screen (`app/(trainer)/invoice/[invoiceId].tsx`)

- Invoice number: `NNN-YYYY`, sequential per year
- `GENERIC_PRESETS`: 9 hardcoded entries, always shown, never replaced by dynamic data
- `calcLeistungszeitraum`: 6er→+6m, 12er→+9m, 20er→+12m. Format: `D.M.YYYY–D.M.YYYY`. Recalcs when issueDate changes.
- Totals order: Nettobetrag → Mehrwertsteuer 19% → **Gesamtbetrag** → **Betrag fällig** (bold, same as gross)
- **Preview button:** `preparePreview()` builds HTML → `expo-file-system` v19 (`File`, `Paths`) → `InvoicePreviewModal`
- **InvoicePreviewModal action buttons:** **Share** (green filled) + **Save to File** (accent outline) — both call `uploadAndMark()` which uploads HTML to `invoices` bucket, sets status to `sent`/`updated`, then calls `Share.share({url:localUri})`. Neither button differs in underlying behaviour.
- **No `expo-print` or `expo-sharing`** — both crash in Expo Go
- Output: HTML (PDF in production build)
- `invoices` bucket: public, INSERT+UPDATE+SELECT for authenticated users
- `invoices` table RLS: trainer ALL (`created_by = auth.uid()`); client SELECT (`client_id = auth.uid()`)
- `trainer_snapshot` + `client_snapshot` saved at finalize time
- "From Package" fills first empty line item in-place
- Trash icon shown when `total > 1 OR item.description.trim().length > 0`. Last item resets to empty row.

### Invoice status flow
- `draft` → bottom bar: Save Draft + Preview
- `sent` / `updated` → bottom bar: **Mark as Paid** (accent outline) + Preview. Mark as Paid opens white centered modal with date input (YYYY-MM-DD, default today) → sets `status='paid'`, `paid_at=selectedDate`
- `paid` → bottom bar: **✓ Paid · [date]** green badge + Preview. `buildPayload` always includes `paid_at`.

### Invoice status pills (Finance tab)
- Draft: grey outline · Sent: accent outline · Updated: amber outline · **Paid: solid green fill**
- All pills `minWidth:72` so layout never shifts between pill sizes

### Client Me tab invoices
- Fetches `status IN ['sent','updated','paid']` — visible as soon as trainer sends
- `sent`/`updated` → amber **"Unpaid"** pill (persistent in-app reminder; push notifications Phase 2)
- `paid` → solid green **"Paid"** pill + "Paid [date]" subtitle

---

## 16. Auth Screens (`app/(auth)/`)

### Password field eye toggle
- All password inputs have a show/hide eye toggle: `SymbolView name={show ? 'eye.slash' : 'eye'} size={20}` (expo-symbols), absolutely positioned `right:14` inside the field, field gets `paddingRight:48`. Files: `login.tsx`, `signup.tsx`, `reset-password.tsx`, and the field modal inside `change-password.tsx` (`showDraft` state, reset to false on `openField`). One `showPassword` toggle can control multiple fields on the same screen (signup, reset).

### Forced first-login password change (`app/change-password.tsx`)
- The gate clients hit when `must_change_password === true` (first login / after a trainer reset). Two tappable rows (New password · Confirm password) → white centered per-field modal (eye toggle) → green "Save password" pill.
- **Header = glass green-tint `LightHeader`** (July 2026 — was a solid dark-green bar). `<LightHeader title="Set your password" />` rendered LAST over the content (no back button — it's a forced gate); root is a plain `View` bg `#faf9f7`, `StatusBar dark-content`, body offset by `useHeaderHeight() + 14` so the card starts below the green wash.
- **`handleSave` MUST route explicitly — do NOT rely on `onAuthStateChange` (July 2026 stuck-spinner fix).** Order: (1) `supabase.auth.updateUser({ password })` (surface any error — e.g. `same_password`), (2) `users.update({ must_change_password: false })`, (3) `await refreshProfile()` then `router.replace('/(client)')`. The old code left `saving=true` and depended on the `onAuthStateChange` callback re-fetching the profile to route away — but that callback runs a Supabase query while `updateUser` still holds the auth lock, which can hang, so the Save spinner spun forever. `refreshProfile()` (from `useAuth`) runs the fetch OUTSIDE the callback (lock already released) and updates the context profile so `_layout.tsx` won't bounce back to this screen; the explicit `router.replace` navigates immediately. **Never revert to the "leave saving=true, let `_layout` route via onAuthStateChange" pattern.**
- Native-ish auth-gate screen → needs a **new build** to reach TestFlight (no hot-patch).

### Forgot / Reset password flow
- **`login.tsx`** "Forgot password?" → `router.push('/(auth)/forgot-password')`. Both `forgot-password` and `reset-password` are registered in `app/(auth)/_layout.tsx`.
- **`forgot-password.tsx`:** email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/reset-password') })` (`redirectTo` = `vitekfitnessapp://reset-password`). Shows a "check your email" confirmation on success. Never reveal whether the account exists.
- **`reset-password.tsx`:** new + confirm password (eye toggle, min 8, must match) → `supabase.auth.updateUser({ password })` → `clearPasswordRecovery()`. Guards with `expired` state when there is no recovery session (`!session`).
- **Recovery deep-link handling lives in `context/AuthContext.tsx`:** the client has `detectSessionInUrl: false`, so a `Linking` listener + `getInitialURL()` parse the recovery tokens from the URL **fragment** (`#access_token=…&refresh_token=…&type=recovery`, via `parseAuthParams`), call `setSession`, and set `passwordRecovery = true`. Context exposes `passwordRecovery` + `clearPasswordRecovery()`.
- **Routing (`app/_layout.tsx`):** `if (passwordRecovery)` forces `/(auth)/reset-password` **before** all session/role routing; `passwordRecovery` is in the effect deps. `signOut()` also clears the flag.
- **External config requirement (not in code):** `vitekfitnessapp://reset-password` (+ `vitekfitnessapp://*`) MUST be in Supabase **Authentication → URL Configuration → Redirect URLs**, or GoTrue ignores `redirectTo` and falls back to the Site URL. App scheme is `vitekfitnessapp` (app.json).
- These changes require a **new build** to reach TestFlight — deep links + auth screens don't hot-patch an installed build.

---

*Read this file and SPEC.md at the start of every session before writing any code.*
