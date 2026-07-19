# CLAUDE.md — Behaviour Rules for Claude Code

Read this file and SPEC.md at the start of every session before writing any code. When working on any nutrition screen, also read CLAUDE-nutrition.md before writing any code.

**Project status: testing phase.** The app is live on TestFlight and Vitek is testing it on a real iPhone. He no longer needs to mention this each session — assume real-device testing is ongoing. Prefer fixes that hold up in a TestFlight build (real navigation, real Supabase data, no dev-only shortcuts).

## Companion docs (read the relevant one before coding that area)

The always-loaded rules below cover scope, permissions, the DB/data layer, the app-wide design system, and general rules. Deeper per-area detail lives in companion files — read the matching one before touching that area:

- **CLAUDE-nutrition.md** — any nutrition screen.
- **CLAUDE-domode.md** — Do Mode (both `workout/[workoutId]` files) + Exercise Detail (§5, §7).
- **CLAUDE-schedule.md** — trainer Schedule tab, client Availability, Plan Week (§9, §10).
- **CLAUDE-screens.md** — per-screen layout: tab bars/headers, profile layout, week strips, gauge, Appointments, Past Sessions, suspended-session indicators, Finance, Packages, Account, Invoice, Auth (§2 per-screen parts + §11, §12, §14, §15, §16).
- **CLAUDE-history.md** — completed/pushed session changelog (context/rationale only, not active instructions).

> **▶️ RESUME HERE — New Do-Mode look rolled out to BOTH sides + client preview to all categories + covers = category-colour-only (July 2026, COMMITTED & PUSHED `0def65f`; device-tested by Vitek).** Typecheck baseline **29**, flag-safe. Full field-level detail: memory files **[[domode_preview_merge]]** and **[[category_palette_and_covers]]**. Reversion reference (pre-redesign code) is in **CLAUDE-domode.md §5 "⏪ Pre-redesign baseline"** (points at GitHub commit `55a40f9`, not inline).
> 1. **Client merged preview — now ALL categories (was Push-only).** Removed the `category === 'Push'` gate in `app/(client)/workout/[workoutId].tsx` (`previewInitRef`) + `session-intro.tsx` (redirect + black-hold). Still launcher-only; View/planned/past stay read-only. Everything else (sliding panel `usePanel`, `previewY`/`previewLock` JS-driver-only lock, keyboard niceties) unchanged — see [[domode_preview_merge]].
> 2. **Trainer Do Mode — the new look ported in (NO preview panel).** Vitek's call: the trainer must edit freely before starting, so `app/(trainer)/client/[id]/workout/[workoutId].tsx` gets the **fixed-header banner** (`FIXED_HEADER`, follows active exercise via `activeHeaderId`/`HeaderPhoto`/`header_focus_y`), **category covers** (banner fallback), and the **keyboard "Done" bar + focused-input auto-scroll + `scrollCardToTop`** — but lands **directly in the editable running-look**, not a preview. The **Start-morph** lives in the header (`timerControl`): before start = expanded glass **[00:00 · START]** pill → on Start it collapses to the **glass stopwatch icon** (running; tap to re-expand to [timer · FINISH]). Old scroll-away header gated behind `!showFixedHeader` (still used for past-session view). KAV disabled (`behavior=undefined`) in favour of the kbHeight approach, matching client.
> 3. **Workout COVER cards = category colour + body-silhouette watermark ONLY, app-wide (NO assigned photo).** Vitek's firm call — the covers must stay branded (that's why we built the palette + watermarks), not show `cover_image_url`. The photo JSX is kept as **dead code behind one flag `WORKOUT_COVER_PHOTOS_ENABLED = false`** exported from `components/CategoryCover.tsx` (flip to true to bring cover photos back). Every cover card gates the photo branch with it: client `train/index.tsx` + `all-workouts.tsx`; trainer `(tabs)/library.tsx` (Workout+Template), `client/[id]/all-workouts.tsx`, `routine/[routineId].tsx`, `add-workout.tsx` (picker), `index.tsx` (plan-picker + week-strip session + day-detail + WorkoutRow — `category` was added to `DayDetail`). **Does NOT affect the Do Mode header**, which intentionally shows the active EXERCISE's photo (`header_focus_y` framing) — that's exercise media, not a workout cover.
> - **Cleanup done:** orphaned `components/SessionStartOverlay.tsx` **deleted**.
> - **Still open:** on-device test of the trainer new-look + client all-category preview; per-category cover crop tuning; the client dead `!showFixedHeader` path + `PROTO_PUSH_PHOTO` still linger behind the flag.

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

> The app-wide **design system** is below. Per-screen layout rules (tab bars, headers, client profile layout, week strips, WeeklyGaugeCard, Appointments tab, Past Sessions, suspended-session indicators) live in **CLAUDE-screens.md**.

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

### SF Symbols — known missing variants
- `calendar.fill` does **not** exist as an SF Symbol — use `calendar` for both focused and unfocused states; the active tint color provides the visual distinction. Never use `calendar.fill`.

### Cards — BORDERLESS + soft shadow (app-wide, both trainer AND client, July 2026)
Across the **entire app — trainer and client screens + shared components** — white content cards, search inputs, and unselected filter/segment pills are **borderless** — no grey `#e8e8e4`/`BORDER` outline — relying on a **soft shadow** (or a light fill) for definition. (The legacy, now-unreachable `app/(tabs)/` duplicate group was left untouched — it's dead code the live client app never routes to.) This was a deliberate redesign: on the `#faf9f7` background the old grey borders read as hard, cheap outlines (they were camouflaged on the previous `#edede9`); the borderless + shadow look (modelled on the Finance invoice cards) is softer and more premium. Standard values:
- **Content card:** no border; `shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:6, elevation:2` (larger cards may use `{height:2}, radius:8, elevation:3`). If a card needs `overflow:'hidden'` to clip a cover image/child, keep it (the shadow is dampened but the borderless white still reads on `#faf9f7`).
- **Search bar / white input row:** no border; `shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:4, elevation:2`.
- **Modal/form TextInput:** no border; light fill `backgroundColor:'#f5f5f3'` (or `#f8f8f6` to match a modal's siblings).
- **Unselected pill / dropdown:** no border; white bg + `shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:1`; active/selected keeps its filled bg (drop any `borderColor` from the active variant).
- **Neutral (grey) outline/secondary button:** no border; light fill `#f5f5f3`.
- **KEEP borders:** dashed "add" affordances; colored/semantic borders (ACCENT, amber warning like `cardWarning`, red, category stripes, status pills); accent-colored Type 2 utility buttons; colored avatar rings; internal hairline dividers (`sep`/`cardDivider`/`borderTop/Bottom` between rows); the invoice **print-preview** facsimile (`pvSt`, mirrors the printed PDF). **Do Mode & Exercise Detail** keep their own white two-layer card system — not part of this rule.

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
- `CATEGORY_OPTIONS` (**8 standard** — Push, Pull, Upper Body, Arms, Lower Body, Full Body, Core, Mobility; July 2026 **Arms** added, **Legs & Recovery** retired but kept in the `WorkoutCategory` type + `CATEGORY_COLORS` as legacy so old rows still render — CategoryCover maps Legs→Lower Body, Recovery→Mobility) and `STRETCHING_CATEGORIES` (3 stretch) are exported from `lib/workoutCategories.ts`. Always import from there — never hardcode. Covers = body-silhouette watermarks per category (`components/CategoryCover.tsx`, see [[category_palette_and_covers]]).
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

> Moved to **CLAUDE-domode.md** — read it before any Do Mode work (both the client and trainer `workout/[workoutId]` files). Covers Session Intro, view-only mode, the header/nav bar + fixed-header redesign, exercise cards (V4), supersets, edit-mode action bar, all Do Mode modals/sheets, MuscleThumb, and the finish → Session Complete flow.

---

## 6. Exercise Slot Tracking

- Before first completed session: silent edits, no tracking, no labels
- After first completed session: all deviations tracked with dates and session numbers
- Auto order tracking: `slot_order_history` with `is_permanent=false`
- Deliberate drag reorder: `is_permanent=true`, update `slot_number` and `order_index`

---

## 7. Exercise Detail Screen

> Moved to **CLAUDE-domode.md**.

---

## 8. General Rules

- **Category system:** `lib/workoutCategories.ts` — `WorkoutCategory`, `CATEGORY_OPTIONS`, `CATEGORY_COLORS` with `{border, pillBg, pillText}`. Always import — never hardcode. `border` = 3px left stripe on cards, use `alignSelf:'stretch'`.
- **Exercise builder muscle picker:** hierarchical Upper/Lower toggle → group headers → muscle pills. Primary/secondary separate pickers. Selecting as primary removes from secondary. All active pills use `selectPillActive` (ACCENT bg+border) — no separate secondary style. Muscles are stored as the **granular** names from this picker (e.g. `Upper Chest`, `Front Delts`, `Upper Abs`, `Mid Traps / Middle Back`), NOT the group headers.
- **Exercise builder equipment (`EQUIPMENT_OPTIONS` in `app/(trainer)/add-exercise.tsx`):** None · Barbell · Z Bar · Dumbbell · Kettlebell · Machine · Bodyweight · Cable · Resistance Band · TRX.
- **Body-part filter (`lib/exerciseFilters.ts`):** the Library tab and Add-Exercise picker share `filterExercises` + `MUSCLE_FILTER_OPTIONS` (Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Full Body) + `EQUIPMENT_FILTER_OPTIONS` (…Kettlebell, TRX). `MUSCLE_MAP` maps each filter label → the **granular** muscle names the builder now stores **plus** the legacy group names, so both old and new exercises match. The filter tests **primary** `muscle_groups` only. **Whenever the builder muscle picker changes, update `MUSCLE_MAP` too** — otherwise the body-part filter silently matches nothing (this was the exact bug: the map still pointed at old group names like `Chest`/`Shoulders`/`Core`).
- **ExerciseRow muscle tag (both `library.tsx` ExercisesTab and `exercise-library.tsx` picker):** shows the first primary muscle; when `muscle_groups.length > 1`, a muted `+N` (`muscleTagMore` style, `#7fbfae`) sits inside the tag next to the name (e.g. `Upper Chest +2`). `muscleTag` is `flexDirection:'row'`.
- **Workout Builder category picker:** tappable row → white centered modal. None + 8 standard options + "STRETCHING" section separator + 3 stretching categories. Selecting a stretching category auto-sets `stretch_type` and hides the Post-workout stretch toggle.
- **Workout Builder Post-workout stretch selector:** Type 1 segmented switcher (None · Upper · Lower · Full) — shown only when category is NOT a stretching category. Sets `stretch_type` on the workout. File: `app/(trainer)/workout-builder.tsx`, state: `stretchType`.
- **Workout Builder superset drag guard:** dragged item must never land between exercises in same superset. `resolveInsertKey()` snaps to superset start. Apply in both move and release.
- **Strength tab compare picker:** white centered modal (`animationType="fade"`) — NOT bottom sheet. `maxHeight:320` ScrollView.
- **Library Workouts ⋯ → Set Category:** `CategoryPickerModal` (white centered modal). Options: None + 8 standard + "STRETCHING" separator + 3 stretching categories. Updates Supabase + local state immediately.
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
- **Workout cover cards — cover + WHITE FOOTER, app-wide (July 2026).** Every workout cover card (Library workouts+templates · per-client All Workouts · routine detail · Training-tab mini gallery · pickers · client My Workouts) is a two-part card: **`cover`** (`height:94, overflow:'hidden'`) holding the [[category_palette_and_covers]] watermark + a bottom overlay with the **name (white 14/600)** + **category pill** (`CATEGORY_COLORS[category].border`, white 9/700, `borderRadius:100`, no border) + any Done/client badges, then a separate **white `footer`** row (`backgroundColor:'#fff', paddingHorizontal:10, paddingVertical:9`) with the **last-done date/subtitle** (left, `footerSub` 12px `#888`) + the **⋯ menu** (right, `footerMenuBtn`, `#999`). Outer `card` holds the shadow (borderless); `cardInner` (`overflow:'hidden'`) clips. The ⋯ lives in the **footer**, never on the watermark. Reference impl: `WorkoutItem` in `app/(client)/(tabs)/train/all-workouts.tsx`. Full details + the affected-files list: memory **[[workout_card_white_footer]]**. (Photo covers stay disabled per [[category_palette_and_covers]] — the cover shows the category colour/watermark.) The old single-cover overlay layout (name/subtitle/⋯ all on the watermark, `height:100`, ⋯ at `top:9,right:10`) is retired.
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

## 9. Schedule Tab

> Moved to **CLAUDE-schedule.md** — Schedule tab, schedule blocks, appointment gesture system, day/week views, calendar, drafts.

---

## 10. Availability & Plan Week

> Moved to **CLAUDE-schedule.md** — client Availability screen (§10b) + trainer Plan Week (§10c).

---

## 11. Finance Tab

> Moved to **CLAUDE-screens.md**.

## 12. Session Packages

> Moved to **CLAUDE-screens.md**.

---

## 13. `lib/clientTraining.ts`

- `fetchClientTraining` filters to **completed sessions only** for all computed values
- Never use `(allSessions??[])[0]` — always filter to `completedSessions` first
- **Active-routine query is `.order('created_at',{ascending:false}).limit(1).maybeSingle()`** — NOT a bare `.maybeSingle()`. `maybeSingle()` throws if more than one row matches, and a client can transiently end up with >1 `status='active'` routine; ordering + `limit(1)` picks the newest and never throws.
- Sessions query: `.order('date',{ascending:false}).order('created_at',{ascending:false})`
- **Cycle detection:** after fetching `completedSessions` descending, reverse to get ascending order, then walk them tracking `cycleDone: Set<string>`. When `cycleDone.size === routineTotal` → reset the set, set `hasCycled=true`. Returns `cycleDoneCount` (current set size) and `cycleJustCompleted` (`hasCycled && size===0`). `nextUpWorkout` is also cycle-aware: first workout by `order_index` not in `cycleDone` (or `sortedByOrder[0]` if `cycleJustCompleted`). `nextUpPosition` remains the 1-indexed position of `nextUpWorkout` in the routine order — used for "Workout X of Y" text, not for ring values.

---

## 14. Account Screen

> Moved to **CLAUDE-screens.md**.

## 15. Invoice Screen

> Moved to **CLAUDE-screens.md**.

## 16. Auth Screens

> Moved to **CLAUDE-screens.md**.

---

*Read this file and SPEC.md at the start of every session before writing any code — plus the relevant `CLAUDE-*.md` companion for the area you're touching.*
