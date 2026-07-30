# Vitek Fitness App — Product Specification

**Version:** 8.7
**Last updated:** July 2026
**Author:** Vitek (personal trainer, Berlin)
**Status:** In testing — the app is live on TestFlight and being tested on a real iPhone. Vitek no longer needs to state this each session; assume real-device testing is ongoing and that fixes should be verifiable in a TestFlight build.

---

## How this project works

- Vitek describes what he wants and makes all decisions
- Claude (chat) helps plan, think things through, and writes/updates this spec
- Claude Code reads this spec and builds the app
- This file is the single source of truth — always read it before building anything

---

## 1. Overview

Vitek Fitness App is a mobile PT business tool for a Berlin-based personal trainer working exclusively one-on-one with clients. It replaces an existing white-label solution (Virtuagym) that lacks flexibility for the trainer's specific coaching style — which combines movement coaching, mobility work, and strength training with a strong emphasis on visual exercise demonstration via short personal video clips filmed by Vitek himself.

The app has two roles: **Trainer** (Vitek) and **Client**. The trainer controls all programming; clients view, follow, and log their own data. This is ONE app with two different views based on login role — not two separate apps.

---

## 2. Branding & Design

### Colors
- **Background:** #faf9f7 (all client **and** trainer screens — the trainer side was unified to #faf9f7 in July 2026, previously #edede9)
- **Cards:** #ffffff (pure white)
- **Card borders:** #e8e8e4
- **Header:** #244e43 (deep dark green)
- **Mid green:** #3a7d6b
- **Accent:** #24ac88 (bright teal-green)
- **Text primary:** #1a1a1a
- **Text secondary:** #999
- **Tab underline:** #24ac88

### Logo files (in `/assets`)
- `VF_Logo_Dark_Green_Transparent_BG.svg`
- `VF_Logo_White_Transparent_BG.svg`
- `VF_Icon_Dark_Green.svg`
- `VF_Icon_White.svg`

### Trainer photos (in `/assets/trainer-photos`)
- `trainer.jpg` — primary banner photo

### Design principles
- **Popup presentation (July 2026):** menus, option/list pickers, and read-only info panels **slide up from the bottom** as white sheets (shared `components/BottomSheet.tsx`); **binary confirm/abort dialogs and single-value text-entry modals stay centered** (and centered text-entry must keyboard-avoid so the field isn't covered). Dark-glass sheets are never used. See CLAUDE.md "Modals — presentation convention" for the full rule. One deliberate exception: the client nutrition `+` add-picker opens as an anchored **popover that grows from the FAB's bottom-right corner** (Virtuagym-style, `+`→`✕`), not a sheet — see CLAUDE-nutrition.md.
- Client **and** trainer screens: `#faf9f7` background (unified July 2026; trainer was previously `#edede9`). **Exceptions (both sides):** Do Mode and Exercise Detail use white (`#fff`) background.
- White cards on the respective background color — **exceptions:** Do Mode and Exercise Detail both use fully white (`#fff`) background.
- In Exercise Detail, expanded/section cards still need a two-layer pattern (`shadowOpacity:0.10, shadowRadius:8` outer + `borderWidth:1.5, borderColor:'#d0d0cc', overflow:'hidden'` inner) because `overflow:'hidden'` clips iOS shadows regardless of background color. Do Mode uses its own card system (see §5).
- No difficulty ratings on exercises
- No gamification, no calories, no estimated durations
- Rounded corners 16px on cards
- Photography brings warmth

### Navigation chrome — glass redesign (July 2026)
The old heavy dark-green (`#244e43`) 62px header + flat welded bottom tab bar are being replaced app-wide by a lighter, more premium "glass" nav (inspired by WhatsApp / iOS 26). Two shared components; iOS-tuned, Android keeps the flat bar via a `Platform.OS` gate. **Design is finalized; rollout is staged.** Full implementation detail in CLAUDE.md → "Nav chrome redesign".
- **`components/LightHeader.tsx`** — a light glass header floating over the page (content scrolls under it). It uses a **gradient-masked progressive blur** (`@react-native-masked-view/masked-view`) so the blur fades to nothing with no visible bottom edge — the WhatsApp seamless look. Bare brand-green glyphs (no chip circles); black status-bar clock.
- **Tab bar = the REAL native iOS tab bar** (`NativeTabs` from `expo-router/unstable-native-tabs`, backed by `react-native-screens`). The custom JS `components/FloatingTabBar.tsx` was **abandoned** (a JS bar can't do Apple's vibrancy) and is retained only for its `useTabBarHeight()` hook. The native bar gives real iOS 26 Liquid Glass + the morphing selection + vibrancy for free; Apple controls styling (green `tintColor`, SF Symbols). No center "+" (add actions are contextual).
- **Native modules** (native `NativeTabs`/`react-native-screens`, `@react-native-masked-view/masked-view`) mean the glass + masked blur require a **fresh iOS-26 native build** — JS-only tweaks hot-reload, these do not. Expo Go shows an opaque fallback bar; judge nav only in a real build.
- **Rollout:** ✅ **entire client side done** — main tabs + 5 training sub-screens + all client nutrition (Food Log / Favourites / Weekly / Grocery → `NativeTabs`; headers → `LightHeader`; recipe detail/create + meal editor as `(client)` stack routes). The **Workouts / Routines "See all" lists keep the native bottom bar** — the Training tab is a nested-stack folder (`(tabs)/train/index.tsx` + `train/all-workouts.tsx` + `train/all-routines.tsx` + `train/_layout.tsx` Stack), so those two lists are pushable screens *inside* the tab (bar stays); opening a workout (session-intro/Do Mode, `(client)` stack routes above the tabs) hides it. ✅ **Trainer bottom bar → `NativeTabs`** (5 triggers, ACCENT-green tint) + `useTabBarHeight()` bottom padding across all 5 tab screens. ✅ **Trainer client-detail header → `LightHeader solid`** with a pinned **underline** main-tab switcher + `GlassToggle` sub-tabs (see Client Profile below). ✅ **The 5 trainer tab-screen headers** (clients/schedule/library/finance/account) **+ the Planning screen** (`plan-week.tsx`, back-chevron variant) migrated to **`LightHeader solid`** — left = `<TrainerLogoButton light />` (dark-green VF glyph) or a back chevron, title = the screen name, right = a dark-green `plus`. **Library + Finance switchers unified to the client-detail hierarchy:** Library main tabs (Exercises/Workouts/Nutrition) → plain **underline**, Library sub-tabs → **`GlassToggle`**; Finance's Invoices/Earnings → plain **underline** (matches the Library main tabs); Finance filter pills active → light-green `ACCENT`. Library **resets to the first tab/sub-tab on leave** (blur-cleanup `useFocusEffect`); Finance likewise resets to Invoices on leave. ⏳ **Next: retire `FloatingTabBar`** (move `useTabBarHeight()` to a tiny shared module — now consumed by every tab group — then delete the unused component). Do Mode / Exercise Detail / Session Intro / client Home keep their own designs.
- **The key layout rules for glass screens (two hard-won ones):** (1) **Use a plain `<View>` root, NEVER `<SafeAreaView>`** — under `NativeTabs`, `SafeAreaView` (even `edges={[]}`) injects a phantom top inset that pushes content too low (this was the real cause of the Progress/Me "content too low" bug; `train`/`schedule` use plain `View` and are correct). Pad `paddingTop: useHeaderHeight()` / `paddingBottom: useTabBarHeight()`. (2) **To give a native-tab screen deeper pushable sub-screens that keep the bar, make the tab a FOLDER with its own `_layout` Stack** — you CANNOT `router.push` to a hidden `NativeTabs.Trigger` (silent no-op), so hidden-trigger + push does not work for reachable deep screens.

### Button system

Three button types — always use the correct one:

| Type | Shape | Use for |
|---|---|---|
| **Type 1 — Segmented switcher** | Pill (`borderRadius: 100`) outer container with `#d8d8d4` bg; white active inner pill | Sort toggles, selectable option groups (e.g. barbell weight 15/20/Custom) |
| **Type 2 — Utility action** | Rounded rect (`borderRadius: 10`), accent border 1.5px, transparent/light bg | "Start timer", action-row buttons (Play video / Info) — inline actions inside a card. **Add Set/Dropset and Add photo** use a dashed SVG border via `DashedBtnWrapper` (same base style, `borderWidth:0`, SVG `Path` with `strokeDasharray="9 5"`, bottom edge overlaid at `strokeWidth 2.2` with aligned `strokeDashoffset`) |
| **Type 3 — Primary CTA** | Pill (`borderRadius: 100`), filled accent or gray; outline accent variant for secondary CTAs | Save, Done, Confirm, Draft, Send |

Rule: **filled pill = primary action · outline/border pill = secondary CTA · rounded-rect accent border = utility inline action**

### Localisation
- English first, German in Phase 2
- All strings in `i18n/en.ts`
- SLOGANS array in `i18n/en.ts`

---

## 3. Roles & Access

### Trainer
- Full client access, creates everything
- Manages exercise library, template library, workout library
- Sets session packages and custom slogans per client

### Client
- Own data only, cannot self-register
- Logs sessions, views progress

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo SDK 54 (TypeScript) |
| Backend | Supabase (Project: iwtfhmbolhoivpzufprr) |
| Navigation | Expo Router |
| State | Zustand |
| Charts | react-native-svg (custom SVG graphs) |
| Body diagram | react-native-body-highlighter v3.2.0 |

**GitHub:** vitekkorinek/vitek-fitness-app

---

## 5. Data Models

### User
```
id, email, name, username, role (trainer | client), avatar_url,
must_change_password (boolean), custom_slogan (nullable),
phone, date_of_birth, trainer_notes, overview_note (nullable text — trainer sticky note shown on the Training tab),
sex (male | female | other | null), height_cm (nullable integer),
activity_level (nullable text — sedentary | lightly_active | moderately_active | very_active),
goal (nullable text — maintain | lose_025 | lose_05 | gain),
banner_photo_url (nullable), banner_photo_offset_y (integer, default 50), banner_photo_zoom (numeric, default 1.0),
vf_icon_pos_x (float, default 0.88), vf_icon_pos_y (float, default 0.06),
address_street (nullable text), address_city (nullable text), address_postcode (nullable text), address_country (nullable text),
availability_type (text nullable CHECK IN ('fixed', 'flexible_recurring', 'variable') DEFAULT 'variable' — set by trainer in client Info tab),
weekly_session_goal (integer nullable DEFAULT NULL — set by trainer in client Info tab, used as fallback goal on client Training tab),
created_at
```
`sex` and `height_cm` are set by the trainer in the Info tab. `activity_level` and `goal` are set by the trainer inside the Nutrition tab macro calculator (not the Info tab). `height_cm` is used to compute BMI in the Progress tab and also pre-fills the macro calculator. `banner_photo_url` is set by the trainer in the Account tab (the default banner shown to **all** clients) or the client's Info tab (a per-client override). The client home screen uses the client's own `banner_photo_url` when set, otherwise falls back to the trainer's account banner. **RLS note:** the `users` SELECT policy is `(id = auth.uid()) OR is_trainer()`, so a client cannot read the trainer's row directly — the fallback is fetched via the `get_trainer_banner()` `SECURITY DEFINER` RPC (returns only `banner_photo_url`, `banner_photo_offset_y`, `banner_photo_zoom`). `banner_photo_offset_y` (0–100, default 50) controls vertical positioning — 0 = top-aligned, 50 = centered, 100 = bottom-aligned. `banner_photo_zoom` (1.0–2.5, default 1.0) controls zoom relative to the image's natural fill-width size. `address_street/city/postcode/country` are editable by the client from the Me tab — used for invoice billing address.

### Exercise
```
id, name, description, muscle_groups[], secondary_muscle_groups[],
equipment, video_url, extra_video_urls[], extra_photo_urls[],
thumbnail_url, created_by, created_at
```
No difficulty field. `muscle_groups` = primary muscles. `secondary_muscle_groups` = secondary muscles (optional, defaults to `{}`). Both are text arrays using the full muscle name strings from the hierarchical picker. `video_url` = primary video; `extra_video_urls` = additional angles (TEXT[] DEFAULT '{}'). `extra_photo_urls` = manually uploaded demo photos (TEXT[] DEFAULT '{}'). `thumbnail_url` = display thumbnail: first uploaded photo if any, else auto-generated from first video.

### WorkoutTemplate
```
id, name, description, goal, equipment_list[], muscle_groups[],
notes, template_type (workout | routine), created_by, created_at,
cover_image_url (nullable), category (nullable text — same values as Workout.category),
stretch_type (nullable text — upper_body | lower_body | full_body)
```
Reusable workout blueprints, shown in the Library → Workouts → **Templates** tab. `cover_image_url`, `category`, and `stretch_type` were added so a template has full parity with a client Workout — a template is "a workout saved to the gallery instead of to a client". A template has **no `client_id`** and is therefore never matched by the post-workout stretch lookup — it must be assigned/copied into a client first. Stretch templates (`category` in the 3 stretching categories, `stretch_type` set) act as the masters that get auto-provisioned into clients (see §5 Stretch sessions).

### TemplateExercise
```
id, template_id, exercise_id, order_index, notes,
is_superset (boolean), superset_group_id, equipment_type, barbell_weight_kg
```

### TemplateSet
```
id, template_exercise_id, set_number,
target_reps (nullable), target_weight_kg (nullable), rest_seconds (nullable)
```
Per-set targets for a template exercise. The workout builder writes these when saving a template (previously it incorrectly tried to write `sets`/`reps` columns onto `template_exercises`, which don't exist — template saving was broken until fixed).

### Routine
```
id, name, client_id, created_by,
status (active | closed), auto_name, created_at, closed_at,
status_history (JSONB NOT NULL DEFAULT '[]' — append-only log of {status: 'active'|'closed', at: ISO string} entries)
```
Auto-name: "[FirstName] Routine I/II/III..." based on existing count. Always editable.

`status_history` records every status change after the initial creation: each time a routine is deactivated or reactivated, `{status, at}` is appended. Used to reconstruct the full activation history displayed in the routine (i) modal. `closed_at` is set on first deactivation and never cleared — it serves as a fallback for reconstructing periods created before `status_history` tracking was introduced.

### Workout
```
id, name, description, goal, client_id, routine_id (nullable),
created_by, equipment_list[], muscle_groups[], order_index, notes,
cover_image_url (nullable), created_at,
category (nullable text — Push | Pull | Upper Body | Lower Body | Legs | Full Body | Core | Mobility | Recovery | Upper body stretching | Lower body stretching | Full body stretching),
stretch_type (nullable text — upper_body | lower_body | full_body),
status (text, NOT NULL, DEFAULT 'active' — active | completed)
```
`category` is stored with a CHECK constraint. The three stretching categories mark a workout as a stretch session. `stretch_type` serves two purposes: (1) on a stretching-category workout it is auto-set to the matching type and marks it AS a stretch session; (2) on a regular workout it marks which type of stretch session should follow it (set via "Post-workout stretch" toggle in the builder or ⋯ menu). `status` is set by the trainer via the ⋯ menu ("Mark as done" / "Reactivate") — completing a workout session does NOT automatically mark the workout as done. Stretching sessions do not count against the client's session package.

### WorkoutExercise
```
id, workout_id, exercise_id, order_index, notes,
is_superset (boolean), superset_group_id, equipment_type, barbell_weight_kg,
is_active (boolean, NOT NULL, DEFAULT true)
```
`is_active` is a **soft-delete flag**. When a trainer edits a workout and removes an exercise, the builder sets `is_active=false` rather than deleting the row — a hard delete would cascade the row's `session_logs` and erase the client's logged history for that exercise. Keeping the row (and its logs) means the client's last-performed weight/reps stay available and pre-fill the next time that exercise is used (anywhere, matched by `exercise_id`). **Every query that renders a workout's exercise list filters `is_active = true`** (both Do Mode files, `WorkoutExercisesModal`, `RoutineDetailsSheet`, the routine quick-look count, the builder's edit-load). The last-performed / weight-memory queries intentionally do NOT filter it, so inactive rows still contribute their logs.

### WorkoutSet
```
id, workout_exercise_id, set_number,
target_reps (nullable), target_weight_kg (nullable), rest_seconds (nullable)
```

### workout_exercise_slots
```
id, workout_id, slot_number (permanent, never changes),
original_exercise_id (nullable — null if added mid-session after first completion),
current_exercise_id, created_at
```

### slot_replacement_history
```
id, slot_id, exercise_id, replaced_on, session_id,
is_permanent (boolean), notes, created_at
```

### slot_order_history
```
id, slot_id, performed_at_position, session_id,
is_permanent (boolean), changed_on, created_at
```

### Session
```
id, workout_id (nullable — null for free sessions), client_id, date,
status (completed | skipped | in_progress),
started_at (nullable), duration_seconds (nullable),
name (nullable text — set for free sessions, e.g. "Free Session · 9 May 2026"),
trainer_notes, client_notes, created_at
```

### SessionLog
```
id, session_id, workout_exercise_id, set_number,
reps_completed, weight_kg, duration_seconds, notes,
barbell_weight_used_kg, is_removed (boolean),
is_dropset (boolean), dropset_parent_id, dropset_order,
completed_at (nullable)
```

### session_exercise_photos
```
id, session_id, workout_exercise_id, photo_url, created_at
```
Photos are stored in the `session-photos` Supabase storage bucket (public). `session_id` is retained for reference but photos are queried and displayed across **all sessions** filtered only by `workout_exercise_id` — they accumulate permanently on the exercise like notes.

### Measurement
```
id, client_id, date,
weight_kg,
body_fat_pct, body_fat_kg,
muscle_mass_pct, muscle_mass_kg,
body_water_pct,
icw_kg (nullable), ecw_kg (nullable), ecw_tbw_ratio (nullable),
visceral_fat,
bmr_kcal,
fat_left_arm_kg (nullable), fat_right_arm_kg (nullable),
fat_left_leg_kg (nullable), fat_right_leg_kg (nullable),
fat_trunk_kg (nullable),
muscle_left_arm_kg (nullable), muscle_right_arm_kg (nullable),
muscle_left_leg_kg (nullable), muscle_right_leg_kg (nullable),
muscle_trunk_kg (nullable),
notes (nullable),
created_by, created_by_role (trainer | client),
created_at
```
All segmental and water-composition fields are nullable — older entries will not have them. `created_by` = user id. `created_by_role` = whether trainer or client entered the data. `ecw_tbw_ratio` is auto-computed in the form when both `icw_kg` and `ecw_kg` are entered: `ecw / (icw + ecw)`.

### SessionPackage
```
id, client_id, name, total_sessions, sessions_used,
status (active | completed | saved),
status_closed_early (boolean, default false),
package_type ('Quick 40' | 'Standard 60' | 'Extended 75' | null),
duration_minutes (40 | 60 | 75 | null),
price_eur (numeric | null),
activated_at,
expires_at (nullable date — calculated on activation, editable by trainer),
created_by, created_at
```
`status_closed_early = true` distinguishes manually-closed packages ("Closed" grey pill) from fully-used ones ("Done" teal pill) in the past-packages list.

### PackageDefault
```
id, package_type ('Quick 40' | 'Standard 60' | 'Extended 75'),
size (6 | 12 | 20), price_eur (numeric)
```
9 pre-seeded rows (3 types × 3 sizes). Used to pre-fill price when creating a new package. Editable by trainer before saving.

### Appointment
```
id, trainer_id (uuid → users.id),
client_id (uuid → users.id, nullable — null for guest appointments),
guest_name (text, nullable — used when client_id is null),
type (text CHECK IN ('pt_session', 'nutritional_advising', 'trial', 'consultation')),
date (date), start_time (time), duration_minutes (integer, default 60),
notes (text, nullable),
status (text DEFAULT 'scheduled' CHECK IN ('scheduled', 'completed', 'cancelled', 'cancelled_charged')),
color (text, nullable — hex color assigned per client from pool),
is_confirmed (boolean NOT NULL DEFAULT false — trainer marks appointment as finalised; triggers client notification),
sent_to_client (boolean NOT NULL DEFAULT true — false = a Planning-screen DRAFT the client cannot see yet),
created_at
```
Active booking types are `pt_session` and `nutritional_advising` only — `trial` and `consultation` are legacy values retained in the constraint for existing data but no longer shown in the booking UI. `cancelled_charged`: appointment was cancelled but counts against the client's session package. Shown on the grid with red left border and "Cancelled" label. `sessions_used` is incremented immediately by the trainer action, not via the edge function.
`sent_to_client` (added July 2026): appointments created on the **Planning screen** start as **drafts** (`false`) — the trainer can move/adjust them while planning, and the **client cannot see them** (all client-side appointment queries filter `sent_to_client = true`). The trainer sends them individually (tap → "Send to client") or all at once ("Send all"), which sets `sent_to_client = true` and fires the `appointment_planned` notification. Appointments created on the Schedule tab default to `true` (sent immediately, as before). The `count-completed-sessions` edge function skips drafts (`sent_to_client = true` filter) so an unsent draft never auto-completes or consumes a package session.
RLS: trainer ALL (`trainer_id = auth.uid()`); client SELECT (`client_id = auth.uid()`).

### AvailabilitySlot
```
id, client_id (uuid → users.id, cascade delete),
trainer_id (uuid → users.id),
week_start (date — always a Monday, YYYY-MM-DD),
day_of_week (integer CHECK 1–7, 1=Mon 7=Sun),
start_time (time), end_time (time),
is_recurring (boolean NOT NULL DEFAULT false — true for slots that repeat every week),
created_at
```
Clients submit their free time slots. `is_recurring=true` slots represent the client's standing availability pattern. When submitting, the client can choose "this week only" (`is_recurring=false`) or "all coming weeks" (`is_recurring=true`, which replaces any previous recurring slots **and clears any week-specific slots/submissions for future weeks, so every week from the edited one onward reflects the new pattern** — a previously-customised future week no longer silently overrides it). RLS: client ALL; trainer SELECT.

### AvailabilitySubmission
```
id, client_id (uuid → users.id, cascade delete),
trainer_id (uuid → users.id),
week_start (date — always a Monday),
sessions_wanted (integer NOT NULL DEFAULT 1 — how many times per week the client wants to train),
note (text, nullable — optional message to the trainer),
is_recurring (boolean NOT NULL DEFAULT false),
created_at,
UNIQUE(client_id, week_start)
```
Created/upserted alongside availability slots. Stores the client's training frequency preference and optional note for the trainer. RLS: client ALL; trainer SELECT.

### ScheduleBlock
```
id, trainer_id (uuid → users.id),
date (date), start_time (time), end_time (time),
label (text, nullable — e.g. "Vet with Dylan", "Admin time"),
created_at
```
Personal time blocks on the trainer's schedule. Shown as grey cards on the Schedule grid (day and week views) and in the Plan Week screen. Not connected to appointments or packages. RLS: trainer ALL.

### AvailabilityNotification
```
id, client_id (uuid → users.id, cascade delete),
trainer_id (uuid → users.id, cascade delete),
week_start (date — always a Monday, YYYY-MM-DD),
status (text DEFAULT 'pending' CHECK IN ('pending', 'actioned')),
is_update (boolean NOT NULL DEFAULT false — true when client is editing previously submitted availability),
created_at,
UNIQUE(client_id, week_start)
```
Created/upserted by the client when submitting availability. `is_update=true` when a notification row already existed for that client+week at submit time (meaning the client is adjusting previously shared slots). Deleted when the client submits with zero slots (availability cleared). Trainer sees pending rows via the VF logo badge (summed with `move_requests`). Marking "Done" sets `status='actioned'`. RLS: client ALL (`client_id = auth.uid()`); trainer ALL (`trainer_id = auth.uid()`).

### MoveRequest
```
id, appointment_id (uuid → appointments.id, cascade delete),
client_id (uuid → users.id),
trainer_id (uuid → users.id),
note (text NOT NULL — client's freetext request),
kind (text NOT NULL DEFAULT 'move' CHECK IN ('move','cancel')),
within_24h (boolean NOT NULL DEFAULT false — true when a cancel request is made <24h before the session, i.e. must be covered/charged),
status (text DEFAULT 'pending' CHECK IN ('pending', 'actioned')),
created_at
```
Client requests to either **reschedule** (`kind='move'`) or **cancel** (`kind='cancel'`) an appointment — both are *requests the trainer approves*, never direct changes (the trainer owns the schedule). Sent from the **Edit** window on the client Appointments tab (available at any time; there is no longer a >24h block). For a cancel made <24h before the session, `within_24h=true` and the client is warned it must still be covered. Trainer sees pending requests via the VF logo badge; the Notifications modal labels each as "Time change request" or "Cancellation request" (with an "under 24h, must be covered" note when applicable). "View in schedule" (cancel) jumps to that day so the trainer can apply the existing Cancel / Cancel-charged actions; "Done" sets `status='actioned'`. RLS: client ALL (`client_id = auth.uid()`); trainer ALL (`trainer_id = auth.uid()`).

### ClientColor
```
trainer_id (uuid → users.id), client_id (uuid → users.id),
color (text — hex from COLOR_POOL),
PRIMARY KEY (trainer_id, client_id)
```
Stores the persistent color assigned to each client on the trainer's schedule. Auto-assigned from `COLOR_POOL` on first appointment save for that client. RLS: trainer ALL.

### FinanceManualEntry
```
id, label (text), amount_eur (numeric),
entry_month (integer 1–12, nullable), entry_year (integer),
created_by (user id, nullable), created_at
```
Manual historical income entries. Used for one-off payments, past-period reconciliation, etc.

### Invoice
```
id, invoice_number (text, sequential NNN-YYYY, unique per year),
client_id, created_by,
status (draft | sent | updated | paid),
issue_date (date),
paid_at (timestamptz, nullable — set when trainer confirms payment),
line_items (jsonb: [{ description, additional_info, leistungszeitraum, quantity, unit_price_eur, total_eur }]),
net_amount_eur, vat_rate (default 19), vat_amount_eur, gross_amount_eur,
notes (text, nullable),
trainer_snapshot (jsonb), client_snapshot (jsonb),
pdf_url (nullable — stored in invoices Supabase bucket),
created_at, updated_at
```

### TrainerSettings
```
id, trainer_id (user id, unique),
full_name, address_street, address_city, address_postcode,
steuernummer, iban,
invoice_number_start (integer, default 1),
invoice_number_year (integer — resets sequence each year),
hidden_system_tip_indices (integer[] NOT NULL DEFAULT '{}' — indices of system nutrition tips hidden by trainer),
created_at, updated_at
```
Stores trainer business details used on invoices. Set once in Account settings. `hidden_system_tip_indices` allows the trainer to hide individual system-provided nutrition tips from their Tips sub-tab without deleting them.

### TemplateAssignment
```
id, template_id, client_id, workout_id, assigned_by, assigned_at
```

### Note
```
id, content, created_by, role (trainer | client),
level (training | exercise | set), reference_id, created_at
```

### NutritionTip
```
id, trainer_id (user id, not null),
title (text), body (nullable text),
category ('tip' | 'supplement'),
is_published (boolean, default true),
cover_photo_url (nullable),
link_url (nullable),
created_at, updated_at
```
Stores trainer-created nutrition tips and supplement recommendations. `category = 'tip'` for the Tips sub-tab; `category = 'supplement'` for the Recomm. (Recommendations) sub-tab. `link_url` stores an external resource link shown in the detail sheet. `is_published` controls visibility.

### Recipe
```
id, name (text),
trainer_id (nullable — set when created by trainer),
client_id (nullable — set when created by client),
portions (integer, default 1),
description (nullable text),
instructions (nullable text),
cover_photo_url (nullable),
created_by (user id), created_by_role ('trainer' | 'client'),
is_shared_to_trainer (boolean, default false),
created_at, updated_at
```
Trainer-created recipes have `created_by_role = 'trainer'` and are readable by all authenticated users via RLS. Client-created recipes are visible to the creating client + their trainer when `is_shared_to_trainer = true`. Cover photos stored in `recipe-covers` Supabase storage bucket (public).

**RLS policies on `recipes` table:**
- `trainer_manage_own_recipes` — trainer INSERT/UPDATE/DELETE where `created_by = auth.uid()` + trainer role
- `trainer_read_shared_client_recipes` — trainer SELECT where `is_shared_to_trainer = true` + trainer role
- `trainer_recipes_readable_by_all` — SELECT for any authenticated user where `created_by_role = 'trainer'`
- Client own recipe policy — client manages their own recipes

### RecipeIngredient
```
id, recipe_id (foreign key → recipes.id, cascade delete),
name (text), amount (nullable text), unit (nullable text),
created_at
```

### ClientNutritionTargets
```
id, client_id (user id, unique),
diet_type (text, nullable — omnivore | pescatarian | vegetarian | vegan | keto | carnivore | low-carb | custom),
calories (integer, nullable), protein_g (integer, nullable), carbs_g (integer, nullable), fat_g (integer, nullable),
fiber_min_g (integer, nullable), sugar_max_g (integer, nullable), salt_max_g (numeric, nullable),
water_target_ml (integer, nullable),
nutrition_notes (text, nullable — free-text field for food allergies, intolerances, dislikes, medical restrictions),
set_by (uuid → users.id),
created_at, updated_at
```
Set by the trainer in the client's Nutrition tab. `client_id` has a UNIQUE constraint — upsert on conflict. Read by the client's Food Log screen to display GOAL and macro targets. `nutrition_notes` is visible to the trainer only (stored on `client_nutrition_targets`, not surfaced to the client).

### FoodLogEntry
```
id, client_id (user id),
date (text YYYY-MM-DD),
meal_category (text CHECK IN ('breakfast','lunch','dinner','snack','snack_morning','snack_afternoon','snack_evening','snack_pre_workout','snack_post_workout')),
food_name (text), brand (text, nullable),
source (text, nullable — off | usda | manual | custom | trainer), source_id (text, nullable),
portion_amount (numeric, nullable), portion_unit (text, nullable — g | ml | serving | piece | cup | tbsp | tsp),
calories (numeric, nullable), protein_g (numeric, nullable), carbs_g (numeric, nullable), fat_g (numeric, nullable),
fiber_g (numeric, nullable), sugar_g (numeric, nullable), salt_g (numeric, nullable),
food_groups (text[], nullable — veg | fruit | meat | fish | dairy | legume | grain | nut | fat),
created_at
```
One row per logged food item. Queried by `client_id + date` for the daily food log screen.

### food_cache
```
source (text — off | usda), source_id (text),
name (text), brand (text, nullable),
nutrients_json (jsonb — calories, protein, carbs, fat, fiber, sugar, salt per 100g),
food_groups (text[]),
image_url (text, nullable — product photo for OFF foods; Wikipedia thumbnail for USDA foods once fetched),
serving_size_g (numeric, nullable — gram weight of 1 serving as reported by the API),
last_fetched (timestamptz),
PRIMARY KEY (source, source_id)
```
7-day TTL cache for Open Food Facts and USDA FoodData Central results. Searched first before hitting external APIs. All `nutrients_json` values are stored in **g/100g** (not mg). `getCached()` in `lib/foodApi.ts` applies a `salt > 50` guard on every read to silently correct any stale entries cached before the May 2026 normalisation fix (some entries had salt stored in mg, causing values like 529 instead of 0.53). USDA data is fetched with `dataType=Foundation,SR%20Legacy` — FNDDS (survey/mixed dishes) and Branded foods are excluded at source. `image_url` is populated from OFF's `image_front_thumb_url` on first cache write, and for USDA foods is backfilled from the Wikipedia REST API the first time a user taps that food in the search modal (then persisted so future searches show the thumbnail immediately). `serving_size_g` is stored on every cache write so the portion picker can use it without re-fetching the API.

### custom_foods
```
id, client_id (uuid → users.id, cascade delete),
name (text, not null), brand (text, nullable),
calories_per_100g (numeric, nullable), protein_g (numeric, nullable),
carbs_g (numeric, nullable), fat_g (numeric, nullable),
fiber_g (numeric, nullable), sugar_g (numeric, nullable), salt_g (numeric, nullable),
default_portion_amount (numeric, default 100),
default_portion_unit (text, default 'g'),
created_at
```
Client-created custom foods. RLS: client can read/write their own rows only (`client_id = auth.uid()`). Appear in the **My foods** tab of `FoodSearchModal` and are also included in **All** search results ranked above community-submitted OFF foods. `source = 'custom'`, `source_id = id` when logged to `food_log_entries`. Not cached in `food_cache` (queried directly from this table). Created via the floating + button in the My foods tab.

### trainer_foods
```
id, trainer_id (uuid → users.id, cascade delete),
name (text, not null),
name_de (text, nullable — German name for bilingual search),
calories_per_100g (numeric, not null),
protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g (numeric, nullable),
photo_url (text, nullable — stored in trainer-foods Supabase bucket),
food_groups (text[] default '{}' — veg | fruit | meat | fish | dairy | legume | grain | nut | fat),
portions (jsonb default '[]' — array of {label: string, grams: number} for named portions),
badge (text default 'whole', CHECK in 'whole'|'branded'|'generic' — VF badge tier: green/red/yellow),
is_branded (boolean default false — legacy, superseded by badge),
created_at
```
Trainer-defined foods curated for clients. RLS: trainer can read/write own rows (`trainer_id = auth.uid()`); all authenticated users can SELECT. `portions` stores named portion sizes (e.g. `[{label:'serving',grams:150},{label:'piece',grams:50},{label:'can',grams:400}]`) — 100g is always implicit. Photos stored in `trainer-foods` Supabase bucket (public). `source = 'trainer'`, `source_id = id` when logged to `food_log_entries`. Searched via `name` and `name_de`. Appear in food search ranked first (score 1100, above custom=1000 and USDA/OFF). Identified in search results by VFIcon badge (dark green, size 13).

**Claude-seeded food library (July 2026):** the table was bulk-seeded from 1 → **~249 rows** of accurate common foods (whole foods across every group, German staples, common prepared dishes, drinks, condiments, sweets) so clients get a rich, trustworthy library that appears first with the trainer's VF badge — instead of the trainer hand-creating each food. All rows carry `name_de` (bilingual EN/DE search), `food_groups`, and natural `portions` (1 egg large/small, 1 apple, 1 cup dry vs cooked rice, 1 slice, 1 handful, 1 tbsp/tsp, 1 glass). Dry/cooked and raw/cooked are separate rows with the state labelled in the name. **Photos** use TheMealDB ingredient images (`photo_url` links directly to TheMealDB's CDN for display; Almonds is a self-hosted proof-of-concept in the bucket); ~129/249 have a photo, the rest show the fork/knife placeholder. Full detail + conventions + the sandbox upload gotcha in **CLAUDE-nutrition.md "Trainer food library (Claude-seeded foods) + photos"**.

**Extensions (BUILT July 2026):** (1) **3-tier VF badge by trust level** — the `trainer_foods.badge` column (`whole|branded|generic`) drives the VF colour: 🟢 green = whole foods + source-independent staples (banana, chicken, olive oil, dark chocolate 70%), 🔴 red = named brand / fast food (Coca-Cola, Nutella, McDonald's, Döner), 🟡 yellow = generic processed/composite estimate where brand & recipe are unknown (milk chocolate, chocolate spread, sauces, ready dishes, sausages). Branded/generic are best-effort estimates, with the barcode scanner as the accurate path for exact branded items; (2) **auto-saved scanned foods** — the `scanned_foods` table stores each client's barcode scans (RLS per-client); a scan is saved the moment it resolves, shown in the "My foods" tab with a scan badge + "Scanned on DATE" so the product is never re-scanned; (3) recently-used foods surfaced on opening search — the "RECENTLY ADDED" list (from `recent_foods`, with photos, 20 items) which had been silently broken and was fixed. See CLAUDE-nutrition.md for implementation detail.

### scanned_foods
```
id, client_id (uuid → users.id, cascade delete),
food_name (text, not null), brand (text, nullable),
source (text default 'off'), source_id (text — the barcode),
nutrients_json (jsonb, not null — per 100g), food_groups (text[] default '{}'),
image_url (text, nullable), scanned_at (timestamptz default now()),
UNIQUE (client_id, source, source_id)
```
Per-client record of barcode-scanned foods so they never re-scan the same product. RLS: `client_manage_own_scanned_foods` (`client_id = auth.uid()`, ALL). Written by `handleBarcodeScanned` in `FoodSearchModal` the instant a barcode resolves (independent of logging). Surfaced in the "My foods" tab (merged with `custom_foods`) with a `barcode.viewfinder` badge; the portion picker shows "Scanned on DATE".

### water_logs
```
id (uuid PK), client_id (uuid → users.id, ON DELETE CASCADE), date (date),
glasses_count (integer NOT NULL default 0),
created_at (timestamptz)
```
One row per client per day, `UNIQUE(client_id, date)` (the target of the `upsert({ onConflict: 'client_id,date' })`). Each glass = 250ml. Target derived from `client_nutrition_targets.water_target_ml ÷ 250`. RLS: `client_manage_own_water_logs` (`client_id = auth.uid()`, ALL) + `trainer_read_client_water_logs` (SELECT for trainers). **The table was created July 2026** — it had previously been referenced by the Food Log code but never actually created, so every glass tap failed silently and the count reset to 0 on reload.

### saved_meals
```
id, client_id (user id),
name (text),
ingredients (jsonb — array of MealIngredient objects: { foodName, brand, source, sourceId, amount, unit, nutrition:{calories,protein,carbs,fat,fiber,sugar,salt}, foodGroups, nutrientsPer100g }),
cover_photo_url (text, nullable),
notes (text, nullable),
visibility (text NOT NULL DEFAULT 'private' — 'private' | 'trainer' | 'clients'),
created_at
```
Client-saved meal combinations. Displayed in Favourites → Meals as **cover-image cards** (same shape as recipe/workout cards). Built/edited on the dedicated **meal editor screen `app/(client)/meal/[id].tsx`** (a `(client)` stack route, frosted `LightHeader`, rounded cover card, name row, kcal/P/C/F, ingredients, notes, share, Save/Log/Delete — extracted from an in-file favourites overlay July 2026; mirrors `recipe/create`). `visibility` controls sharing: `'private'` = client only, `'trainer'` = trainer can see, `'clients'` = all trainer's clients can see (Phase 2 enforcement). `meal-covers` storage bucket (public) holds cover photos uploaded via `arrayBuffer()`.

### favourite_days
```
id, client_id (user id), name (text NOT NULL), date_reference (date),
snapshot_json (jsonb NOT NULL DEFAULT '[]' — array of that day's FoodLogEntry rows), created_at
```
Client-saved "favourite" food days. Shown as pink heart dots on the calendar picker; the week-strip heart in the Food Log fills (light-green `heart.fill`) when the selected day is saved. Loading a favourite day replays all its food entries (`snapshot_json`) into a chosen date. RLS: `client_manage_own_favourite_days` (`client_id = auth.uid()`, ALL). **The table was created July 2026** — it had previously been referenced by the Food Log save-day code but never actually created, so saving a day failed silently (the row never persisted and no heart dot appeared), the same class of bug as `water_logs`.
- **Inserting a saved day is retroactive (July 2026).** From the Food Log FAB → "Add a day from Favourites", the selected week-strip day is carried through (`favourites?tab=days&insertMode=true&date=<selectedDate>`) so a saved day logs to whichever day the client is viewing (e.g. forgot to track yesterday → select yesterday → insert). The insert confirm has no date picker (the target is fixed by the FAB) and returns to the Food Log immediately. Because Favourites is a persistent `NativeTabs` screen, the target date + Days view are read **reactively** (`useMemo`/`useEffect` on the URL params), never via one-time `useState` initializers — those froze on the first mount and always inserted to *today*. See CLAUDE-nutrition.md "Days list → Insert-a-saved-day flow".

### weekly_nutrition_notes
```
id, client_id (user id), week_start (text YYYY-MM-DD — always Monday),
content (text), created_at, updated_at
```
Trainer-written weekly note visible in the Trainer Nutrition tab Overview sub-tab.

### client_notifications
```
id, client_id (uuid → users.id, cascade delete),
type (text — appointment_planned | appointment_confirmed | weekly_report_ready | weekly_note |
             new_recommendation | new_workout | new_routine | package_low | package_expired | new_measurement),
title (text), body (text, nullable — for appointment types always contains the date as YYYY-MM-DD
                    so NotificationOverlay can parse it for deep-link navigation),
is_read (boolean, default false),
reference_id (uuid, nullable — points to the relevant record, e.g. appointments.id),
area (text — 'nutrition' | 'training'),
created_at (timestamptz)
```
In-app notifications for clients. Filtered by `area` — nutrition notifications shown in the pear-icon overlay on the Food Log header; training notifications shown in the kettlebell-icon overlay on the Training tab header. RLS: client SELECT + UPDATE own rows (`client_id = auth.uid()`); trainer INSERT for their clients. No client DELETE policy — dismissal marks `is_read=true` via UPDATE. `NotificationOverlay` only loads `is_read=false` rows; dismissed notifications never reappear.

**Active notification types (training area):**
- `appointment_planned` — inserted by trainer when creating a new appointment. Inserted from **both** the Schedule tab (`NewAppointmentSheet.save()`) **and** the Plan Week screen (`plan-week.tsx` — both the sheet Save and "Apply all" for suggested slots, via `notifyAppointmentPlanned`). Uses client-side `makeUUID()` for the appointment ID. Stored with `area='training'`.
- `appointment_confirmed` — inserted by trainer when toggling `is_confirmed=true` on an existing appointment. Stored with `area='training'`.
- **Both appointment types surface in BOTH the kettlebell (training) and pear (nutrition) trays** from the single stored row, so the client can't miss them wherever they are. Achieved by the overlay/badge queries matching `area = <tray> OR type IN ('appointment_planned','appointment_confirmed')`. Dismissing the one row clears it from both trays and both badges.

**`NotificationOverlay` (`components/NotificationOverlay.tsx`):** slides down from top. Each row shows title, body, a green "View appointment" pill (appointment notifications always deep-link to `/(client)/(tabs)/schedule?date=YYYY-MM-DD` — extracted from body via `/(\d{4}-\d{2}-\d{2})/` — even in the pear tray) and swipe-left-to-dismiss (red "Dismiss" via `Swipeable`). **Tapping "View" only navigates — it does NOT mark the notification read; the client must physically dismiss it** (swipe or "Dismiss all"). "Dismiss all" footer when 2+ rows. Dismiss = `UPDATE is_read=true`. Kettlebell badge re-checked via `useFocusEffect` (`checkTrainingBadge`) on focus. Tip of the Day feature is disabled.

---

## 6. Build Order

1. ✅ Login screen
2. ✅ Database tables
3. ✅ Trainer: Home screen
4. ✅ Trainer: Add client
5. ✅ Trainer: Client profile (4 tabs)
6. ✅ Trainer: Exercise Library (manage + pick modes)
7. ✅ Trainer: Workout Builder
8. ✅ Trainer: Do Mode (partial — in progress)
9. ✅ Trainer: Library tab (Exercises + Workouts + Templates — Templates gallery built, see item 40)
10. ✅ Superset display in Do Mode
11. ✅ Training-level notes (session, exercise, set — all three levels)
12. ✅ Do Mode — peek (hold set number) shows first-session actual data + barbell highlight
13. ✅ Exercise Detail Screen (full-screen exercise view from Do Mode)
14. ✅ Trainer: Client Profile — Progress tab (Measurements + Strength sub-tabs)
15. ✅ Trainer: Client Profile — Sessions tab redesign (active package card, new package flow, close early, history, past packages, total paid)
16. ✅ Trainer: Finance tab (4th bottom nav tab — income overview, bar chart, per-client breakdown, manual entries)
17. ✅ Do Mode — Live mode for supersets (manual activation via SUPERSET tap; auto-advance when active; works in both Do Mode and Exercise Detail)
18. ✅ Auth: Role-based login routing + forced password change screen + trainer set-client-password
19. ✅ Client: App shell — Train, Nutrition, Progress, Me tabs (`app/(client)/(tabs)/`)
19b. ✅ Client: Appointments tab — calendar with status dots, selected date detail, past sessions with filters (`app/(client)/(tabs)/schedule.tsx` + `app/(client)/past-sessions.tsx`)
20. ✅ Session Complete screen + Stretch Complete screen (post-session flows)
21. ✅ Stretch session system (stretching categories, post-workout stretch linking, package exemption)
22. ✅ Workout status system (active / completed, trainer-controlled via ⋯ menu)
23. ✅ Client all-workouts screen — Workouts/Stretching tab, Active/Not Active toggle, Just Added on training tab
24. ✅ Trainer: Schedule tab — time grid, appointment booking, monthly calendar modal, automatic session counting via edge function
24b. ✅ Scheduling v2 — VF logo + move requests badge on all trainer tabs, availability overlay on Schedule, cancel-charged, client availability grid, client move requests, Give Availability wired up
24c. ✅ Availability notifications — client saved slots load on screen open; info note when editing existing availability; trainer notified via `availability_notifications` (new vs updated distinction); saved future weeks shown as chips in Appointments tab; "View schedule" navigates to the exact week
24d. ✅ Scheduling v3 — recurring availability slots, availability submissions (sessions_wanted + note), personal blocks, Day/Week toggle, Plan Week screen, nutritional_advising type, combined time picker (start/end/presets), notes as overlay modal, availability_type on client profile Info tab
28. ✅ Session Intro (pre-session) screen — **client-only** (July 2026). The trainer version was removed; every trainer workout-card tap goes **straight to Do Mode** (not started; trainer presses START manually). Client intro tailors its buttons by context (see item 42).
29. ✅ Do Mode — trainer header redesigned to match client (static combined pill, no scroll-driven fading)
30. ✅ Suspended session system — "Leave for now" back button option saves session to `useSessionStore`; live timer indicators on trainer client profile header, TrainerLogoButton notifications modal, all client tab headers (absolute-positioned timer icon), client home screen pill, nutrition header; "Return" resumes with original timer via `resumeSessionId` + `resumeStartedAt` URL params
31. ✅ Client Training tab + modal simplified — two options only: "Log workout" (faded/disabled if no standalone workouts) and "Log routine" (faded/disabled if no active routine)
32. ✅ Trainer: Plan a workout scheduling flow — two-step picker → schedule modal inserted into the week strip Add Session menu; inserts `sessions` rows with `status='scheduled'`; workout picker shows mini cover cards with green ✓ badge on workouts already done this week
33. ✅ Client All Workouts screen — THIS WEEK label + count (N / goal, amber when exceeded); Workouts/Stretching tab changed to underline style; workout cards sorted by done-this-week with green ✓ badge + ×N repeat count; "NOT DONE THIS WEEK" section divider; same THIS WEEK label on All Routines screen
34. ✅ Client session intro auto-start — tapping "Start session today" on the intro screen navigates directly into active do mode (session timer running, FINISH visible). Trainer has no intro screen (goes straight to Do Mode, not started).
42. ✅ Client pre-session buttons are context-aware + View is always read-only (July 2026) — the intro passes `sessionDate`/`planned`; buttons: **launcher / past** → View session + **Start session today**; **today already done / planned-future** → View session only. Planned session cards on the Training tab are now tappable → View. **"View session" opens a fully read-only Do Mode** (`?viewOnly=1&viewMode=finished|start|none`): no START (a completed session shows a non-clickable `mm:ss · FINISHED` pill; other views show no pill), and nothing editable — done circles, weight/reps, Add Set/camera/timer, set ✓/remove, bar/machine selectors, swipe/reorder, and note add/delete are all disabled. Starting is ONLY ever the "Start session today" button, which always logs a session dated today.
43. ✅ Trainer training notes moved to the ⋯ menu (July 2026) — the trainer Do Mode header (i) button was removed; Training Notes is the first row of the ⋯ centered-modal menu, with a green dot on the ⋯ button when unread — matching the client.
44. ⚠️ **WIP — Do Mode MERGED PREVIEW (client, Push launcher only; July 2026, continuing next session).** The client pre-session screen and Do Mode are merged into one surface: the **real** read-only Do Mode exercise list (supersets, real ExerciseCard, real Info/Play-video) renders inside a **sliding preview panel** built into `app/(client)/workout/[workoutId].tsx` — no separate overlay/replica (the old `SessionStartOverlay.tsx` is orphaned). Flow: **Landing** (panel parked to a bottom peek over a full-screen slideshow photo, "Pull up to review" hint + Start button) → **Review** (drag grip up; expand real cards read-only — toolbar shows Play/Info active, +/camera dimmed) → **Start** fires the lock (panel slides up, banner fades in, handle collapses) into the running session, same list instance. Gated `usePanel = showFixedHeader && previewInitRef.current === true` behind flag `MERGED_PREVIEW`; session-intro redirects launcher Push taps in. All preview animations use the **JS driver only**. Also added: a keyboard **"Done"** bar + focused-input auto-scroll above the keyboard, and expand→scroll-card-to-top. The `FIXED_HEADER` banner (shows the active exercise's photo/name/count, follows the opened card) underlies it. **Still to do:** mirror to the **trainer** Do Mode; wire non-launcher entries (planned/past/view still use the classic pre-session screen); all categories (currently Push-scoped for testing). Field detail in memory [[domode_preview_merge]].
45. ⚠️ **WIP — Category palette + body-silhouette covers (July 2026, continuing next session).** Categories reworked in `lib/workoutCategories.ts`: **added Arms, retired Legs & Recovery** (kept as legacy in the type + `CATEGORY_COLORS`; DB rows migrated Legs→Lower Body, Recovery→Mobility). Distinct palette — Push red · Pull blue · Upper Body purple · Arms orange · Lower Body green · Full Body amber · Core pink · Mobility bronze. **`components/CategoryCover.tsx`** rebuilt: the watermark is a faint **anatomical body silhouette** (`react-native-body-highlighter`) with the category's muscles lit (Mobility = soft all-over glow). Shown on the client Training-tab WORKOUTS gallery + week-strip cards + the **My Workouts** gallery (`all-workouts.tsx` `WorkoutItem`, restructured to cover + **white footer** with Done-date + ⋯). Currently the cover REPLACES a set cover photo on cards (Do Mode header stays photo-first). **Still to do:** photo-as-override hybrid; per-category crop tuning. Field detail in [[category_palette_and_covers]].
35. ✅ Workout/routine quick-look — ⋯ button on client workout cards (all-workouts, routine detail) opens `WorkoutExercisesModal` (exercise list + sets); ⋯ on routine cards opens `RoutineQuickLookModal` (workout list + exercise counts). Trainer side adds "View exercises" as first option in existing ⋯ menus (client profile, all-workouts, routine detail)
36. ✅ Workout card layout update — ⋯ button at top-right corner (28×28 dark circle); done-this-week ✓ badge moved inline next to workout name (16×16 green circle, `nameRow` flex row)
37. ✅ Trainer all-workouts weekly progress — matches client: THIS WEEK X / Y bar, thisWeekCount on each row, section sorting (done first → "NOT DONE THIS WEEK" → rest), ✓ badge inline next to name
38. ✅ Trainer Library Workouts tab + Add Workout picker — Library Workouts filter row swaps Recent/Oldest toggle for a Client dropdown (always most-recent-first sort); "Add workout to this day" opens a new picker screen (`client/[id]/add-workout.tsx`) showing all workouts across clients (Category + Client filters), which schedules the workout on the selected day (deep-copies first when it belongs to another client)
39. ✅ Client Training tab — Workouts & Routines sections replace the two square tiles: a horizontal WORKOUTS gallery of mini cover cards (last-done date, routine icon + routine name for routine-linked workouts, plain done-date for standalone) that lives independently of the week strip, plus a ROUTINES section reusing the My Routines `RoutineCard` (plain white, active routine only)
25. ✅ Trainer: Template Library — see item 40.
40. ✅ Universal workout-creation flow + Template Library + stretch auto-provisioning:
   - **One universal builder.** Library Workouts `+` (both sub-tabs) opens `workout-builder` with no client/mode. Destination is chosen at **Save** via a multi-step `SaveSheet`: **Save as a template** OR **Assign to a client** → Standalone / New routine / Existing routine. Launching with a `clientId` param (client profile / routine detail) opens straight on placement (unchanged behaviour). Removed the old "pick a client first" modal and the `mode=template` fork. Cover photo now works for templates too.
   - **Template Library** — the Templates sub-tab (Library → Workouts) now lists template **workouts** as cover cards (TEMPLATE badge, exercise count, category pill). Tap → loads the template into the builder (`workout-builder?templateId=X`) to review/assign/tweak. ⋯ menu: Use template / Rename / Change Photo / Set Category / Delete. `workout_templates` gained `cover_image_url`, `category`, `stretch_type`. Template save fixed to write `template_sets` (was broken).
   - **Post-workout stretch auto-provisioning (Model A):** keep 3 stretch templates (Upper/Lower/Full). Saving a regular workout with the Post-workout stretch toggle auto-copies the matching stretch template into the client if they don't already have one — it lands in their Stretching tab and the SessionComplete link resolves. Never overwrites an existing per-client stretch.
   - **Trainer Stretching tab:** `app/(trainer)/client/[id]/all-workouts.tsx` gained a Workouts/Stretching switcher so the trainer can see/adjust each client's stretch workouts (previously hidden on the trainer side).
26. Trainer: Measurement entry
27. Shared: Notes, Sessions tab, Calendar
28. ✅ Auth: Forgot password — email reset-link flow via deep link (`forgot-password` + `reset-password` screens)
41. ✅ Client Food Log visual redesign (July 2026) — see **CLAUDE-nutrition.md** for full rules:
   - Removed the green-gradient summary card, the ← date → switcher, the expandable macro/micro bars, the veg/water warning badges, and the bottom water card. Background reverted to `#faf9f7` (matches Training tab).
   - The kcal arc now sits flat and matches the Training gauge exactly (light-green track, solid green fill, amber/red when over).
   - **Macro pips** (always visible): Protein 💪 purple · Carbs 🌾 orange · Fat 🧈 gold — 52px liquid-fill circles that fill with intake ÷ goal; tap → info modal.
   - **Micro pips** (collapsible, default collapsed): Fiber 🥦 · Sugar 🍬 · Salt 🧂 · **Water 💧** (shows litres). Water is display-only; adding water moved into the FAB "+" picker's expandable Water row.
   - **Week strip** mirroring the Training tab (Mo–Su, 34px circles, today-jump button, swipe-only, food-logged dots); the save-day ♥ moved into its header. Meal sections now default **collapsed**.
42. ✅ Client Training tab weekly gauge — **reverted to per-workout pips + message (July 2026)**: the single big liquid-fill pip was reverted back to the row of small per-workout pips (done = green with 🏋️, tappable to the single-workout overlay; bonus = amber; empty = grey) plus a motivation message line below (tap → "Trainings done" overlay). The old `bigPip` style is left unused for easy re-switch. The arc + DONE/LEFT/BONUS + celebration are unchanged. See CLAUDE.md → "WeeklyGaugeCard — client".
43. ✅ Client Training tab — **add/plan-training button & flow (July 2026)**: a day-contextual add affordance under the gauge is the primary way to add training (Option A — replaced an earlier floating FAB that overlapped the workout cards; the add action is day-specific): a filled-green "Log/Plan training" pill when the day has no session, shrinking to a small green `+` circle when it already has one. The day strip keeps a circle around the number (selected day = bright accent green; today keeps a dimmed accent ring whenever it isn't the selected day, as a persistent "today" cue), and the small week-strip `+` glyph + "No workout logged" text were removed. The button opens a day-aware modal — **today** = Log workout/Log routine (perform in Do Mode); **any other day** = Plan workout/Plan routine, which schedules a `scheduled` session on that day without performing (only today can be physically trained). Planned sessions show as outline dots + a "PLANNED" card in the strip. Open lifecycle question: how a planned session is later "performed"/cleared. See CLAUDE.md → "WeeklyGaugeCard — client".
44. ✅ Trainer client-profile Training view — **parity with the client Training tab (July 2026)**: replaced the two square WORKOUTS/ROUTINES tiles with the client-style horizontal WORKOUTS gallery + ROUTINES `RoutineCard` section (ported verbatim from `train.tsx`, wrapped in a `-16` full-bleed so the gallery reaches the screen edge). Week strip brought to the client's look: green ellipse day pills, always-visible green `+` circle, a "This week / Next week" label (dropped `'s training`), a working calendar icon ("Jump to date" month modal), and a today button when viewing another week. Recent Activity + Trainer Note unchanged. See CLAUDE.md → "Training tab — Workouts & Routines sections (trainer)" and "Week strip — trainer".

### Deferred improvements
- **MuscleThumb sub-region highlighting:** current `react-native-body-highlighter` library has only one SVG path per muscle group (e.g. `chest` is a single path — no upper/mid/lower split). To show "Upper Chest" darker than the rest, the library needs to be replaced or forked. Options: (a) fork `react-native-body-highlighter` and split the chest/back paths into sub-paths with new slug IDs (~5–10h); (b) build a fully custom `react-native-svg` body map with granular paths (~20–30h). Can be swapped as a TestFlight update without blocking any other work — `MuscleThumb` is fully isolated.

---

## 7. Screen Map & Navigation

**This is an index, not a spec.** Every screen's layout, styling and behaviour lives in the companion named in the Detail column — those describe what is actually built, and **where they disagree with anything here, the companion wins.** The full pre-July-30 §7 prose (190k bytes of per-screen detail, much of it duplicated and some of it stale) is archived verbatim in **CLAUDE-history.md → "Archived July 30 2026 — SPEC.md §7"**; go there for a screen whose companion coverage looks thin, or for the original intent behind a design.

Data models, DB columns and RLS live in **§5 Data Models** (in this file) and in **CLAUDE.md §4**.

### TRAINER SCREENS

Bottom navigation: **Clients | Schedule | Library | Finance | Account**

| Screen | File | Detail in |
|---|---|---|
| Clients | `app/(trainer)/(tabs)/clients.tsx` | CLAUDE-screens.md |
| Add Client | `app/(trainer)/add-client.tsx` | CLAUDE-screens.md |
| Schedule | `app/(trainer)/(tabs)/schedule.tsx` | **CLAUDE-schedule.md** |
| Plan Week | `app/(trainer)/plan-week.tsx` | **CLAUDE-schedule.md** |
| Client Profile (5 tabs) | `app/(trainer)/client/[id]/index.tsx` | CLAUDE-screens.md |
| ├ Progress tab | `app/(trainer)/client/[id]/progress-tab.tsx` | CLAUDE-screens.md · loading rules in CLAUDE-infra.md |
| └ Nutrition tab | `app/(trainer)/client/[id]/nutrition-tab.tsx` | **CLAUDE-nutrition.md** |
| Workout Builder | `app/(trainer)/workout-builder.tsx` | CLAUDE.md §4 (creation flow) · crash draft in CLAUDE-infra.md |
| Workouts Library picker | `app/(trainer)/client/[id]/add-workout.tsx` | CLAUDE.md §8 |
| Workout Picker | `app/(trainer)/workout-picker.tsx` | CLAUDE.md §8 |
| All Workouts (per client) | `app/(trainer)/client/[id]/all-workouts.tsx` | CLAUDE.md §4 |
| All Routines (per client) | `app/(trainer)/client/[id]/all-routines.tsx` | CLAUDE.md §4 |
| Routine detail | `app/(trainer)/client/[id]/routine/[routineId].tsx` | CLAUDE.md §4 |
| **Do Mode** | `app/(trainer)/client/[id]/workout/[workoutId].tsx` | **CLAUDE-domode.md** |
| Exercise Detail | `app/(trainer)/client/[id]/workout/exercise-detail.tsx` | **CLAUDE-domode.md §7** |
| Session Complete | `app/(trainer)/client/[id]/workout/session-complete.tsx` | **CLAUDE-domode.md** |
| Stretch Complete | `app/(trainer)/client/[id]/workout/stretch-complete.tsx` | **CLAUDE-domode.md** |
| Library (Workouts·Templates·Exercises·Foods·Nutrition·Recipes) | `app/(trainer)/(tabs)/library.tsx` | CLAUDE.md §8 · **CLAUDE-nutrition.md** for the nutrition sub-tabs |
| Exercise builder | `app/(trainer)/add-exercise.tsx` | CLAUDE.md §4 (media uploads) + §8 (muscle picker) |
| Exercise Library picker | `app/(trainer)/exercise-library.tsx` | CLAUDE.md §8 |
| Recipe Create | `app/(trainer)/recipe-create.tsx` | **CLAUDE-nutrition.md** |
| Finance | `app/(trainer)/(tabs)/finance.tsx` | CLAUDE-screens.md §11 |
| All Invoices | `app/(trainer)/all-invoices.tsx` | CLAUDE-screens.md §15 |
| Invoice detail + print preview | `app/(trainer)/invoice/[invoiceId].tsx` | CLAUDE-screens.md §15 |
| Account | `app/(trainer)/(tabs)/account.tsx` | CLAUDE-screens.md §14 |

### CLIENT SCREENS

Home is standalone (no bottom nav). The **Train area** carries the bottom navigation: **Training · Appointments · Progress · Nutrition · Me**.

| Screen | File | Detail in |
|---|---|---|
| Home | `app/(client)/index.tsx` | CLAUDE-screens.md |
| Overview | `app/(client)/(tabs)/overview.tsx` | CLAUDE-screens.md |
| Training tab | `app/(client)/(tabs)/train/index.tsx` | CLAUDE-screens.md (WeeklyGaugeCard, week strip, ROUTINE section) |
| My Workouts | `app/(client)/(tabs)/train/all-workouts.tsx` | CLAUDE.md §4 |
| My Routines | `app/(client)/(tabs)/train/all-routines.tsx` | CLAUDE.md §4 |
| Routine detail | `app/(client)/routine/[routineId].tsx` | CLAUDE.md §4 |
| **Do Mode** (incl. the merged pre-session preview) | `app/(client)/workout/[workoutId].tsx` | **CLAUDE-domode.md** |
| Exercise Detail | `app/(client)/workout/exercise-detail.tsx` | **CLAUDE-domode.md §7** |
| Session Complete | `app/(client)/workout/session-complete.tsx` | **CLAUDE-domode.md** |
| Stretch Complete | `app/(client)/workout/stretch-complete.tsx` | **CLAUDE-domode.md** |
| Appointments | `app/(client)/(tabs)/schedule.tsx` | CLAUDE-screens.md |
| Past Sessions | `app/(client)/past-sessions.tsx` | CLAUDE-screens.md |
| My Availability | `app/(client)/availability.tsx` | **CLAUDE-schedule.md** · crash draft in CLAUDE-infra.md |
| Progress tab | `app/(client)/(tabs)/progress.tsx` | 31-line wrapper around the shared `progress-tab.tsx` — CLAUDE-screens.md |
| Nutrition area | `app/(client)/nutrition/` — `index` (Food Log) · `favourites` · `tips` · `recipes` · `recommendations` · `weekly` · `grocery-list` | **CLAUDE-nutrition.md** |
| Recipe detail / create | `app/(client)/recipe/[id].tsx` · `app/(client)/recipe/create.tsx` | **CLAUDE-nutrition.md** |
| Meal detail | `app/(client)/meal/[id].tsx` | **CLAUDE-nutrition.md** |
| Me | `app/(client)/(tabs)/me.tsx` | CLAUDE-screens.md |

### AUTH & SHARED

| Screen | File | Detail in |
|---|---|---|
| Login | `app/(auth)/login.tsx` | CLAUDE-screens.md §16 |
| Signup | `app/(auth)/signup.tsx` | CLAUDE-screens.md §16 |
| Forgot / Reset Password | `app/(auth)/forgot-password.tsx` · `app/(auth)/reset-password.tsx` | CLAUDE-screens.md §16 · memory `forgot_password_flow` |
| Change Password | `app/change-password.tsx` | CLAUDE-screens.md §16 |
| Root layout (routing, OTA, outbox flush, route restore) | `app/_layout.tsx` | **CLAUDE-infra.md** |

**Post-login routing** (`app/_layout.tsx`): `AuthContext.passwordRecovery` → reset screen · `must_change_password === true` → change-password · `role === 'client'` → `/(client)` · else `/(trainer)`. On launch the remembered route is restored instead of the landing screen — see CLAUDE-infra.md "Route restore".

### DELETED — do not recreate

- **`app/(client)/workout/session-intro.tsx`** (deleted July 26 2026). The merged Do Mode preview is the **only** client pre-session screen; every planned/past/launcher entry routes into `/(client)/workout/<id>` with params. Never build a separate pre-session screen. → CLAUDE-domode.md, memory `domode_preview_merge`.
- **`app/(tabs)/`** — the legacy duplicate route group (`index`, `me`, `progress`, `nutrition`, `two`, `all-workouts`, `all-routines`, `routine/[routineId]`, `workout/[id]`). Dead code; the live client app never routes to it. Do not edit it, and do not treat it as a reference.


## 8. Status Card Logic

**Data sourced from `fetchClientTraining()` in `lib/clientTraining.ts`:**
- `lastSessionDate`, `lastSessionWorkoutId`, `lastSessionWorkoutName`, `lastSessionRoutineName`, `lastSessionCategory`
- `nextUpWorkout`, `nextUpPosition`, `routineTotal`, `activeRoutine`
- `monthlySessionCount`, `daysSinceLastSession`, `totalSessionsCount`

**LAST DONE row:**
- No session logged → name shows "—", subtitle "Start a session to track your progress", not tappable
- Session logged, standalone → name = workout name, subtitle = formatted date (e.g. "5 May 2026")
- Session logged, from routine → name = workout name, subtitle = "from [Routine Name] · [date]"
- Tapping → navigates to Do Mode for `lastSessionWorkoutId`

**NEXT UP row:**
- Active routine exists → name = `nextUpWorkout.name`, subtitle = "[Category · ] Workout [nextUpPosition] of [routineTotal] in [routine.name]"
- No active routine → dimmed row "No active routine" + "+ Create →" link (no navigation)
- Tapping → navigates to Do Mode for `nextUpWorkout.id`

**Next workout determination:**
- Never done → sorted first by `order_index`
- Done → sorted by oldest `lastSessionDate` (most overdue first)

**Stats row:**
- THIS MONTH: `monthlySessionCount` (sessions in current calendar month)
- SINCE LAST: `daysSinceLastSession` as integer days, or "—" if no sessions
- SESSIONS: `totalSessionsCount` (all completed sessions)

**Package warning:**
- Shown when `activePackage.total_sessions - activePackage.sessions_used <= 2`

---

## 9. Session Flow

1. Open workout → check for different order last session → show popup if needed
2. Pre-fill weights from most recent session logs
3. Tap START → timer begins, Session created (in_progress)
4. Log weights + reps, mark exercises done
5. Tap FINISH → confirmation → Session saved (completed) → navigate to client Training tab
6. Duration null if no timer

Last weight memory: cross-workout pre-fill — query all `workout_exercise_ids` for the exercise across all workouts, then intersect with the last 50 completed sessions for this client to get the most recent weight+reps per set number. For cable/machine exercises, pre-fill is brand-specific: keyed by `${exerciseId}:${machineBrand}`, with a fallback to null-brand (legacy sessions saved before brand tracking). Non-machine exercises use a null-brand key. Default machine brand assumed to be 'Gym80' when not yet set for the exercise in the current session.

Peek data: query ALL completed sessions for this workout ordered oldest-first, fetch their session_logs (including barbell_weight_used_kg). For each exercise+set, keep the oldest non-null value — this is the "first session" data shown on peek. Per-exercise: keep the oldest barbell_weight_used_kg for the bar highlight.

Trend data: computed alongside peek data from the same `allSessAscData` query. Compare the two most recent completed sessions (N-1 vs N-2) per exercise+set_number. If N-1 weight > N-2 → `prefillTrendWeight: 'up'`; if less → `'down'`; if equal → `'same'`; if either session missing data → `null`. Same logic for reps (`prefillTrendReps`). Stored on `SessionSet` and carried through the bridge to `BridgedSet`. Used only to color the pre-filled text; cleared when the user edits the value.

---

## 10. Exercise Slot Tracking

- Every exercise has a permanent slot number visible on collapsed row
- original_exercise_id never changes after first completed session
- current_exercise_id updates on permanent replacements
- slot_replacement_history tracks all swaps with dates, session numbers, is_permanent flag
- slot_order_history tracks all reorders — automatic (is_permanent=false) and deliberate (is_permanent=true)
- Before first completed session: all changes are silent edits, no tracking
- After first completed session: all deviations tracked and displayed
- Pre-session popup shown when last session order differed from slot numbers

---

## 11. Notes System

Three levels — all stored in the `notes` table with `level` (training | exercise | set) and `reference_id`:

**Training-level notes (session scope):**
- Accessed via the note icon (note.text) in the Do Mode header
- White dot indicator on the icon when notes exist — disappears once the modal has been opened (per-session, not persisted)
- White centered modal titled "Session Notes"
- Two sections: TRAINER NOTE (green label) + CLIENT NOTE (grey label)
- Each note is a dated entry; newest first within the current session
- Notes are deletable individually
- **History section:** A read-only "PREVIOUS SESSIONS" section appears at the top of the modal showing all past completed sessions' notes grouped by session date (oldest first), before the current session's editable sections
- Pre-session popup: if the last completed session had training-level notes, a popup shows them on workout open (before the order mismatch popup)
- reference_id = session_id

**Exercise-level notes:**
- Accessed via the **Info button** in the expanded action row (no `(i)` on the collapsed name row)
- Info button shows a green dot badge when notes or changes exist; dot clears when Info is opened
- White centered modal (ExerciseInfoModal): coaching cues (read-only) + TRAINER NOTES + CLIENT NOTES + CHANGES & HISTORY + "See history →" + "See progress →"
- reference_id = workout_exercise_id

**Set-level notes:**
- Accessed by tapping the set number on each set row in the expanded exercise (the (i) button has been removed)
- Set number is dark green (#244e43) when a note exists; grey (#999) when no note
- Bounce animation fires once on set row mount (i.e. when card is expanded) when a note exists
- White centered modal: TRAINER NOTE section (green label) + CLIENT NOTE section (grey label) + "See history →" button at the bottom
- reference_id = workout_set_id (from workout_sets table)

**Adding notes — single input, role-based placement:**
- There is a single "Add note" input (not separate trainer/client inputs)
- For trainers: the input appears below the TRAINER NOTE section
- For clients: the input appears below the CLIENT NOTE section
- The logged-in user's role determines which array (trainerNotes / clientNotes) the note is saved to

**Deleting notes — soft-delete:**
- Tapping X on a note soft-deletes it: the note dims (opacity 0.4) and the text gets a strikethrough. The X turns green.
- Tapping the green X again restores the note (toggles the soft-delete off)
- Permanently deleted from the `notes` DB table only when the session is saved (saveSession)
- Notes that were never persisted to DB and then soft-deleted are simply skipped at save time
- Notes soft-deleted in Exercise Detail are tracked in the bridge (`_pendingNoteDeletes` Set); `flushPendingNoteDeletes()` is called during `saveSession`

**Persistence rules:**
- Notes are inserted to the `notes` table immediately on add (optimistic UI)
- `persistedTrainingNoteIdsRef`, `persistedExerciseNoteIdsRef`, `persistedSetNoteIdsRef` track which IDs are confirmed in DB
- Delete only calls DB if the ID is in the persisted set
- `saveSession` contains a safety net that inserts any unpersisted notes to DB on session complete
- Training notes added before session starts are queued in state and inserted on `saveSession` with the new session_id

**Loading on workout open:**
- Exercise and set notes: fetched from `notes` table by `workout_exercise_id`s and `workout_set_id`s and applied to `exercises` state before render
- Training note history: fetched for all recent completed session IDs in parallel with prefill logs
- In-progress session training notes: loaded separately and put into the editable current-session state

All note popups use white centered modal style.

---

## 12. Exercise Library — Picker Mode

Used in Workout Builder and Do Mode when adding exercises:
- A-Z / Recent toggle at top
- No keyboard auto-focus
- Search bar (keyboard only opens on tap)
- Body part + Equipment filters

---

## 13. Supersets

- Minimum 2 exercises
- Drag as one unit in Workout Builder
- Same visual style everywhere — Workout Builder and Do Mode

**Visual frame style (V2 — current):**
- No teal bar, no per-card borders, no frame caps. "SUPERSET" label row (no background) above the first card — dark green #244e43, 12px, weight 700.
- "SUPERSET" label is a tappable button — three states: normal / pulsing (active) / dimmed `opacity:0.35` (paused). No separate "live" text.
- Each superset card shows a "SUPERSET" label in the group card header (no per-exercise SS pill or `(i)` button in the collapsed name row).
- Between cards: a 10px "+" connector strip (dark green "+" centered on warm background). In edit mode: plain 6px gap (no "+"). No top/bottom caps.
- In Exercise Detail: tappable "SUPERSET" label also appears above the sets rows in the sets section header (`detailSetsLabelRow`). Same three visual states.

**Live mode:**
- **Manual activation only** — tap the "SUPERSET" label. No auto-activation on typing or checkmarks.
- First tap activates (pulsing). Second tap pauses (dimmed). Third tap resumes. All done → deactivates.
- Live mode state: `liveGroupIds` (pulsing vs paused) + `liveGroupIdsTriggered` (visible vs hidden) in Do Mode; synced to bridge for Exercise Detail
- Bridge: Exercise Detail calls `invokeLiveToggle` for both first activation and subsequent toggles; Do Mode's `registerOnLiveToggle` handler uses the same first-activation-or-toggle logic

**Superset checkmark cascade:**
- Checkmarking exercise N → auto-checkmarks all previous exercises in the group
- When all exercises done → live hidden

---

## 14. Session Packages

- One active per client at a time (enforced by UI — not a DB unique constraint)
- **`sessions_used` is NOT incremented in Do Mode** — the `count-completed-sessions` edge function (pg_cron, every 15 min) handles this by marking completed `pt_session` appointments and incrementing the active package. Exception: `cancelled_charged` action in the Schedule tab increments `sessions_used` immediately.
- Amber warning shown on status card and in Sessions tab when ≤2 sessions remaining
- Trainer assigns packages manually via + New package flow in Sessions tab
- Three types with standard durations: Quick 40 (40 min), Standard 60 (60 min), Extended 75 (75 min)
- Three sizes: 6, 12, 20 sessions
- Default prices stored in `package_defaults` table (9 rows: 3 types × 3 sizes); pre-filled in the new package modal, editable before saving
- Close early: sets `status = 'completed'` AND `status_closed_early = true`; UI shows "Closed" (grey) vs "Done" (teal) pill in past-packages list

**Package validity:**
- Default validity calculated automatically from activation date based on package size:
  - 6 sessions → 6 months
  - 12 sessions → 9 months
  - 20 sessions → 12 months
- `expires_at` is set automatically when a package is activated using the above defaults
- Trainer can override `expires_at` when assigning the package (editable date field in the new package modal)
- Nothing auto-happens on expiry — package stays active until manually closed by trainer
- **Expiry warning (amber):** shown when `expires_at` is within 30 days — visible in trainer Sessions tab active package card

---

## 15. Weight Calculation

- Barbell: (per side × 2) + bar = total. Bar: 15kg / 20kg / Custom
- Dumbbell/kettlebell: × 2
- Machine/cable/bodyweight: no calculation

**Peek (long press any set number):** long pressing any set number activates peek mode on ALL set rows simultaneously — each showing the actual weight and reps from the first completed session for that set. Yellow background on KG, REPS, TOTAL, and set number across all rows. For barbell exercises, the matching bar button also highlights yellow. Data source is `session_logs`. If no first-session data exists, shows —. Dismisses on release.

---

## 16. Workout Cover Images

- Set in Workout Builder via image picker, or changed any time after creation via the ⋯ menu → Change Photo on any workout card (trainer only)
- Upload: `expo-image-picker` (16:9 crop, quality 0.85) → `arrayBuffer()` → `workout-covers` Supabase bucket with `upsert: true` → DB update + local state refresh
- Stored in `workout-covers` Supabase storage bucket (public)
- Used as full bleed header background in Do Mode with a dark `rgba(0,0,0,0.35)→0.65` gradient overlay
- Gradient fallback (no cover image): 3-stop dark green `#2d6b5a → #244e43 → #1a3832`, top-right to bottom-left

**Cover card visual spec (Library, All Workouts, Routine detail):**
- Height: 100px · borderRadius 14 · `overflow:'hidden'`
- Background: cover photo (`resizeMode="cover"`) or category gradient
- Gradient overlay: `transparent → rgba(0,0,0,0.1) → rgba(0,0,0,0.6)` bottom-to-top for text legibility
- **⋯ button:** `position:'absolute', top:9, right:10` — trainer only, never rendered on client screens
- **Name:** `fontSize:14, fontWeight:'600', color:'#fff'` — bottom-left
- **Subtitle** (date / routine): `fontSize:10, color:'rgba(255,255,255,0.65)'` — bottom-left below name
- **Category pill:** `position` in bottom-right of the bottom row; `backgroundColor: CATEGORY_COLORS[category].border`; white text 9px/700; `borderRadius:100`; no border, no transparency. Only shown when category is set.

---

## 17. Session Photos

- Added per exercise during a session in Do Mode (camera button in expanded row) or in Exercise Detail Screen ("Add photo" button below sets)
- Stored in `session-photos` Supabase storage bucket (public)
- Saved to `session_exercise_photos` table with `session_id` + `workout_exercise_id` (session_id kept for reference)
- Require in_progress session — hard block dialog (custom white centered modal) in Do Mode; same custom white modal in Exercise Detail
- **Persist permanently on the exercise across all sessions** — loaded by `workout_exercise_id` with no session filter, so photos accumulate like notes and are never lost when a new session starts
- Do Mode loads all exercise photos on initial `load()` call (querying all `workout_exercise_id`s in the workout at once), not only when a session exists
- Camera icon shown next to (i) on collapsed row when photo exists (Do Mode); same presence indicator in Exercise Detail info card name row (no touch handler — indicator only)
- Tap thumbnail → white centered peek modal, image fills edge to edge with rounded corners
- **Delete photo:** trash icon button in peek modal top-right corner. Closes peek modal → `confirmModal` "Delete photo?" (red "Delete" + "Cancel"). On confirm: deletes `session_exercise_photos` row by `photo_url`, removes file from `session-photos` storage, updates local state + bridge. Available on both trainer and client sides.

**Real-time sync between Do Mode and Exercise Detail:**
- Both screens share `exercisePhotos` state, kept in sync via `lib/doModeBridge.ts`
- Bridge has **two independent callback slots**: `registerOnPhotosChangedDoMode` (registered by Do Mode) and `registerOnPhotosChangedDetail` (registered by Exercise Detail) — `notifyPhotosChanged` fires both simultaneously so neither screen overwrites the other's listener
- When either screen uploads a photo: computes the updated URL array from `exercisePhotosRef.current`, calls `setState` and `notifyPhotosChanged` separately (never inside the setState updater)
- Exercise Detail's `loadPhotos` (called on mount and `useFocusEffect`) merges DB results with existing in-memory state using `Set` dedup, so an in-flight upload is never lost by a stale DB read
- `exercisePhotosRef` maintained in both screens (assigned synchronously in component body each render) for stale-closure-free access in async upload handlers

---

## 18. Phase Plan

See §6 for the detailed numbered build order (all completed items marked ✅). Remaining work:

### Still to build
- [x] Template Library (§6 items 25 & 40) — universal builder + Templates gallery + stretch auto-provisioning, done 2026-07-07
- [x] Forgot password flow (§6 item 28) — email reset-link deep-link flow, done 2026-07-06
- [ ] Floating session pill — global overlay showing active session timer, visible on all screens; tap returns to session
- [ ] Rest timer local notification — fires when client leaves app during rest; client Do Mode only
- [ ] Auth flows — first-login onboarding

### Google Calendar — deferred (Next Session widget)

The Edge Function `calendar-next-session` is deployed and working. OAuth credentials exist in Google Cloud (project: Vitek Fitness). **Blocker:** every token from OAuth Playground returns `invalid_grant`.

**Best approach when returning:**
1. Run a simple local Node.js script on localhost:3000 for the OAuth flow
2. Or use `gcloud auth` to generate credentials directly
3. Then: `npx supabase secrets set GOOGLE_REFRESH_TOKEN=xxx --project-ref iwtfhmbolhoivpzufprr`

The trainer note and session highlights widgets are already built — only the Next Session row needs this token.

### Phase 2
- German localisation, push notifications, meal plan builder
- **Optional:** Live Activities on iOS (rest timer on lock screen / Dynamic Island) — only if Expo support has matured enough

### Phase 3
- PDF reports, in-app messaging, web version

---

## 19. Development Rules for Claude Code

- TypeScript strict, Expo Router, Supabase RLS
- All strings in `i18n/en.ts`, SLOGANS array
- NO difficulty field, NO auto-recalculation, NO estimated durations, NO calories
- Individual WorkoutSet rows — never single sets×reps field
- Last weight memory: cross-workout pre-fill — query last 50 completed sessions, most recent weight per exercise+set
- Session: in_progress on Start, completed on Complete, duration null if no timer
- Exercise slot tracking: silent before first completion, full tracking after
- Supersets (V4 — current): all exercises in a group share **one card** (`exCardOuter/exCardInner`). "SUPERSET" label (12px/700, `#244e43`) in the group card header — tappable, three states: normal / pulsing (active live mode) / dimmed `opacity:0.35` (paused). No SS pill on collapsed rows. Between members: centered "+" (`SymbolView name="plus"`, size 14) in a 20px row. V1 backup preserved in `SUPERSET_V1_BACKUP` comment in both Do Mode files.
- **Live mode (superset):** `liveGroupIds` Set in Do Mode; `setBridgeLiveGroupIds(next)` called on every toggle and auto-stop to keep bridge in sync; `isBridgeLiveGroup(groupId)` read in Exercise Detail's `toggleSetDone`. Never call bridge notify callbacks inside a setState updater.
- **Bridge notify rule:** `notifySetsChanged`, `notifyCheckChanged`, `notifyPhotosChanged` — always call OUTSIDE setState updaters. Pre-compute next state from ref, then call `setState(next)` and `notifyXxx(...)` as separate statements.
- Exercise Library: manage mode vs pick mode, A-Z/Recent toggle, no keyboard auto-focus
- Status card: always visible, tappable, navigates to Do Mode
- Training tab + button: 3 options — New Workout / From Template / Start Free Session (white centered modal)
- Routine card + button: 4 options — New Workout / From Workouts / From Template / Start Free Session (white centered modal)
- Start Free Session → `workout/free` param — Do Mode handles via `isFreeSession = workoutId === 'free'`
- `sessions.workout_id` is nullable; `sessions.name TEXT` column exists — both required for free session support
- Client profile tab bar: no white card or profile strip between header and tabs — tab bar background is #faf9f7, tab bar sits directly below the dark green header
- Save: as Workout / as Routine (auto-name editable) / add to existing Routine
- Background #faf9f7 (client **and** trainer, unified July 2026), cards #ffffff, borders #e8e8e4, header #244e43, accent #24ac88
- Cover images: arrayBuffer() for upload (not blob()), stored in workout-covers bucket
- Session photos: arrayBuffer() for upload, stored in session-photos bucket, requires in_progress session
- Client: 4 tabs (Training · Appointments · Progress · Me) in `/(client)/(tabs)/`, plus standalone home screen at `/(client)/index.tsx` (no tab bar). The Nutrition entry card on the home screen routes to `/(client)/nutrition/` (separate stack — Food Log · Favourites · Weekly · Grocery; Tips tab hidden `href:null`). The `/(client)/(tabs)/` area itself has no Nutrition tab.
- Trainer: 5 tabs (Clients · Schedule · Library · Finance · Account) — all live
- Info tab: trainer-only, never shown to client
- Do Mode header: full bleed, cover image or gradient, collapses on scroll (see CLAUDE.md §5 for full architecture). `HEADER_MAX = SCREEN_HEIGHT × 0.38`, `HEADER_MIN = Math.max(insets.top + 50, 82)`. Exercise cards (V4): two-layer `exCardOuter` (shadow, no overflow) + `exCardInner` (overflow:hidden, clips content), `borderRadius:16, marginHorizontal:14, marginBottom:10`.
- Exercise rows in Do Mode: collapsed default, inline expand, circle checkmark, + and ⇄ between cards
- Notes: three levels (training/exercise/set), stored in `notes` table, reference_id = session_id / workout_exercise_id / workout_set_id respectively
- Notes inserted to DB immediately on add; persistedXxxNoteIdsRef tracks confirmed IDs; saveSession has safety net for unpersisted notes
- Training note history: loaded from last 10 completed sessions on workout open; shown read-only in "PREVIOUS SESSIONS" section at top of training notes modal
- Exercise (i) bounce: fires once on first card expansion when notes exist (not on mount)
- Set (i) bounce: fires once on InlineSetRow mount (fires when card is expanded)
- Training notes accessed from the **⋯ menu** (Training Notes is the first row) — the old expanded-header (i) button was removed (July 2026), matching the client. A green dot shows on the ⋯ button (and on the Training Notes row) when notes are unread; it clears once the modal is opened (`trainingNotesViewed` flag, resets each load).
- Pre-session popups: notes popup first (if last session had training notes) → order mismatch popup second (only shown after notes popup dismissed)
- All popups and info panels: white centered modal — NEVER dark glass bottom sheet
- All confirmation/soft-prompt dialogs: custom confirmModal pattern — NEVER native Alert.alert (error-only single-button alerts are fine)
- Weight display: KG bold dark, REPS light grey, TOTAL read-only auto-calculated
- Bar selector for barbell exercises: 15kg / 20kg / Custom. Selected bar weight saved as barbell_weight_used_kg in session_logs on every save.
- Long press set number (250ms) → peek ALL sets simultaneously: yellow background on KG, REPS, TOTAL, set number across all rows. Shows first-session actual weight/reps per set. For barbell exercises, the bar button matching the first session is also highlighted yellow. Falls back to current bar selection if barbell_weight_used_kg was never recorded. No highlight if first session had no data.
- ⋯ menu on workout cards (trainer only, never shown to clients): Rename / Change Photo / Add to Routine / Set Category / Post-workout Stretch / Mark as done or Reactivate / Delete
- **Category color system** (`lib/workoutCategories.ts`): `WorkoutCategory` union type (9 values), `CATEGORY_OPTIONS` array, `CATEGORY_COLORS` record with `border` (left stripe), `pillBg`, `pillText` per category. Always import from this file — never hardcode category colors inline.
- **Category left border stripe**: 3px wide `View` with `alignSelf: 'stretch'` (not `height: '100%'`) so it spans the full height of multi-line rows in flex containers
- **Status card** (`app/(trainer)/client/[id]/index.tsx`): `StatusCard` component with `scStyles` StyleSheet. `ProgressRing` component for routine card (SVG arc). `StatusProgressRing` component for NEXT UP row inside the dark card (white-bg arc). Data from `fetchClientTraining()` in `lib/clientTraining.ts`.
- **`fetchClientTraining` returns**: `lastSessionDate/WorkoutId/WorkoutName/RoutineName/Category`, `nextUpWorkout`, `nextUpPosition` (1-indexed), `routineTotal`, `monthlySessionCount`, `daysSinceLastSession` (integer days), `totalSessionsCount` (completed sessions only)
- Checkmark and photo upload require in_progress session — hard block dialog if not started
- Soft prompt ("Start workout?") for weights/notes/exercises before START
- Toast reminder when interacting with exercise N while N-1 has data but not checkmarked
- Pre-session popup when last session order differed from programmed slot order
- Progress tab (client profile): `app/(trainer)/client/[id]/progress-tab.tsx` — two sub-tabs (Body composition / Strength)
  - **Body composition sub-tab:** 6 metric selector tabs (2×3 grid — Weight, Fat %, Muscle, Water, Visceral, BMR). Tapping a tab shows a `ZoneBarCard` (or plain graph if no zone data). Each metric card contains a zone bar with tappable segments (inline tooltip shows full label + numeric range), a zone graph (SVG, Y-axis labels at every zone boundary, coloured band backgrounds), optional sub-tabs for Fat (Fat%/Fat kg/Muscle%/Muscle kg) and Water (Total%/ICW kg/ECW/TBW), goal editing (stored in `client_goals` table), and body silhouette (Fat and Muscle metrics only — tappable segment cards). History list with swipe-delete. Add measurement form with all fields including ICW/ECW/ECW_TBW (ECW/TBW auto-computes when ICW and ECW are both entered).
  - **Zone system:** `ZoneKey` type covers 11 variants. Fat/muscle/water zones require sex to be set. Fat/muscle zones are age-bracketed (18–39/40–59/60+). Zone tooltip state resets on metric or sub-tab change via React key pattern.
  - **Strength sub-tab:** exercise search, tap to view progression graph (same SVG style), compare mode overlaying two exercises with green + amber lines
- All single-value data entry rows outside Do Mode use tappable row → centered white popup modal (never inline TextInput). Reference: `InfoTab` in `index.tsx`, `infoFieldStyles` StyleSheet, `fieldModal`/`fieldDraft` state. `InputAccessoryView` (iOS) suppresses system keyboard Done toolbar. Do Mode weight/reps inputs are the only exception.

---

## 20. Free Session

A free session is a session with no pre-built workout. Started from the + button on the client Training tab or from the + button on any routine detail screen.

**Route:** `/(trainer)/client/[clientId]/workout/free` — reuses Do Mode (`[workoutId].tsx`). The string `"free"` is passed as the `workoutId` param. Do Mode detects this via `isFreeSession = workoutId === 'free'`.

**Behaviour:**
- Opens Do Mode in a blank state — no exercises pre-loaded
- Timer starts automatically — no START confirmation needed (auto-starts via `useEffect` after load completes, guarded by `freeAutoStarted` ref to prevent double-fire)
- Session created immediately with `status = 'in_progress'`, `workout_id = null`, `name = freeSessionName`
- Session name shown in header is a `TouchableOpacity` with a pencil icon — tapping opens a white centered modal to rename it
- Default name: `"Free Session · [D Month YYYY]"` (e.g. "Free Session · 9 May 2026")
- Floating green **+** circle button (bottom-right, 56px, ACCENT) is always visible — tapping it opens the exercise library picker to add an exercise at the end of the list
- Empty state shown when no exercises: icon + "No exercises yet" + "Tap + to add exercises"
- All Do Mode features available: exercise notes, set notes, session notes, photos, supersets, swipe gestures, edit mode, rest timer
- On finish → saved as a completed session, `status = 'completed'`
- Counts toward the client's active session package (`sessions_used + 1`)
- Appears in the status card as "Last done: [name] · [date]"
- Appears in session history like any other session
- `workout_id = null` — free sessions are never linked to a workout record
- If exercises were added during the session they are saved to session_logs as normal
- If no exercises were added, session saves with empty log — this is valid
- `sessions.workout_id` is nullable (NOT NULL constraint removed via migration)
- `sessions.name TEXT` column stores the session name for free sessions (null for regular sessions)

---

## 21. Assistant Layer (Phase 2)

**Floating assistant button:**
- Persistent floating button (bottom right, accent green #24ac88) visible on every screen, above all navigation
- Tap → slides up a ¾ height overlay — does not navigate away
- Dismiss by swiping down or tapping the dimmed area — returns to the exact screen and state
- Overlay shows: today's sessions (time + client name), reminders/tasks, quick reminder capture field
- "Full view →" link navigates to the Schedule tab

**Reminders table (add to Supabase when building this feature):**
```
id, trainer_id, client_id (nullable), content, remind_at (nullable), done (boolean), created_at
```

**Notifications (Phase 2):**
- Morning briefing: sessions today, clients with ≤2 package sessions remaining, clients inactive 2+ weeks
- Evening check-in: any sessions not yet logged today
- Uses expo-notifications — add minimum config entries when building

---

*Read this document at the start of every Claude Code session before writing any code.*
