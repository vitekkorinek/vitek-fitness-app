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
- **Rollout:** ✅ **entire client side done** — main tabs + 5 training sub-screens + all client nutrition (Food Log / Favourites / Weekly / Grocery → `NativeTabs`; headers → `LightHeader`; recipe detail/create + meal editor as `(client)` stack routes). The **Workouts / Routines "See all" lists keep the native bottom bar** — the Training tab is a nested-stack folder (`(tabs)/train/index.tsx` + `train/all-workouts.tsx` + `train/all-routines.tsx` + `train/_layout.tsx` Stack), so those two lists are pushable screens *inside* the tab (bar stays); opening a workout (session-intro/Do Mode, `(client)` stack routes above the tabs) hides it. ✅ **Trainer bottom bar → `NativeTabs`** (5 triggers, ACCENT-green tint) + `useTabBarHeight()` bottom padding across all 5 tab screens. ✅ **Trainer client-detail header → `LightHeader solid`** with a pinned **underline** main-tab switcher + `GlassToggle` sub-tabs (see Client Profile below). ⏳ **Next: migrate the 5 trainer tab-screen headers** (clients/schedule/library/finance/account) to `LightHeader`, then retire `FloatingTabBar`. Do Mode / Exercise Detail / Session Intro / client Home keep their own designs.
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
created_at
```
Trainer-defined foods curated for clients. RLS: trainer can read/write own rows (`trainer_id = auth.uid()`); all authenticated users can SELECT. `portions` stores named portion sizes (e.g. `[{label:'serving',grams:150},{label:'piece',grams:50},{label:'can',grams:400}]`) — 100g is always implicit. Photos stored in `trainer-foods` Supabase bucket (public). `source = 'trainer'`, `source_id = id` when logged to `food_log_entries`. Searched via `name` and `name_de`. Appear in food search ranked first (score 1100, above custom=1000 and USDA/OFF). Identified in search results by VFIcon badge (dark green, size 13).

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
Client-saved "favourite" food days. Shown as pink heart dots on the calendar picker; the week-strip heart in the Food Log fills (light-green `heart.fill`) when the selected day is saved. Loading a favourite day replays all its food entries (`snapshot_json`) into the current selected date. RLS: `client_manage_own_favourite_days` (`client_id = auth.uid()`, ALL). **The table was created July 2026** — it had previously been referenced by the Food Log save-day code but never actually created, so saving a day failed silently (the row never persisted and no heart dot appeared), the same class of bug as `water_logs`.

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

### TRAINER SCREENS

#### Bottom navigation: Clients | Schedule | Library | Finance | Account

---

#### Auth routing (post-login) ✅
- **Password recovery takes priority:** when `AuthContext.passwordRecovery` is true (set by a reset-password deep link), the root router forces `/(auth)/reset-password` regardless of session/role. Cleared after the password is updated.
- `role === 'trainer'` → navigate to `/(trainer)/(tabs)/clients`
- `role === 'client'` + `must_change_password === true` → navigate to `/change-password`
- `role === 'client'` + `must_change_password === false` → navigate to `/(client)` (home screen)

#### Login screen (`app/(auth)/login.tsx`) ✅
- Identifier (email or username) + password fields; username resolved to email via `lookup_user_email` RPC.
- Password field has a **show/hide eye toggle** (`eye` / `eye.slash` SF Symbol via `SymbolView`, right-aligned inside the field). Same eye-toggle pattern is used on `signup.tsx`, `reset-password.tsx`, and inside the `change-password.tsx` field modal.
- "Forgot password?" link → `/(auth)/forgot-password`.

#### Change Password screen (`app/change-password.tsx`) ✅
- Forced screen for clients on first login (or after trainer resets their password)
- Dark green header, "Set your password" title, no back button
- Two tappable rows (New password · Confirm password) → white centered modal per field. The field modal's input has an eye toggle (`showDraft` state).
- Green filled pill "Save password" button
- On save: `supabase.auth.updateUser({ password })`, sets `must_change_password = false`, navigates to `/(tabs)`

#### Forgot / Reset Password flow (`app/(auth)/forgot-password.tsx` + `app/(auth)/reset-password.tsx`) ✅
- **Forgot Password screen:** email field → `supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/reset-password') })` → shows a "check your email" confirmation. `redirectTo` resolves to `vitekfitnessapp://reset-password`.
- **Deep-link recovery handling (`context/AuthContext.tsx`):** the client is configured with `detectSessionInUrl: false`, so a `Linking` listener (+ `getInitialURL` for cold start) catches the recovery link, parses the tokens from the URL **fragment** (`#access_token=…&refresh_token=…&type=recovery`), calls `supabase.auth.setSession(...)`, and flips `passwordRecovery = true`. Exposes `passwordRecovery` + `clearPasswordRecovery()` on the auth context.
- **Reset Password screen:** new-password + confirm fields (eye toggle, min 8 chars, must match) → `supabase.auth.updateUser({ password })` → `clearPasswordRecovery()` lets normal routing send the user into the app. If the link is expired/invalid (no recovery session), shows a "Link expired → back to login" state.
- **Required external config:** `vitekfitnessapp://reset-password` (and `vitekfitnessapp://*`) must be in the Supabase project's **Authentication → URL Configuration → Redirect URLs** allow-list, or GoTrue ignores `redirectTo` and falls back to the Site URL. App scheme is `vitekfitnessapp` (app.json).

#### Clients screen ✅
- Dark green header, "Hi Vitek", client list
- Individual white cards per client, **sorted alphabetically by name** (not by recency)
- **Last-active label** ("2 days ago" / date): counts **completed sessions only** (`sessions.status = 'completed'`) — scheduled/future, in_progress and skipped sessions must never become the "last session". Amber dot + amber text if inactive 2+ weeks.
- **Package usage pill** (shown when the client has an `active` `session_packages` row): dumbbell icon + `used/total used` (e.g. "8/12 used"). Green normally; turns **amber** (`#f5a623`) when `remaining <= 2 && remaining > 0` — matching the low-sessions warning elsewhere.
- **This-week appointment pill** (shown when the client has ≥1 upcoming `scheduled` appointment): calendar icon + next appointment (e.g. "Wed 9 Jul · 09:00"), with a green `+N` when more appointments fall in that same week (the calendar week of the next appointment). Tapping the pill opens a white centered modal listing all of that week's appointments (full weekday + time + type), with a Done pill. The pill's tap does not trigger card navigation.
- Tap card → Client Profile

---

#### Schedule screen ✅ (`app/(trainer)/(tabs)/schedule.tsx`)

Dark green header: **VF logo left** (TrainerLogoButton — tappable, shows Notifications modal with red badge when pending move requests or availability notifications exist) · "Schedule" centered · plain white `+` right → opens new appointment sheet.

**`weekStart` URL param:** optional (YYYY-MM-DD). When navigated from a TrainerLogoButton availability notification, `useLocalSearchParams` reads this param and a `useEffect` computes the week offset from today's Monday, calling `setWeekOffset` to jump to that week automatically.

**Week strip** — an **edge-to-edge white info bar** (no floating card — the whole calendar from under the app header to the grid is one continuous white surface) — **the single day/week control (redesigned July 2026, no Day/Week toggle button):**
- **Two-row header**: **tappable** week label (`fontSize:17/700`, `textAlign:'center'`) on its own top row · second row: session count (accent green, `fontSize:12/600`) left + today button + calendar icon right
- "This week" label on current week; date range on other weeks (e.g. "8–14 Jun"). **Tapping the week label** → `selectedIdx = null` → **Week view** (all 7 days); the label turns ACCENT while in week view.
- **Today button** — 26×26 dark green circle showing today's date number — visible only when `weekOffset !== 0`. Tapping snaps back to today's week and selects today (Day view).
- **Calendar icon** — opens monthly calendar modal
- **Pencil icon** (`square.and.pencil`, `marginTop:-2` to optically align with the calendar icon) — opens the Plan Week screen. Replaced the former `sparkles` icon.
- **Day numbers are NOT in this card** — they moved into an **attached day header** on top of the grid (Google-calendar style, so days line up with the grid columns). The card holds only the week label + count + icons.
- Swipe left/right on the card or the attached header (PanResponder) to navigate weeks (works in both day and week views).

**Attached day header** (`ah` styles, edge-to-edge, sits flush on top of the grid): a `LABEL_W` gutter + 7 Mon–Sun cells (weekday label + a circle around the date number + an ACCENT dot below days with appointments). Selected day = **ACCENT circle** around the number (not a heavy filled cell); today-not-selected = ACCENT number. Tap a day → **Day view** of that day; tap the selected day again (or the card's week-label title) → **Week view**.

**Day vs Week view** — driven entirely by `selectedIdx: number | null` (no toggle button). A number → **Day view** (single-column time grid, default today). `null` → **Week view** = a 7-column Mon–Sun grid (`WeekView`). Both grids are **edge-to-edge** (no rounded card) so they connect to the attached header; `WEEK_LABEL_W = LABEL_W = 44` keeps the week columns aligned with the header cells. There is only ONE Mo–Su row (the attached header) — no duplicate.

**Day-view paging (July 2026):** in Day view you can **swipe left/right to move to the next/previous day** (the header-strip date follows); it wraps across weeks. On Schedule this replaced the day-card swipe-to-confirm / swipe-to-delete shortcuts (still available in the appointment view sheet). Same on the Planning day view.

**Time grid** (white card, `flex:1`, scrollable):
- Full 24-hour day, `HOUR_H = 44px` per hour → 1056px total scrollable height
- **Working hours 08:00–20:15**: white background. **Off-hours**: `#f5f5f3` tinted background, muted labels
- On mount scrolls to 08:00 (offset `8 × 44 − 8 = 344px`) via `onLayout`
- Hour labels (9px, `#bbb`) right-aligned in 44px left column. 0.5px lines at each hour; 0.5px half-lines at :30
- Tapping top half of an hour row → new appointment pre-filled at :00; bottom half → :30
- **Current time red line** (`height:1.5, #e85d4a`) with 7px dot on the left — shown only on today, updates every minute
- **Gap indicators** between consecutive appointments ≥30 min apart: italic `#ccc` text centered (e.g. "1h 30m free")

**Appointment cards** (absolutely positioned over grid):
- `left: LABEL_W + 4, right: 8`, `borderRadius: 8`, `borderLeftWidth: 3`
- `top = startMinutes / 60 × HOUR_H`; `height = max(42, durationMinutes / 60 × HOUR_H)`
- Color per client from `client_colors` table. Auto-assigned from `COLOR_POOL` on first save.
- Guest appointments always: `borderLeftColor: '#f5a623'`, `backgroundColor: '#fdf3e8'`
- Registered clients: `borderLeftColor: clientColor`, `backgroundColor: rgba(clientColor, 0.10)`
- Card text: name 12px/600, type + time 10px muted
- **Confirmed badge:** `checkmark.circle.fill` SF Symbol, size 13, ACCENT, `position:'absolute', top:4, right:4` — shown when `is_confirmed = true`
- **Gestures (see CLAUDE.md §9 for implementation detail):**
  - Tap → View/edit/confirm/delete sheet
  - Long press (400ms) + vibrate → drag mode (reorder within day)
  - Swipe right ≥60px → toggle `is_confirmed`; inserts `client_notifications` row when confirming a registered client
  - Swipe left ≥60px → white centered delete confirmation modal

**Drag to move (day view) — container-owned + edge-paging (Google-calendar style, July 2026):**
- Long-press a card starts the drag; a ghost follows the finger (lifted above it). The gesture is owned by the **day-grid container** (not the card), so it survives day-changes.
- **Edge-paging:** while dragging, move your finger near the left/right edge of the grid and the day flips to the previous/next day (either direction, wrapping across weeks; a short haptic tick per flip, ~1s cadence so it doesn't race through days); the header-strip date follows. Keep dragging and drop on the new day.
- On release it **opens the appointment sheet pre-filled with the new day + time** (the "setup window") — confirm via Save / Save & send / Save as draft. Moving a draft lets you keep it a draft or send it; moving a sent appt updates silently. Same on the Planning screen.
- ScrollView scroll disabled during drag, re-enabled on release.

**Drag to move (week view) — cross-day (July 2026):** long-press a week-view card → drag it across day columns + times; a ghost follows the finger. On release it computes the target day column + snapped time and **opens the edit sheet pre-filled with the new day + time** (same setup-window confirmation). Works on both the Schedule week view and the Planning week grid. Because the drop opens the sheet, an imprecise landing is easy to correct before saving.

**`COLOR_POOL`** = `['#24ac88','#4a90d9','#9b59b6','#e67e22','#e74c3c','#1abc9c','#3498db','#f39c12']`

**New appointment sheet** (slides up from bottom, white, `borderRadius:20` top):
- Drag handle at top. Drag-to-dismiss via PanResponder.
- **Type switcher**: PT Session · Nutrition · Block — Type 1 pill row, `HEADER` bg + white text when active. `trial` and `consultation` are removed from UI (legacy DB values only). "Nutrition" = `nutritional_advising` in DB. "Block" saves to `schedule_blocks` table, not `appointments`.
- **Client field** (PT Session + Nutrition only): tappable row opens white centered modal with scrollable client list. Block type shows a label TextInput instead.
- **DATE + TIME row**: DATE tappable → **calendar month-grid picker** (‹ Month Year ›, Mo–Su, tap a day; selected = ACCENT circle, today = ACCENT number) — replaced the raw YYYY-MM-DD text field. TIME tappable → combined time picker modal: START + END TextInputs (auto-calc) + 4 duration preset pills. Same calendar picker is used in the Planning sheet.
- **Notes** (non-block only): tappable row → white centered modal with multiline TextInput.
- **Save buttons:** a **new** PT/Nutrition appointment offers **"Save & send"** (creates it + notifies the client) and **"Save as draft"** (creates it unsent — `sent_to_client=false`, client can't see it). Block type and editing keep a single **"Save."** (Same as the Planning sheet.)
- On save: upsert `client_colors` if new client color needed; insert/update `appointments` (or `schedule_blocks` for Block type)
- **Draft appointments on the grid** render dashed + dimmed (" · Unsent" in the day card), in both day and week views.

**View/edit/confirm/delete sheet** (slides up from bottom):
- Shows appointment name, type, duration, date, time, notes
- **Draft (unsent) appointments** show an amber "Not sent to the client yet" note + a green **"Send to client"** button (marks sent + notifies), and hide the Confirm / Cancel-charged actions (those only apply once sent).
- **Edit** (outline ACCENT) + **Delete** (outline red) in a row
- **Cancel — client pays** (outline red, below the Edit/Delete row) — only shown for non-guest appointments not already cancelled_charged. White centered confirmation. On confirm: sets `status = 'cancelled_charged'`, increments `sessions_used + 1` on client's active package, auto-completes package if `sessions_used >= total_sessions`.
- **Confirm appointment** / **✓ Confirmed** — full-width pill. ACCENT green when unconfirmed; HEADER dark green when confirmed. Toggles `is_confirmed`; sends `client_notifications` on first confirm for registered clients.
- Delete → white centered confirm modal → delete row entirely (no package impact)

**`cancelled_charged` appointments on the grid:**
- Red left border `#e85d4a`, light red background `#fdf0f0`
- Small "CANCELLED" label in red below client name
- Remains visible on the grid (not deleted)

**Monthly calendar — inline month view** (redesigned July 2026):
- **An inline third mode of the Schedule content, not a modal.** The app header stays; the calendar icon swaps the area below it (the week strip + grid) for a month view — so where "This week" was, you now see the month. A light month bar shows **X** (closes, returns to week/day view) · centered **‹ Month Year ›** month nav. Mo–Su labels, then the month grid.
- **The grid fills the content area** (each week row splits the height evenly — no dead space, correctly sized cells). Each day cell shows that day's appointments as small solid colour chips (client first name, in the client's colour, readable text; unsent drafts dimmed), up to 4 with a `+N more` line; today's number in an accent circle; hairline day/row borders like Google Calendar.
- Tapping a day: returns to the day view for that day (navigates the week strip to that week + selects the day), landing scrolled to the working-hours start (08:00), not 00:00.
- Fetches fresh appointment data (grouped per day) when opened and on month change.

**Availability overlay** — removed from the Schedule tab. Availability is now always visible in the **Plan Week** screen (`app/(trainer)/plan-week.tsx`), which is reached via the pencil icon (`square.and.pencil`) in the Schedule week strip header. The Schedule tab itself no longer shows availability slots.

**Plan Week screen — redesigned July 2026 (mirrors the Schedule layout).** The scheduling/planning surface where the trainer places clients into open slots based on submitted availability. Full **7-column Mon–Sun** grid (Vitek sometimes trains weekends), uniform white, with darker working-hours boundary lines at **08:00** and the day's end (**20:15**, but **19:00 on Fridays**). **Same structure as the Schedule tab:** dark header bar with a **back chevron** (left) and a static **"Planning"** title (center, empty right) → an **edge-to-edge white info bar** (centered tappable week title "This week"/range → returns to week view; below it a row with a **"<N>/<M> scheduled"** count on the **left** — scheduled/requested totals across all clients — and a **person (`person.2.fill`) icon on the right** that opens the client menu, mirroring Schedule's session-count + icons row) → the attached Mo–Su day header (doubling as the day selector) → the grid. See the Phase 2 note below.
- **Availability is shown as collapsed initial-chips, not a wall of per-slot name tags.** Each client's contiguous free time merges into one block per day, drawn as a thin colored track + a small initial chip (client color; 2 letters only when two clients share a first initial). Tapping a chip opens a **"Who's free" popup** listing everyone available around that time (with scheduled/requested counts and any message), each with a **Book** button.
- **Client menu (burger, redesigned July 2026):** the top client-pill strip was removed (too messy above the header). Clients now live behind a **burger icon (`line.3.horizontal`) in the top-right of the dark header**, which opens a white centered modal listing each client (submitters first) with a color dot, name, optional note, and **booked / requested** count (requested defaults to 1 whenever a client gave availability; "—" when they submitted nothing; count turns ACCENT when met). Tapping a client filters availability to just them (a light-green "Showing <Name> only · Show all ✕" bar appears under the header); a "Show all clients" row clears it. Every client gets a distinct color even before being booked; booking persists that color to match the Schedule tab.
- Every client gets a distinct color even before being booked; booking persists that color so it matches the Schedule tab.
- Week-specific availability correctly overrides a client's recurring pattern (fixes an earlier duplicate-name bug).
- The consecutive-days warning banner is dismissible. **Suggest schedule** / **Apply all** auto-placement is retained.
- **Phase 2 (done July 2026) — single Mo–Su strip drives day vs week (no toggle) + drag-to-move.** No Day/Week toggle button; the one Mo–Su header (attached to the grid) is the control. State `selectedDayIdx: number | null` — `null` → **Week view** (7-column overview, the default) with no day highlighted; a number → that day's **Day view** (single wide column, taller rows `DAY_HOUR_H = 64`). Tapping a day column enters Day view (day highlighted dark-green); tapping the selected day again — or the header title — returns to week view. Day view has full drag-to-move: long-press an appointment → drag (container-owned so it survives day-changes) with edge-paging; **release opens the appointment sheet pre-filled with the new day + time** (setup-window confirmation — see "Drag to move (day view)" above), not a silent commit. Tapping an appointment opens its **send/delete sheet** (draft → "Send to client"/Delete; sent → "Sent ✓"); tapping an empty half-hour cell opens the New Appointment sheet pre-filled. Availability initial-chips, suggestions, block cards, and the now-line all render for the selected day too.
- **Week swipe:** the Planning screen now navigates weeks by swiping the info bar / day header left–right (like the Schedule tab). Swiping also clears any pending suggestions.
- **Draft appointments + send flow (July 2026).** Appointments created on Planning default to **drafts** (`appointments.sent_to_client = false`, no client notification) so the trainer can rearrange privately. **The New Appointment sheet (opened by the header "+", an empty-cell tap, or "Book" in the who's-free popup) offers two buttons: "Save & send"** (marks it sent + notifies the client immediately) **and "Save as draft."** "Apply all" for suggestions always creates drafts. Draft cards render **dashed + dimmed** (with an "Unsent" tag in day view). Tapping a card opens a small sheet: a draft shows **"Send to client"** + **Delete**; an already-sent one shows "Sent to client ✓". The bottom bar shows **"Suggest schedule" + "Send all (N)"** (sends every draft this week, **dimmed when N = 0**); while suggestions are on the grid it shows **"Discard" + "Apply all (N)"** so there's always a way out. Clients never see drafts (all client appointment queries filter `sent_to_client = true`), and the session-counting edge function ignores them.
- The tappable week title has an **underline affordance** (grey normally, ACCENT when in week view) so it reads as tappable — same on the Schedule tab.
- **Still to build (next session):** **Phase 3** — pinch-to-zoom on the grid (adjust `HOUR_H`/`DAY_HOUR_H`). Rollout is staged; each phase is tested on TestFlight before the next.

**`date` URL param (deep-link from client profile):** `useLocalSearchParams<{ date?: string }>()` reads an optional `date` (YYYY-MM-DD). A `useEffect` computes the week offset from that date's Monday (relative to today's Monday) and sets `selectedIdx` to the day, so the grid jumps to the exact week + day. Used when the trainer taps an appointment row in the client profile "THIS WEEK'S SESSIONS" card.

**New appointment sheet** receives optional `prefillClientId` (used by Plan Week when tapping a client availability slot).

**Automatic session counting — edge function** (`supabase/functions/count-completed-sessions/`):
- Deployed, `verify_jwt: false`
- pg_cron job ID 1 runs every 15 minutes
- Finds `status = 'scheduled'`, `type = 'pt_session'`, non-null `client_id` appointments whose `date + start_time + duration_minutes` end time has passed
- Marks each `status = 'completed'`; increments `sessions_used` on the client's active package; auto-completes package when `sessions_used >= total_sessions`
- **`sessions_used` is NOT incremented in Do Mode** (that code was removed from both trainer and client `saveSession` flows)

#### Add Client ✅
- Name, username, email, temp password
- must_change_password = true

---

#### Client Profile (5 tabs)

**Layout:**
- **Header = `LightHeader solid`** (July 2026 — migrated from the old dark-green `SafeAreaView` bar): back chevron left · client name centred · **+ button right** (plain green `+`). Opaque (`solid`) because the dense week-strip ghosted through the translucent glass. `StatusBar dark-content`, root bg #faf9f7. Session-timer indicator lives in the header `overlay` slot. The + opens an **"Add Session"** slide-up `BottomSheet` (mirrors the week-strip + menu, defaults every action to **today**): Create new workout · Add workout to this day (→ Workouts Library picker, date=today) · Plan a workout (shared `PlanWorkoutFlow`, scheduled to today) · Continue routine (if an active routine exists) · Start Free Session.
- **Tab nav = a pinned `TabPillSwitcher`** (**Training / Sessions / Nutrition / Progress / Info**) sitting just below the solid header on #faf9f7; tab content scrolls under it. **Sessions is its own top-level tab** (July 2026 — the old Training/Sessions toggle inside the Training tab was removed). Default tab on open: **Training**.
- **Main tabs = a plain UNDERLINE switcher** (July 2026 round-3): active tab = accent-green text (#24ac88) + 2px accent underline under the label, inactive = black. (Briefly a sliding Liquid-Glass pill; removed as too heavy for a 5-item primary row.)
- **Sub-tab switchers (Nutrition Planning/Overview, Progress Body-composition/Strength) = a `GlassToggle`** — a compact segmented switcher with a faint frosted track + a sliding **real Liquid Glass** pill (frosted-white fallback off iOS 26). Two-level hierarchy: underline = primary, glass toggle = secondary. **Trainer side only** — the client-side Progress screen keeps its underline sub-switcher (`variant="client"`).

---

##### Training tab

The training tab contains programme content. **(July 2026: Sessions is now its own top-level tab — the old Training | Sessions segmented control inside this tab was removed; `SessionsTab` renders directly at `activeTab === 'sessions'`.)**

---

**Training view (default) — layout order:**
1. Week strip (days pill row + session card(s))
2. Green `+` add-training circle
3. WORKOUTS gallery (horizontal cover cards)
4. ROUTINES section (active routine `RoutineCard`)
5. Recent Activity section
6. Trainer Note widget

> **July 2026 — parity with the client Training tab.** The old two-tile row (Workouts + Routines) was replaced by the horizontal WORKOUTS gallery + ROUTINES `RoutineCard` section (mirroring `app/(client)/(tabs)/train.tsx`), and the week strip was aligned to the client's look (green ellipse day pills, always-visible green `+` circle, functional calendar icon, today button, and a "This week / Next week" label without the `'s training` suffix).

**Week strip:**
- First element in the Training view. Header left: week label — **"This week" / "Last week" / "Next week"** (current/adjacent weeks) or a date range. Days row has **no ‹/› arrows** (removed to give the days more space) — week navigation is swipe-only.
- **Header right actions:** when viewing a non-current week (`weekOffset !== 0`), a **today button** (small solid-ACCENT circle with today's date number) jumps back to today's week + selects today; then a **calendar icon** opens a **"Jump to date" month modal** (days with a completed session marked by a `dumbbell.fill` dot; tapping any day jumps the strip to that week/day). Both mirror the client side.
- **Days row:** each day is a **green ellipse pill** wrapping the weekday label + number — selected day = solid ACCENT pill (white text), today (unselected) = ACCENT-green text (no background). Session dot below: filled ACCENT = completed, outline ACCENT = planned/scheduled.
- **Add affordance:** an always-visible centered **green `+` circle** (40×40, matches the client) below the session card(s) — not an empty-only state. Tapping opens a modal with five options:
  - **Create new workout** (`square.and.pencil` icon) → Workout Builder
  - **Add workout to this day** (`plus.rectangle.on.rectangle` icon) → `/(trainer)/client/${clientId}/add-workout?date=${selectedDate}` (the **Add Workout picker** — see below)
  - **Plan a workout** (`calendar` icon) → two-step scheduling flow (see below)
  - **Continue routine** (`arrow.triangle.2.circlepath` icon) → `/(trainer)/client/${clientId}/routine/${activeRoutine.id}` — shown whenever `activeRoutine` exists (not gated by `nextUpWorkout`)
  - **Start Free Session** (`timer` icon, ACCENT color) → `/(trainer)/client/${clientId}/workout/free`

**Plan a workout flow (trainer):**
- **Step 1 — Workout picker:** white centered modal showing all client's active non-stretching workouts as 70px cover cards (photo or category gradient + bottom vignette). Green ✓ badge (20px ACCENT circle, top-right) on workouts that already have a completed session in the current week. Tapping a card advances to step 2.
- **Step 2 — Schedule:** shows workout name, date navigation (‹ date › with 1-day increments), "Repeat weekly" custom toggle (ACCENT when on). When repeat is on: DOW pills (Mo–Su, pre-filled from the chosen date's day of week; selecting a different day updates the date to the next occurrence of that day); "End after" switcher (No end | Weeks) + stepper (1–52) when Weeks is selected. "No end" = 52 occurrences inserted.
- **Save:** inserts one `sessions` row per occurrence with `status='scheduled'`, `workout_id`, `client_id`, `date`. Dates are the chosen date + N×7 days (one week apart). Reloads the week strip via `loadStripSessions()`.
- The two-step flow is the extracted **`PlanWorkoutFlow`** component (module-level in `client/[id]/index.tsx`), shared by both the **week-strip +** and the **header + "Add Session"** menu (its state used to be duplicated inside `WeekStripCard` — that copy was removed). Props: `clientId`, `initialDate`, `onClose`, `onDone` (the caller's reload — `onReloadStrip`/`loadAll`). Mounting it opens it.

**Workouts Library picker (`app/(trainer)/client/[id]/add-workout.tsx`):**
- Full screen reached from the "Add workout to this day" option. Query params: `id` (clientId), `date` (the selected day). Dark-green header showing **"Workouts Library"** (renamed from "Add Workout", July 2026) + the formatted day.
- **Workouts / Templates sub-tabs** (Type 1 pill switcher at top).
  - **Workouts tab:** **Category** + **Client** dropdowns (default "All Clients") + search, always most-recent first. **All workouts across all clients** (`created_by = profile.id`, includes stretching). Client is shown as a `person.fill` pill (top-left of each cover card, first name); the subtitle is the last-done date ("Not yet done" fallback). Shared 100px cover cards.
  - **Templates tab:** Category dropdown + search only (no Client filter). Lists the trainer's `workout_templates` as cover cards with a "TEMPLATE" badge + exercise count.
- **On tap (opens the builder in edit mode — no longer instant-schedules, July 2026):** a **workout** → `router.replace('/(trainer)/workout-builder?clientId=${id}&editWorkoutId=${w.id}&scheduleDate=${date}')`; a **template** → `…?clientId=${id}&templateId=${t.id}&scheduleDate=${date}`. The builder loads it with set rows pre-filled from the client's last-performed weight/reps, the trainer reviews/tweaks, and **Save** saves to the library **and** schedules a `sessions` row on `date`. `router.replace` (not push) so the builder's post-save `router.back()` returns to the client profile, not this picker. (The old `copyWorkoutToClient()` instant-copy path was removed — copying another client's workout into this client now happens inside the builder's update-in-place-vs-copy logic; see Workout Builder below.)
- The trainer client-profile week strip reloads on focus (`WeekStripCard` uses `useFocusEffect`), so the newly-scheduled session shows on return.

**Session card ⋯ menu (trainer — both scheduled and completed sessions):**
- `ellipsis` SF Symbol button right-aligned in the highlights area of the session card (below the cover image).
- **Scheduled session menu options:** Edit workout (→ Workout Builder) · Move training · Delete
- **Completed session menu options:** Move training · Delete
- **Move training:** opens a calendar picker modal (white centered, same design as client side). Month navigation ‹/›. Days with existing completed sessions for this client show a `dumbbell.fill` icon below the day number. The current session date is highlighted ACCENT green (disabled). Tapping any other day selects it (dark green `HEADER` circle) and shows a confirmation bar: "Move to [Weekday, D Mon]?" + ACCENT "Move" pill. Navigating months clears the selection. Move updates `sessions.date`. The workout itself is never affected — only the calendar record.
- **Delete:** custom `confirmModal` pattern — "Delete session?" · "This removes the session from the calendar. The workout is not deleted." · red "Delete" pill · grey Cancel link. Deletes the `sessions` row only.
- Implementation note: the `ScheduledSessionMenu` modal is hidden (`!moveDateModal`) while the calendar is open to prevent two stacked native modals from blocking touches.

**WORKOUTS gallery + ROUTINES section (below the `+` circle):**
- Replaced the old two-tile row (July 2026). Both mirror the client Training tab and are ported verbatim from `app/(client)/(tabs)/train.tsx` (`sectionStyles`, `rcStyles`, `qlStyles`, `formatRoutinePeriod`, `RoutineCard`, `RoutineQuickLookModal`). Wrapped in a `marginHorizontal:-16` full-bleed container so the gallery reaches the screen edge despite the tab's `padding:16`.
- **WORKOUTS gallery:** 🏋️ + "Workouts" header + chevron → `all-workouts`. Horizontal row of 180px cover cards (cover/gradient, name, category pill, routine name if linked, "Done D Mon" / "Never done"), fetched client-scoped and sorted most-recently-done first. Tap → trainer Do Mode directly (`/(trainer)/client/[id]/workout/<id>` — the trainer pre-session screen was removed, July 2026); card ⋯ → `SessionDetailsSheet`. Dashed "See all N" card at the row end.
- **ROUTINES section:** routine icon + "Routines" header + chevron → `all-routines`. Shows the active routine as a `RoutineCard` (progress ring + program strips), built from `fetchClientTraining` data (no extra query). Tap → `routine/${id}`; card ⋯ → `RoutineQuickLookModal`. No active routine → "No active routine".

**Recent Activity section:**
- Label "RECENT ACTIVITY" with `marginTop: 20`.
- Single 70px cover card: cover photo (from `lastSessionCoverImageUrl` sourced via sessions join — reliable regardless of standalone workout limit) or category gradient fallback. Name bottom-left, subtitle below name showing "Standalone · D Mon" or "from [Routine Name] · D Mon" (date appended inline). Category pill + ⋯ menu bottom-right (trainer only). Cover image URL fetched via `sessions` join (`cover_image_url` added to sessions select in `fetchClientTraining`).
- Empty state: "No sessions logged yet"

**Trainer Note widget (below Recent Activity):**
- White card, label "TRAINER NOTE" + "Edit" button top right. `marginTop: 16`.
- Free text sticky note — persists between sessions, one per client
- Italic style text, muted "Updated [date]" below
- If empty → shows "+ Add note" prompt
- Stored in `overview_note` field on `users` table

**⋯ menu on workout cards (trainer only — never shown to clients):**
- Rename — inline edit
- Change Photo — image picker → upload to `workout-covers` bucket → updates card immediately
- Add to Routine — pick from client's active routines
- Set Category — pick from category list
- Delete — confirmation dialog, removes from client only

---

**Sessions view:**

**This Week's Sessions card (top of Sessions view):**
- Label "THIS WEEK'S SESSIONS"
- White card listing **all** the client's `scheduled` appointments for the current calendar week (Mon–Sun), pulled from the in-app `appointments` table (`client_id`, `status='scheduled'`, `date` within this week), ordered by date then start time
- Each row: friendly day label (Today / Tomorrow / Yesterday / e.g. "Wednesday 9 Jul") + "HH:MM · [type]" subtitle (type via `apptTypeLabel`), separated by hairline dividers
- **Rows are tappable** → navigate to the Schedule tab via `/(trainer)/(tabs)/schedule?date=YYYY-MM-DD`, which jumps the week strip to that week and selects that day so the appointment is shown in place. `chevron.right` on the right of each row.
- Empty state → "No sessions this week" + muted calendar icon
- Refreshes via `useFocusEffect` (so booking/moving an appointment updates it on return)
- No longer uses the Google Calendar `calendar-next-session` edge function

**Active package card** (shown when a package with `status = 'active'` exists):
- Package name (e.g. "Standard 60 · 12 sessions")
- "Assigned [date] · €[price]" in muted grey
- "Valid until [date]" in muted grey (shown when `expires_at` is set)
- Circular progress ring (ACCENT filled arc, shows sessions used / total)
- ACCENT progress bar below ring
- "X used · Y remaining" labels — remaining count shown in amber (#EF9F27)
- Amber warning row when ≤2 sessions remaining: "⚠ X sessions remaining"
- Amber warning row when ≤30 days until `expires_at`: "Expires in X days"
- Two action buttons: **Close early** (grey outlined) and **+ New package** (dark green #244e43 filled)

**Close early flow:**
- Opens white centered modal: "Close package early?" with message + red "Close package" button + grey Cancel text link
- Sets `status = 'completed'` AND `status_closed_early = true` so the past-packages list shows "Closed" (grey pill) vs "Done" (teal pill)

**+ New package flow (3-step white centered modal):**
1. **Type** — vertical column of full-width buttons: Quick 40 / Standard 60 / Extended 75
2. **Size** — pill row: 6 / 12 / 20 sessions
3. **Price** — pre-filled from `package_defaults` table for that type+size combination, editable by trainer
4. **Valid until** — tappable date row below price, pre-filled from auto-calculation (6 sessions → +6 months, 12 → +9 months, 20 → +12 months from today). Tap opens a white centered modal with a text input (YYYY-MM-DD). Updates automatically when size selection changes.
- Saving inserts new `session_packages` row with `status = 'active'` and `expires_at`; if a package was already active, marks it `status = 'completed'` first

**Session history:**
- Last 3 completed sessions listed below the active package card
- Each row: workout name (or "Free session"), date, duration
- "See all sessions →" link opens all-sessions modal (white centered modal scrollable list)

**Past packages list:**
- All non-active packages ordered newest first
- Each row: package name, activated date, pill — "Done" (teal, `status_closed_early = false`) or "Closed" (grey, `status_closed_early = true`)

**Total paid card:**
- Summed `price_eur` of all `session_packages` for this client that have a non-null price — displayed at the bottom of the view

**Session counting:**
- `sessions_used` is **not** incremented in Do Mode. It is incremented by the `count-completed-sessions` edge function, which runs every 15 minutes via pg_cron (job ID 1). The function finds all `pt_session` appointments with `status = 'scheduled'` whose end time has passed, marks them `completed`, and increments `sessions_used` on the client's active package. If `sessions_used >= total_sessions`, package status auto-advances to `'completed'`.

---

##### Nutrition tab

File: `app/(trainer)/client/[id]/nutrition-tab.tsx`

Two sub-tabs: **Planning** | **Overview**

**Planning sub-tab layout (top to bottom):**

1. **Macro + Calories card** — standalone white card. Calories shown as a large 38px bold number (tappable to edit via modal). A dark-green draggable bar below the number lets the trainer drag to set calories (range 500–6000 kcal; labels at 0/3000/6000 for reference). Below the calories bar, three macro rows (Protein / Carbs / Fat) each showing: name · percentage (colored) · grams · g/kg (if recent weight is available). Each row has a full-width draggable colored bar with a thumb circle — dragging changes that macro's percentage while the other two auto-balance proportionally (minimum 5%, maximum 90% per macro). Tapping a macro stats row opens a modal to type a percentage directly. When calories changes, grams are recalculated from the existing percentages automatically. Amber BMR warning shown below calories bar when calorie target is below the client's calculated BMR.

2. **Calculate targets button** — full-width outlined pill (accent border, accent text). Opens a two-step white centered modal:
   - Step 1: editable inputs — Weight (from most recent measurement, tappable to override), Height (tappable to edit, saves to `users.height_cm`), Age (read-only from DOB), Sex (tappable picker, saves to `users.sex`), Activity level (tappable picker, saves to `users.activity_level`), Goal (tappable picker, saves to `users.goal`). Calculate button disabled until all fields filled.
   - Step 2: results showing BMR (Mifflin-St Jeor), TDEE × activity multiplier, goal adjustment, suggested calories + protein/carbs/fat. "Use these values" applies all four macros + calories at once.

3. **Daily limits card** — Water target · Fiber (min) · Sugar (max) · Salt (max). All tappable rows → modal with number input.

4. **Diet & Notes card** — Diet type (tappable → pill picker) + free-text "Food notes" textarea for allergies, intolerances, dislikes, medical restrictions. Saved with a dedicated "Save notes" button.

**Mifflin-St Jeor BMR formula:**
- Male / Other: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5`
- Female: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161`

**Activity multipliers:** Sedentary ×1.2 · Lightly active ×1.375 · Moderately active ×1.55 · Very active ×1.725

**Goal adjustments:** Maintain +0 · Lose 0.25 kg/wk −250 kcal · Lose 0.5 kg/wk −500 kcal · Gain muscle +250 kcal

**Macro split formula (from calculator):** Protein = 2.0 g/kg · Fat = 25% of calories ÷ 9 · Carbs = remaining ÷ 4

**Overview sub-tab:** Inline week-at-a-glance view for the current week. No date navigation, no trainer note, no separate "See full week" screen. Three cards stacked vertically:

1. **Stats card** (white, 3-column) — days logged · avg kcal/day · protein on target. Numbers in HEADER dark green; protein count turns ACCENT when all 7 days hit target.
2. **Weekly Average vs Target card** — four progress bars: Calories (HEADER `#244e43`), Protein (`#378ADD`), Carbs (`#EF9F27`), Fat (`#D85A30`). Values = week total ÷ 7 vs daily target. Bar turns coral if over target. Caption: "Average daily intake (week total ÷ 7)". Only shown when ≥1 day logged.
3. **7-day strip card** — row of 7 tappable day buttons (Mo–Su). Each shows: day abbreviation · date number · kcal logged (if any) · colored status line at the bottom (green ≥90% of calorie target, amber 40–89%, coral 1–39%, none/transparent if no data). Selected day gets a HEADER-tinted background + border; tap again to deselect. Legend row: ● On track · ● Partial · ● Struggling.

**Inline day detail** — appears below the strip when a day is tapped (no separate screen):
- Day name header row (e.g. "Thursday 28 May") with ✕ `xmark.circle.fill` to collapse
- **Targets card** — Calories (HEADER) + Protein + Carbs + Fat progress bars vs target. Only rendered when at least one target is set.
- **Meal sections** — food entries grouped by meal (Breakfast · Morning Snack · Lunch · Afternoon Snack · Dinner · Evening Snack). Each section: emoji + label + kcal. Each entry: food name + portion + kcal + protein. Empty state: "No food logged for this day".
- No dark green macro summary card (removed — Targets card covers the same data).

---

##### Progress tab ✅

Two sub-tabs: **Measurements** | **Strength**

File: `app/(trainer)/client/[id]/progress-tab.tsx`

---

**Measurements sub-tab**

**6 metric selector tabs (2 × 3 grid):**
- WEIGHT · FAT · MUSCLE · WATER · VISCERAL · BMR
- Each tab shows: metric label (uppercase), latest value + unit, zone badge (colour-coded, e.g. "Normal", "Too low")
- Active tab has dark green (#244e43) background with white text
- **Tap inactive tab** → activates it, shows its graph + zone bar below
- **Tap active tab again** → opens QuickEdit popup modal to update the latest measurement's value for that field inline

Below the tab grid: "Measured [date] · Added by you / Added by [name]" in muted grey.

**Per-metric detail card (shown below the grid for the active metric):**

Each metric shows a `ZoneBarCard` component (or plain graph if no zone data available):

*Weight:*
- Requires `height_cm` from Info tab to show BMI zone bar
- BMI auto-computed: `weight_kg / (height_cm/100)²`
- BMI zones: Underweight (<18.5) · Normal (18.5–25) · Overweight (25–30) · Obese (30+)
- If `height_cm` not set: plain weight graph with hint "Add height in Info tab to enable BMI zones"

*Fat (sub-tabs: Fat % | Fat kg):*
- Requires sex to be set for zone bar to appear; falls back to plain graph with hint if not set
- Fat % zones: age-bracketed (18–39 / 40–59 / 60–79) per sex — Too low / Athletic / Normal / High / Too high
- Fat kg: shown as plain graph; zone badge derived from fat% ÷ weight × 100
- Body silhouette with segmental fat values shown below the card (tappable segment cards)

*Muscle (sub-tabs: Muscle % | Muscle kg):*
- Requires sex; same fallback as Fat
- Muscle % zones: age-bracketed per sex — Too low / Normal / Athletic
- Muscle kg: plain graph; zone badge derived from muscle% ÷ weight × 100
- Body silhouette with segmental muscle values shown below the card

*Water (sub-tabs: Total % | ICW kg | ECW/TBW):*
- Requires sex for Total % zone bar; falls back to plain graph if not set
- Total % zones: Too low / Normal / Too high (thresholds differ by sex)
- ICW kg: plain graph, no zones
- ECW/TBW ratio zones: Too low (<0.36) / Healthy (0.36–0.40) / Slightly high (0.40–0.43) / Too high (0.43+)

*Visceral:*
- Always shows zone bar (no sex/age required)
- Zones: Healthy (1–10) / High (10–15) / Very high (15–30)

*BMR:*
- Plain graph only (no clinical zone bands)

**Zone bar:**
- Horizontal coloured bar showing all zones with proportional widths
- Downward triangle marker at the client's current value
- Hollow circle marker at the goal value (if set)
- Each zone segment and its label are **tappable** → inline tooltip row appears below the bar showing the full zone label and numeric range (e.g. "Overweight · 25 – 30")
- Tap the same segment again to dismiss the tooltip

**Zone graph:**
- SVG graph with coloured zone bands as background rectangles
- Y-axis line + numeric labels at every zone boundary (labels spaced ≥13px apart; overlapping labels skipped)
- HEADER-coloured data polyline + dots (tappable → tooltip: value + date)
- Dashed ACCENT goal line when a goal is set
- Time range selector: 1M · 3M · 6M · 1Y · All

**Goal editing:**
- "Set goal" / "Goal: X unit" link top-right of each metric card
- Tap → white centered modal with decimal input and Save button
- Goals stored in `client_goals` table keyed by client_id + metric name
- Goal marker shown on both zone bar and zone graph

**Body silhouette (Fat and Muscle tabs only):**
- SVG body figure centred with floating segment cards: TORSO (top) · R. ARM + L. ARM (sides) · R. LEG + L. LEG (bottom)
- Tapping a segment card → QuickEdit popup to update that segmental field
- Imbalance dots: amber dot when left/right differ >5%; red when >10%

**History list:**
- All past entries listed below, newest first
- Each entry: date · weight · fat % · muscle kg · "By trainer" / "By client" tag
- Tap entry → full detail modal (all values including segmental breakdown)
- Swipe left → delete (trainer only, confirmation dialog)

**Add measurement form (white bottom sheet):**
- Fields: Date · Weight · Body Fat % · Body Fat kg · Muscle % · Muscle kg · Water % · ICW kg · ECW kg · ECW/TBW ratio (auto-computed from ICW+ECW) · Visceral Fat · BMR · Segmental Fat section · Segmental Muscle section · Notes
- `ecw_tbw_ratio` auto-fills as `ecw / (icw + ecw)` whenever ICW or ECW changes; trainer can still override manually
- Save → tagged `created_by_role = 'trainer'`; both trainer and client can add entries

**Zone system — technical:**
- Zones require sex to be set on the client (Info tab); fat/muscle/water fall back to plain graphs if sex is null
- Age brackets for fat/muscle: 18–39 / 40–59 / 60+; age derived from `date_of_birth`; defaults to 35 if DOB not set
- `ZoneKey` type: `'too_low' | 'athletic' | 'normal' | 'high' | 'too_high' | 'healthy' | 'very_high' | 'underweight' | 'overweight' | 'obese' | 'slightly_high'`
- Zone tooltip state resets whenever the active metric tab or sub-tab changes (React.Fragment key + ZoneBar key pattern)

---

**Strength sub-tab**

**Search:**
- Search bar at top — searches all exercises this client has logged at least once
- Results list below search bar (filtered as you type)
- Tap exercise → opens progression graph view

**Progression graph view:**
- Back button returns to search
- Exercise name as heading
- Peak weight + date shown above graph
- Identical graph style to Exercise Detail — custom SVG, react-native-svg
- Time range selector: 1M · 3M · 6M · 1Y · All
- Each dot = max weight for that exercise+session combination
- Tappable dots show tooltip: weight, reps, date
- "Compare" button top right

**Compare exercises:**
- Tap Compare → exercise search picker opens as **white centered modal** (animationType="fade", dimmed overlay, borderRadius 16, all-sides rounded)
- Selecting a second exercise overlays both as lines on the same graph:
  - First exercise: accent green (#24ac88)
  - Second exercise: amber (#f5a623)
- Legend below graph: ● [Exercise 1 name] · ● [Exercise 2 name]
- Same time range selector applies to both
- "Clear" button removes second exercise, returns to single view

##### Info tab (trainer only — never shown to client)
- Personal info: name, email, username, phone, DOB, height (cm), sex (Male / Female / Other / Not set inline pill toggle), billing address
  - Phone, DOB, and height are edited via **tappable row → centered white popup modal**
  - `height_cm` stored on the `users` table; used to compute BMI in the Progress tab and pre-fills the macro calculator
  - `sex` options: Male / Female / Other / Not set. Stored as `'male' | 'female' | 'other' | null`. Progress tab zone calculations treat 'other' as 'male'.
  - **`activity_level` and `goal` are NOT shown in the Info tab** — they are set exclusively inside the Nutrition tab's macro calculator, where they are saved to the `users` table on confirm.
- Private trainer notes: injuries, medical, preferences
- **Availability Type** (Training Preferences section): Fixed / Flexible recurring / Variable pill selector. Saves immediately to `users.availability_type`.
- **Weekly Session Goal** (Training Preferences section, below Availability Type): pill selector 1–5. Tapping a selected pill deselects it (null). Saves immediately to `users.weekly_session_goal`. Description: "Total sessions per week including solo training".
- Custom slogan field
- **Set password row** (below custom slogan): lock icon + "Set password" label + chevron
  - Tapping opens a white centered modal with two tappable rows (New password · Confirm password), each opening a nested field modal with a secure text input
  - On confirm: calls `supabaseAdmin.auth.admin.updateUserById` to set the new password, then sets `must_change_password = true` on the `users` table
  - Shows a "Password updated" toast on success

---

#### Workout Builder ✅

**Entry:** + → New Workout, or From Template → rename → edit

**Cover image:** image picker at top, stored in `workout-covers` Supabase bucket, used as full bleed header in Do Mode

**Category picker:** below the workout name input — tappable row showing current category pill or "None" placeholder. Tapping opens a centered white modal with a "None" option, the 9 standard category options, a "STRETCHING" section separator, then the 3 stretching categories (Upper body stretching · Lower body stretching · Full body stretching). Category saved to `workouts.category` on create. When a stretching category is selected, `stretch_type` is auto-set to the matching value and the Post-workout stretch toggle is hidden. File: `lib/workoutCategories.ts` exports `WorkoutCategory` union type, `CATEGORY_OPTIONS` array, `STRETCHING_CATEGORIES` array, `STRETCHING_CATEGORY_TO_STRETCH_TYPE` map, and `CATEGORY_COLORS` record.

**Post-workout stretch selector:** shown below the category row for non-stretching workouts only. Type 1 segmented switcher — None · Upper · Lower · Full. Sets `stretch_type` on the workout. When `stretch_type` is set, finishing a session for this workout navigates to the Session Complete screen which shows a stretch card at the bottom linking to the matching stretch session workout. File: `app/(trainer)/workout-builder.tsx`.

**Post-workout stretch auto-provisioning (Model A — shared per-client):** each client has **one** Upper / Lower / Full stretch workout, reused by every workout that points to that type. On saving a regular workout (any client destination) with a `stretch_type` set, `ensureClientStretchWorkout()` checks whether the client already has a matching stretch workout (by `stretch_type` + stretching category). If **not**, it deep-copies the matching stretch **template** (most recent if several) into the client — the copy appears in the client's Stretching tab and the Session Complete link then resolves. If the client already has one, it is **never** overwritten, so per-client edits are preserved. Non-fatal: a failure here never rolls back the saved workout. So the trainer keeps 3 stretch templates (Upper/Lower/Full) as masters and never manually assigns them — the toggle provisions on demand.

**Exercise list — collapsed by default:**
- Each row: checkbox · video thumbnail · name · muscle tag · equipment · rep summary
- Checkbox for multi-select → bottom bar: Superset | Delete
- Tap chevron ∨ → expands inline to show/edit sets
- Long press → drag to reorder (supersets move as one unit)
- Video thumbnail → tap → fullscreen video

**Expanded exercise:**
- Set rows: set number · target reps · suggested weight · rest time
- "+ Add Set" at bottom
- Tap ∧ to collapse

**Superset rules (V3 — matches Do Mode V3, current):**
- Minimum 2 exercises required
- Plain "SUPERSET" text label (no background) above the first exercise only — dark green #244e43, 12px, weight 700, letterSpacing 0.6
- No per-card borders, no left/right accent lines, no SS pill on exercise name
- Between exercises within the same superset group: a small dark green "+" (`SymbolView name="plus"`, size 10, `#244e43`) centered in an 18px-tall row — no line
- After the last exercise of a superset group (and after every standalone exercise): full-width edge-to-edge divider line (`rowDivider`)

**Exercise picker (A-Z / Recent toggle):**
- A-Z: alphabetical
- Recent: sorted by most recently used by trainer across all clients
- No keyboard auto-focus on open

**Entry points:**
- **Library Workouts `+`** (both Workouts and Templates sub-tabs) → opens the builder with **no client / no mode**. The destination (template vs client, and placement) is chosen at Save.
- **Client profile `+` / routine detail** → opens the builder with a `clientId` param (client already known → Save sheet opens straight on placement).
- **Templates gallery tap / "Use template"** → opens the builder with a `templateId` param (loads that template's name, category, cover, exercises, sets for review/assign).
- **Workouts Library day picker (`add-workout.tsx`)** → opens the builder with `editWorkoutId` (a workout) or `templateId` (a template) **plus `scheduleDate`** — review/tweak, then Save both saves and schedules on that day.

**Edit-in-place, last-performed pre-fill & schedule-on-save (`editWorkoutId` / `scheduleDate` params, July 2026):**
- `editWorkoutId` preloads an existing workout; `scheduleDate` (YYYY-MM-DD) schedules the saved workout on that day after Save (inserts a `sessions` row `status='scheduled'`).
- **Last-performed pre-fill (`fetchLastPerformedMap`):** when scheduling for a known client, each set row is pre-filled with what the client **actually last did** (most-recent completed-session `weight_kg`/`reps_completed` per `set_number`), not the stale planned targets. Blank if never performed. Applies to both the `editWorkoutId` and `templateId` (when `clientId` present) loads.
- **Update-in-place vs copy at Save:** if `editWorkoutId` is set **and** the loaded workout belongs to the target client, the existing `workouts` row is **updated in place** and its exercises **reconciled** — kept rows updated (order/superset), added rows inserted, removed rows **soft-deleted (`is_active=false`, see WorkoutExercise model)**; `workout_sets` fully replaced. Otherwise (editing another client's workout, or from a template) Save **inserts a fresh workout** — this is how a workout gets copied into a new client (replacing the old standalone `copyWorkoutToClient` helper). `BuilderExercise.originalWeId` tracks each loaded row so its logged history is preserved.
- **`resolveCover`:** an unchanged remote cover URL is reused as-is; only a freshly-picked local image is re-uploaded.

**Save flow — universal destination sheet (`SaveSheet`, white centered modal, multi-step):**
- **Step 1 — destination:** "Assign to a client" or "Save as a template" (a template is saved to `workout_templates` + `template_exercises` + `template_sets`; no client).
- **Step 2 — pick client** (client destination only; skipped when a `clientId` param was supplied).
- **Step 3 — placement:** Standalone Workout · Save as New Routine (auto-name "[FirstName] Routine I/II/III", editable) · Add to Existing Routine (only when the client has active routines).
- Save button: accent green (#24ac88) filled pill · Cancel text link below. Back chevron in the title returns to the previous step.
- **Cover photo** works for every destination, templates included.
- After a client save, if the workout has a Post-workout stretch `stretch_type` and the client has no matching stretch workout, one is auto-provisioned from the matching stretch template (see §5 Stretch sessions).

**Conflict prompt (new routine while active routine exists):**
When saving as a new routine and the client already has an active routine, a white centered modal appears before inserting. A client can only have one active routine, so there is **no "keep both" path** (July 2026):
- Title: "Active Routine Exists"
- Message: `"[ExistingRoutineName]" is currently active. A client can only have one active routine, so it will be deactivated (moved to Closed) when the new one starts.`
- **"Deactivate & continue" (green filled pill):** sets the existing routine `status='closed'` with `closed_at` + appends to `status_history`, then saves the new routine as active
- **Cancel (gray text link)**
- The Save sheet is closed **before** this prompt opens — two stacked native Modals block touches on iOS (the prompt would otherwise be unresponsive).

---

#### Do Mode (session logging) ✅ partial

**Header — full bleed to top of screen (client):**
- Cover image if set — no full dark overlay; only a bottom vignette (`transparent → rgba(0,0,0,0.38)` from 45% down) for name readability. No cover: 3-stop dark green gradient (`#2d6b5a → #244e43 → #1a3832`).
- **Static nav bar** (always visible, not scroll-dependent): back `‹` left · **combined pill** centered · ⋯ three-dot button right.
  - **Combined pill**: white background, green text. Left: running timer (tabular nums). Center: thin green separator. Right: "START" / "FINISH". Tapping anywhere triggers start/finish. In edit mode: "Done" button replaces it.
  - **⋯ dot badge**: small green dot on the ⋯ button when training notes exist but haven't been viewed.
- **Expanded content** (`ListHeaderComponent`): workout name 28pt bold white ALL CAPS, anchored to bottom of header (`headerExpanded`). Session label directly below in 65%-opacity white ("Session N · D Mon YYYY"). No timer in expanded area. No (i) button.
- **Card-on-top visual:** white BG cap `height:26, borderTopLeftRadius:26, borderTopRightRadius:26` at `bottom:0` of `ListHeaderComponent`. First exercise card gets `marginTop:12` for breathing room.
- **⋯ menu** (`DotsMenuSheet` bottom sheet): slides up from bottom. Shows workout name + session date/count at top, then icon rows: Training Notes · Muscle Groups · Equipment · Session History · category pill. Each row opens a **stacked bottom sheet** on top (panel stays visible behind). Swiping the sub-sheet down returns to the dots panel.
  - Training Notes sub-sheet: `TrainingNotesModal` (same content as before — trainer + client notes, history).
  - Muscle Groups / Equipment / Session History: `SubInfoSheet` generic panel.
  - Session History item tap: closes everything and loads past session.
- No category pill in the expanded header — category is shown only in the ⋯ panel

**Pre-session popups — sequential, on workout open:**
Two popups may appear on open, shown one after the other:

1. **Notes from last session** (if the last completed session had training-level notes):
   - White centered modal, title "Notes from last session"
   - Shows trainer notes (green label) and client notes (grey label) — read only
   - Button: **Got it** → dismisses and triggers popup 2 if needed

2. **Different order last time** (if last session order differed from slot numbers):
   - White centered modal, title "Different order last time"
   - Lists each out-of-order exercise with specific positional description, e.g. "Bench Press — Done 3rd instead of 1st"
   - Button: **Got it**
   - Each affected exercise's **Info button** shows a green dot badge on first expansion, and the CHANGES & HISTORY section in that exercise's Info modal shows the same description with new-note highlighting

Popup 2 only becomes visible after popup 1 is dismissed (rendered conditionally on `!lastSessionNotesModal`).

**Exercise list — cards, collapsed by default (V4, June 2026):**
Each exercise is a white rounded card (`borderRadius:16`, shadow `shadowOpacity:0.10, shadowRadius:10`) on a white background. The shadow alone creates depth — no background color change. Cards have `marginHorizontal:14, marginBottom:10`.

Tapping anywhere on the collapsed card expands/collapses it inline. A `chevron.down` / `chevron.up` icon at the bottom center of each card indicates state and provides a dedicated expand tap target.

Each collapsed card contains:
- **Main row** (`collapsedMainRow`, `alignItems:'center'`):
  - **Left:** 26×26 numbered circle. Tapping marks done (fills green + white ✓). Trainer edit mode: tapping selects for superset/delete actions.
  - **Center (flex:1):** animated drag handle (slides in during edit mode, `width 0→16`) + exercise name (16px, semibold, plain non-tappable text, `numberOfLines:1`). `gap:0` on sub-row prevents phantom gap when drag handle is hidden. No `(i)` button on the collapsed row — Info lives in the action row when expanded.
  - **Right:** 40×40 `MuscleThumb` silhouette — rendered **outside** the expand `TouchableOpacity` (sibling in the row) so tapping it only opens the silhouette modal, never expands the card. Single tap opens a white centered modal showing the primary side full-body silhouette (large, fills card width), muscle names above (primary in ACCENT green, secondary in grey), and a flip button below (`arrow.triangle.2.circlepath`) to animate to the other side (scaleX collapse/expand, 150ms each way).
  - **No set summary** — collapsed rows show name + silhouette only.
- **Chevron row** (below main row, centered): `chevron.down` when collapsed, `chevron.up` when expanded. Size 11, `#ccc`. Wrapped in its own `<TouchableOpacity onPress={onToggleExpand}>` — tapping the name/circle area or the chevron expands the card; tapping the `MuscleThumb` does not.

When expanded: sets content flows directly inside the card below the header row (`paddingTop:4` spacer). Card grows to fit. Contains:
1. **Action row** — two equal `flex:1` Type 2 buttons (`borderRadius:10, borderWidth:1.5, borderColor:ACCENT`): **Play video** (`play.fill` icon, **always active** — opens `ExerciseVideoOverlay` even when no media exists, shows "No media yet" screen) · **Info** (`info.circle` icon, opens `ExerciseInfoModal`; green 6×6 dot badge top-right when `hasChangeIndicator && !infoSeen`, clears on first tap). Separated from the sets area by a thin `#e8e8e4` divider line.
2. bar/machine selector (if applicable) · Sets/SUPERSET label · KG/REPS/TOTAL column headers · set rows · dashed divider above added sets (if applicable) · Add Set/Photo buttons · Start timer.
- **No solid divider** between KG/REPS/TOTAL headers and set rows (removed).

If exercise was moved permanently from another position: small grey italic label under name: "og. [original name]"

**Swipe gestures on exercise cards:**
- **Swipe right** → checkmarks exercise (fills green ✓) with green reveal animation. Swipe right again on a checked exercise → uncheckmarks it. Hard block dialog if session not in_progress.
- **Swipe left** → reveals buttons on the right side. Buttons stay visible until tapped or dismissed. Soft prompt appears when tapped if session not started.
  - **Trainer:** two buttons — **⇄ Replace** + **+ Add below** (160px reveal)
  - **Client:** one button — **⇄ Replace** only (80px reveal)

**Edit mode (long press) — V4 (current, June 2026):**
> ⚠️ The old wiggle + inline −/+/✕ button system was replaced. See V1_BACKUP comment in both Do Mode files if reverting.

- Long press on any exercise → **drag handles slide in** (three horizontal lines, between the circle and the name, animated). No wiggle.
- Second long press → that exercise/group becomes draggable. Superset moves as a unit.
- On drop → slot numbers update sequentially.
- **Done** button in nav bar (right side) exits edit mode — replaces the START/FINISH button while in edit mode. Tapping background also exits.
- START/FINISH button hidden entirely during edit mode (both expanded header and nav bar positions).
- Slot numbers hidden in edit mode. Revealed on exit.
- Chevron hidden in edit mode (expand not available while reordering).
- Edit-mode list uses `paddingBottom: insets.bottom + 90` so the last exercise scrolls above the action bar.

**Edit mode — selection & action bar (trainer only):**
- Tapping the circle on any exercise **selects** it (dark green outline → filled with ✓ when selected).
- Multiple exercises can be selected simultaneously.
- **Action bar** slides up from bottom with three context-sensitive buttons:
  - **Remove from SS** — active only when exactly 1 SS exercise is selected
  - **Create SS / Add to SS / Break SS** — middle button label changes by context:
    - "Create SS": all selected are standalone
    - "Add to SS": selection mixes SS + standalone
    - "Break SS": ALL members of the same superset are selected (dissolves the group)
  - **Delete** — active when anything is selected; confirm dialog before deleting
- Selection clears on exit or after any action.

**Edit mode — client restrictions:**
- Drag handles appear (clients can reorder)
- No action bar — clients cannot delete, create, or break supersets
- Done circles stay as normal completion circles (no selection)
- In `SupersetGroupCard`, done circles render for each member; `onMarkDone`/`onUnmarkDone` passed from parent

**Visual rules for superset (V4 — current):**
- All exercises in a superset group share **one card** (`exCardOuter/exCardInner`). `listData` always produces `kind:'group'` items for supersets in both normal and edit mode.
- Card header (`ssGroupHeader`): "SUPERSET" label (12px/700, `#244e43`, `letterSpacing:0.6`) — tappable button. `paddingHorizontal:14, paddingTop:10, paddingBottom:4`.
- **Between exercises within the group** (`ssInCardConnector`, `height:20`): centered "+" (`SymbolView name="plus"`, size 14, `#244e43`). Not shown after the last member.
- **No SS badge** on collapsed rows (card header already identifies the superset).
- "SUPERSET" label has three visual states controlled by `liveGroupIdsTriggered` + `liveGroupIds`: normal (not yet activated) / pulsing opacity 0.35→1.0 loop (active) / opacity 0.35 static (paused). Tap to activate or toggle. Only in `ssGroupHeader`.
- In edit mode: `SupersetGroupCard` uses the same `ssGroupHeader` + `ssInCardConnector` layout; drag handles always visible; trainer gets selection circles, client keeps done circles.
- Swipe gestures work normally per-exercise within the card.

**V1 card design (backed up):**
The original white-card-per-exercise layout with `cardShadowWrap`, `cardOuter`, `exerciseCard`, teal superset borders, SS pill, and "+" connector is preserved in the `SUPERSET_V1_BACKUP` comment at the top of both Do Mode files.

**Live mode (superset only) ✅**
- **Manual activation:** tap the "SUPERSET" label in the card header → activates live. No auto-activation on typing or checkmarks.
- **First tap:** activates — "SUPERSET" text pulses (opacity 0.35→1.0 loop, 750ms each way, `useNativeDriver`)
- **Second tap:** pauses — "SUPERSET" text static at `opacity:0.35`
- **Third tap:** resumes pulsing
- When active: after the user checkmarks a set in any superset exercise (Do Mode or Exercise Detail):
  - App automatically collapses the current exercise (Do Mode) or advances `currentIdx` (Exercise Detail)
  - Moves to the next exercise in the superset (cycling: 1→2→3→1→2→3)
  - In Do Mode: expands that next exercise and scrolls to it smoothly
  - In Exercise Detail: navigates to that next exercise in the thumbnail strip
  - If live is paused, checkmarking does NOT advance — set is just marked done
- Live mode deactivates automatically when all exercises in the superset are checkmarked
- Live mode state: `liveGroupIds` (active/paused) + `liveGroupIdsTriggered` (visible/hidden) — both synced to bridge via `setBridgeLiveGroupIds` / `setBridgeLiveGroupIdsTriggered`; read via `isBridgeLiveGroup` / `isBridgeTriggeredGroup`
- Exercise Detail's "SUPERSET" button calls `invokeLiveToggle(groupId)` which in Do Mode's `registerOnLiveToggle` handler uses the same first-activation + toggle logic
- "SUPERSET" (tappable) also shown in Exercise Detail sets section header (`detailSetsLabelRow`) — same three visual states via `isLiveTriggered` / `isLiveActive` local state; component: `DetailLiveSupersetLabel`

**Superset exercise checkmark cascade:**
- Checkmarking exercise N in a superset → automatically also checkmarks all PREVIOUS exercises in the group (earlier in the list)
- Works in both Do Mode (`markDone`) and Exercise Detail (`handleCheckToggle`)
- After cascade, if all group members are done → live mode hidden

**Adding exercises to superset via swipe:**
- Swipe left on a superset exercise → + Add below → new exercise joins the superset with same superset_group_id
- Slot numbers recalculate sequentially after insertion

**Expanded exercise (tap ∨):**
- ∧ at top of sets area to collapse
- For barbell exercises: bar selector (15kg / 20kg / Custom) above sets
- Column header row (KG / REPS / TOTAL) is directly above the corresponding columns in each set row. The REPS label has a small `paddingLeft` nudge to visually center it over its input.
- Set rows: set number · KG (bold dark) · REPS (light grey) · TOTAL (auto-calculated) · rest timer
- **Set number:** font size 15, tap area 30px wide with 8px hitSlop. Dark green (#244e43) when a note exists for that set; grey (#999) when no note. Bounces once on first card expansion when a note exists.
- **Tap set number → opens the set note modal.**
- **Long press set number (250ms) → peek mode (ALL sets simultaneously):** shows the actual weight and reps from the FIRST completed session for EVERY set row at once. Yellow background on KG, REPS, TOTAL, and the set number on all rows. For barbell exercises, the matching bar button also highlights yellow. If no first-session data exists, shows — (dashes). Peek dismisses on release.
- **Trend color on pre-filled values:** KG and REPS text in each set row is always colored green (`#24ac88`) when the pre-filled value is higher than the previous session, red (`#e05555`) when lower, default color when equal or no comparison data. Computed by comparing the last two completed sessions for that exercise+set number. Suppressed only during peek mode (yellow peek style overrides). Applies in both Do Mode (`InlineSetRow`) and Exercise Detail (`DetailSetRow`).
- **Set note modal** has a "See history →" button at the bottom that opens the set history modal.
- No divider between KG/REPS/TOTAL header row and set rows. No borders between individual set rows.
- Dashed divider above sets added mid-session — only shown when at least one original set exists above it (`hasAnyOriginalSets` check). If all sets were added mid-session (exercise added mid-session), no dashed divider appears. Sets added mid-session are stored with `is_added_during_session = true` in `workout_sets`, so the divider reappears in future sessions. In Exercise Detail, the dashed line is rendered via SVG (`SvgLine strokeDasharray="5,4"`) rather than CSS borders.
- Dropsets indented with ↓ arrow
- Add Set / Dropset button at bottom
- Camera button to add session photo
- Photo thumbnails shown below sets — tap to view in white centered modal

**Play video button (expanded action row):**
Tapping **Play video** opens the **full-screen media overlay** (`ExerciseVideoOverlay`) — **always active, never disabled**:
- Black `#000` background, full-screen, `animationType="fade"`
- Combines all media into one gallery: `[...videoUrls, ...photoUrls]` (videos first, photos after)
- **No media:** grey italic "No media yet" centered text
- **Video item:** `OverlayVideoPlayer` (tap to pause/resume, no native controls, **always muted** — `p.muted = true`). `key={mediaIdx}` forces remount when switching items.
- **Photo item:** `Image resizeMode="contain"` filling the screen
- **Navigation** (shown only when 2+ items): top bar with ‹ · `N / total` pill (prefixed `📷` for photos) · ›. Chevrons dimmed at ends.
- **Bottom panel:** `LinearGradient transparent → rgba(0,0,0,0.72)` (height 180px) behind panel → muscle/equipment meta (muted, 12px) → exercise name (20px/700, white) → green "Done" pill. **No back/close — Done only.**
- Uses `useSafeAreaInsets()` for bottom padding.

**Info button (expanded action row):**
- `info.circle` SF Symbol + "Info" label. Always active. Tapping sets `infoSeen = true` and opens `ExerciseInfoModal`.
- Green 6×6 dot badge (`position:'absolute', top:5, right:6`) when `hasChangeIndicator` (`hasExerciseNotes || movedFromLabel || orderChangeDescription || addedAt`). Dot clears permanently once tapped. No bounce animation.
- `orderChangeDescription` carries the specific positional text, e.g. "Done 3rd instead of 1st".

Opens a **bottom sheet** (`ExerciseInfoModal`, `animationType="none"`) with swipe-down-to-dismiss:
- Drag handle at top (36×4px pill, `#e0e0dc`), tap-anywhere on handle area to initiate swipe.
- **CHANGES & HISTORY** section (shown when `addedAt`, `orderChangeDescription`, or `movedFromLabel` is set): each entry rendered with green-tinted highlight background (#edf9f4), 3px accent left border, and a fade-in animation. `addedAt` is shown first, then `orderChangeDescription`, then `movedFromLabel`.
- Coaching cues (read only)
- Trainer personal note — each note saved with date, multiple notes, newest first, deletable. The **newest** note is highlighted with green-tinted background, a "NEW" badge, and a fade-in animation on modal open.
- Client note if exists — same newest-highlighted treatment.
- **Two side-by-side outline buttons** below the scroll: "See history →" and "See progress →" (both `borderRadius:100, borderWidth:1.5, borderColor: ACCENT`). These are the **primary access points** for history and progress — there are no dedicated action-row buttons for these.
- Green Done pill at bottom closes the sheet.

**Set history (bottom sheet):**
`SetHistoryModal` — `animationType:"none"`, drag handle + swipe-to-dismiss via `useSheetDismissGesture`. Sessions listed newest-first; set rows with optional highlight. Done pill dismisses.

**Weight progress (bottom sheet):**
`ExerciseProgressSheet` — `animationType:"none"`, drag handle + swipe-to-dismiss.
- Filter chips: **All Workouts / This Workout** + **Month / Year / All time** (green active chip, dark green bg when active).
- **ProgressionGraph**: SVG line chart (best point highlighted, larger dot + white stroke; y-axis grid lines; x-axis labels). Tap any dot → tooltip modal with date, weight, reps.
- **GraphStats**: stat rows (↑ best, ↓ lowest, for this workout and overall). Tapping a row opens the same tooltip modal.
- Data loaded from `session_logs` joined against completed sessions for this client's workouts.

**Set (i) note:**
Opens white centered modal — same dated note system. "See history →" button opens `SetHistoryModal` (bottom sheet).

**Rest timer (Do Mode and Exercise Detail — identical):**
- Opens white centered modal (animationType="fade", KeyboardAvoidingView wrapper)
- SVG circular progress ring (220px, strokeWidth 11, ACCENT green, turns red when overtime)
- Edit state: editable seconds input centered inside ring + "seconds" label below input
- Countdown state: remaining time centered inside ring; overtime shows `+MM:SS` in red
- +15s / -15s adjustment buttons (`borderRadius: 10`)
- Start button → countdown begins; Stop button during countdown
- "Apply to remaining sets" toggle — on by default (`restApplyAll` state)
- When toggle is ON, `beginCountdown` saves the value to `preferredRestSecs`

**Mark as done (exercise level):**
- Tap circle ○ → fills green ✓, exercise collapses, all individual set ✓ circles also become done
- Tap filled ✓ → unchecks exercise (sets remain as-is)
- Checkmark blocked before START → hard block dialog appears

**Set-level checkmarks:**
- Each set row has its own ✓ circle; tapping it marks that set done and also auto-checkmarks all previous sets in the same exercise that have data (weight or reps entered) but are not yet done
- When the user focuses (taps into) a set's KG or REPS field, all previous sets with data are auto-checkmarked silently; sets with no data trigger a single confirm modal "X sets were skipped — Mark as done anyway?" with Skip / Mark done options
- Checkmarking any set dismisses the keyboard

**Session photos:**
- Camera icon in expanded exercise row
- Photo upload blocked before START → hard block dialog appears
- Photos stored in `session-photos` Supabase bucket
- Saved to `session_exercise_photos` table with session_id
- Persist across sessions — loaded when workout reopens
- Tap thumbnail → view in peek modal. **Single photo:** plain white centered box (`borderRadius:16, width:'90%', aspectRatio:4/3`). **Multiple photos:** `‹ [image] ›` row layout — arrows are **outside** the image box (36px columns flanking it within a 96%-wide row), `1/N` pill badge inside the image bottom-center. Arrows dimmed at first/last photo.
- **Delete photo:** trash icon (30×30 dark semi-transparent circle, `top:8, right:8` inside the image box) in the peek modal. Tap → closes peek modal, shows `confirmModal` "Delete photo?" with red "Delete" pill + "Cancel". Confirming deletes the row from `session_exercise_photos` by `photo_url`, removes the file from the `session-photos` storage bucket, and updates local state + bridge. Available on both trainer and client sides.

**Start prompts:**
- Tapping **START** pill → fires immediately, no confirmation dialog.
- Past-session repeat (viewing a previous session and tapping START) → weight-choice modal: "Most recent weights" / "Weights from this session" / Cancel.
- Editing weights/notes/exercises before START → soft dialog: "Start workout?" → Start / Not yet
- Exercise-level checkmark or photo before START → hard block: "You must start the workout to do this" → Start workout / Cancel
- Set-level checkmark (individual set ✓) before START → soft dialog: "Start workout?" → Start / Not yet (action proceeds either way). Implemented via `handleEditBeforeStart(perform)` — fires only once per session open; subsequent set checkmarks after "Not yet" proceed silently.
- Once session is in_progress: no prompts appear for any action

**Toast reminder:**
When the trainer starts interacting with exercise N while exercise N-1 has weights/reps entered but is not checkmarked → small toast at top: "[Exercise Name] wasn't marked as done — make sure you're finished with it." Disappears after 3 seconds, non-blocking.

**Adding exercises mid-session:**
- **+** → opens Exercise Library picker → adds below that exercise
- Before first completed session: added silently, no tracking, no label
- After first completed session: no label shown in the collapsed row. Instead the **Info button shows a dot** immediately (same session) and in every future session until the user opens Info, so the trainer notices. The CHANGES & HISTORY section of the Info modal shows `"Added · [date]"`.
- Detection in future sessions: all sets of a mid-session-added exercise have `is_added_during_session = true` in `workout_sets`. On load, `wasAddedMidSession = sessCount > 0 && allSets.every(s => s.is_added_during_session)` → sets `addedAt = "Added · [date]"` from `workout_exercises.created_at`.

**Replacing exercises mid-session:**
- **⇄** → opens panel showing replacement history + "+ Replace with different exercise"
- Before first completed session: replaces silently, no og. label, no history
- After first completed session: new exercise shows **(og. [Original Name])** in grey, tracked in slot_replacement_history

**Exercise slot tracking:**
- Each exercise has a permanent slot number visible on collapsed row
- Automatic order tracking: when trainer interacts with exercises in different order, recorded silently in slot_order_history with is_permanent = false
- Deliberate permanent reorder: long press → drag → saves permanently, updates slot_number and order_index, shows "Moved from position [X] · [date]" label
- Pre-session popup warns if last session had different order

**Session history (clock icon):**
Opens white centered modal listing past sessions. Each entry shows:
- Session number + date (e.g. "Session 3 · 24 Apr 2026")
- Duration
- Exercises completed count (e.g. "4/5 exercises")
- Deviations: added, replaced, skipped exercises
- Most recent at top

Tapping a session → read-only Do Mode view:
- Shows that session's date in header
- All exercises with weights/reps logged that day
- Done exercises show green ✓, unchecked show grey ✗
- START button → "Repeat this session?" → choose: **Weights from this session** / **Most recent weights** → timer starts

**Finish workout:**
- All exercises checked → "Complete workout? X/X done" → Complete
- Some unchecked → "X/X done. Some not marked complete." → Complete anyway / Go back
- After completing → navigate to Session Complete screen (or Stretch Complete if the workout is a stretch session)

**Session flow:**
1. Open workout → pre-session popup if order was different last time
2. Pre-fill weights from most recent session (cross-workout, last 50 completed sessions, most recent weight per exercise+set)
3. Tap START → soft dialog → timer begins → Session created (in_progress)
4. Log weights + reps, mark exercises done
5. Tap FINISH → confirmation → Session saved (completed) → navigate to Session Complete or Stretch Complete
6. Duration null if timer never started

**Post-session navigation:**
- Workout's category is a stretching category → **Stretch Complete screen** (`session-complete.tsx` / `stretch-complete.tsx`)
- Regular workout → **Session Complete screen** showing PBs, improvements, regressions, and (if `stretch_type` set) a stretch card at the bottom
- Stretch sessions do NOT increment `sessions_used` on the active package

**Weight calculation:**
- Barbell: (kg per side × 2) + bar weight = total
- Dumbbell/kettlebell: kg × 2 = total
- Machine/cable/bodyweight: no calculation

**On save, session_logs includes `barbell_weight_used_kg` for barbell exercises** — the bar weight selected in the bar selector at the time of save. This is what powers the peek barbell highlight in future sessions.

---

#### Session Complete screen ✅

Files: `app/(trainer)/client/[id]/workout/session-complete.tsx` + `app/(client)/workout/session-complete.tsx` (both import shared `components/SessionCompleteScreen.tsx`)

Shown after finishing any regular (non-stretching) workout session. Route params: `sessionId`, `workoutId` ('free' for free sessions), `clientId`, `clientName`, `sessionNumber`, `durationSeconds`, `exercisesDone`, `exercisesTotal`.

**Header** — dark green (#244e43), full bleed:
- VFIcon 64px white, centered, with 5 accent-green star polygons radiating around it
- Greeting line (21px/500 white): "You're on fire, [name]!" (all improved) / "Well done, [name]!" (mixed/no data) / "Not bad today, [name]." (all regressed) / "First one's in the books, [name]!" (first session)
- Session label (11px, rgba(255,255,255,0.38)): "Session N · D Mon YYYY" or "Free session · D Mon YYYY"

**Body** — #faf9f7 background, ScrollView with bouncing scroll-down indicator (dark green circle, chevron) when more content is below:
- **Stats row:** two white cards — Duration (MM:SS or —) · Exercises done (X / Y)
- **🏆 Personal bests today** card — only if pbs.length > 0. Each row: exercise name · `N × W kg` · `↑ delta` (ACCENT)
- **💪 What you did better today** card — only if improvements.length > 0. Each row: name + set detail subtitle · `↑ delta kg` or `↑ delta reps` (ACCENT). Footer italic: "Keep the numbers climbing."
- **😅 What was a bit tougher today** card — only if regressions.length > 0. Same format, delta in #c0392b. Footer italic: "Not every session is your best — that's what the next one is for."
- **Empty state card** — shown when pbs, improvements, and regressions are all empty. Same white card style. Text: "Consistency is the foundation. Keep showing up — that's how progress is made." (italic, #3a7d6b, 14px, lineHeight 22, padding 16).
- **Stretch card** — whenever the workout has `stretch_type` set AND a matching stretch session workout exists for this client (regardless of performance data). White card (`#fff`, `borderRadius:12`, thin border `#e8e8e4`): VFIcon 18px HEADER in a 34×34 `borderRadius:9` `#edede9` square · "AND AS ALWAYS —" label · stretch workout name · "→". Tapping opens the stretch workout in Do Mode.
- **Session note card** — always shown after the stretch card. "SESSION NOTES" label, multiline text input pre-populated from `sessions.client_notes`. Saved to DB on Done (only if changed).
- **Done button** — dark green filled pill. Trainer → client profile; client → Training tab.

Comparison logic: compares max `weight_kg` per `workout_exercise_id` between this session and the previous completed session for the same workout. Falls back to max reps comparison when weights are equal. Exercises with no weight/reps data are skipped. PBs = improvements where today's max exceeds all-time previous max (excluding current session).

---

#### Stretch Complete screen ✅

Files: `app/(trainer)/client/[id]/workout/stretch-complete.tsx` + `app/(client)/workout/stretch-complete.tsx` (both import `components/StretchCompleteScreen.tsx`)

Shown after finishing a stretching-category workout. Route params: `clientId`, `clientName`.

**Header** — dark green, VFIcon 64px (85% opacity) with muted stars (0.4–0.7 opacity), "That felt good, didn't it?" (20px/500 white, two lines), "Stretching complete" (11px muted white)

**Body** — single white card: italic quote + "See you next session, [name]." subtitle

**Done button** — dark green pill. Trainer → client profile; client → Training tab.

---

#### Exercise Detail Screen ✅

In V4 Do Mode, tapping the exercise name or the **Play video** button in the expanded action row opens the **ExerciseVideoOverlay** (full-screen modal) — NOT this screen. Exercise Detail (`exercise-detail.tsx`) exists as a separate screen but is no longer the primary in-session viewing path.

**Header:**
- **Background:** #faf9f7 (BG) — light, not dark green
- Back chevron on left (dark green tint) returns to Do Mode
- **Session timer:** bare text immediately right of back arrow (marginLeft:8), no pill/chip — `fontSize:12, color:#555`. Shown only when session is active.
- Exercise name centered, dark text
- **(i) button** immediately right of exercise name: 16×16 circle. Gray (`#e0e0dc`) when no notes, ACCENT green when notes exist. Bounces once on first visit when notes are present.
- **START button**: ACCENT green background (#24ac88), white text, all caps "START", pill-shaped (borderRadius: 20) — identical to Do Mode expanded START
- **FINISH button**: ACCENT green background (#24ac88), white text, all caps "FINISH", pill-shaped (borderRadius: 20)

**Navigation between exercises:**
- Swipe left/right anywhere on screen to move to adjacent exercise
- Thumbnail strip at bottom of screen shows all exercises as small thumbnails
- Current exercise highlighted with ACCENT (#24ac88) border
- Superset exercises in the strip are grouped: top+bottom ACCENT lines above and below the group ("top+bottom" style); the alternative bracket style is the "U line" (top+left+bottom border, named by Vitek)

**Info card:**
Matches Do Mode collapsed row layout exactly:
- "SUPERSET" label in small ACCENT uppercase text above name (superset exercises only); card has thin ACCENT border (1.5px) when superset
- Name row: exercise name + (i) note button immediately right of name + camera icon (indicator only — only rendered when ≥1 photo exists for this session, not tappable)
- "Moved from position X · date" label in grey italic below name (when applicable)
- Muscle group tag + equipment below that
- Description text in grey (if exists)
- Done circle on the right: empty grey circle when not done, filled ACCENT circle when done — tap to toggle. Synced back to Do Mode via bridge.

**Progression graph:**
- Single ACCENT (#24ac88) polyline graph, built with react-native-svg
- Time range toggle: Month / Year / All time
- Scope toggle: All workouts / This workout
- Each dot = one set from one session (max weight for that set in that session)
- Same-day sessions appear as separate dots — grouped by `sessionId:workoutExerciseId`, not by date
- **Machine brand filtering:** for cable/machine exercises, graph always shows data for the currently selected machine brand (from the brand selector above the sets). No brand pills in the graph — selecting the brand above automatically filters the graph. Sessions with `machine_brand = null` (legacy, saved before brand tracking) are included alongside any selected brand as a fallback. Non-machine exercises show all sessions.
- **Tappable dots:** tap → tooltip shows date, workout name, weight (kg), reps, "Set X of Y", "Exercise N in training"
- **Tappable stat rows:** "Best overall" and "Lowest overall" rows below the graph are tappable and open the same tooltip modal for that data point
- Slot number for tooltip sourced from bridge (`allExercisesRef.current`) — NOT from a DB query
- Workout name in tooltip sourced from workouts table (`id, name`), fetched in `loadGraphData` alongside the existing trainer workout filter
- "No session data yet" shown when no matching session logs exist

**Sets section:**
- Identical behaviour to Do Mode expanded exercise
- Bar selector for barbell exercises (15kg / 20kg / Custom)
- Set rows: set number · KG · REPS · TOTAL · rest timer (same layout and behaviour as Do Mode — no (i) button)
- **Peek (long press set number, 250ms, ALL sets simultaneously):** same yellow styles as Do Mode. `peekingSetLocalId` state is lifted to the parent screen; `isPeeking={peekingSetLocalId !== null}` on every row. Bar highlight uses `exercise.firstSessionBarbellWeightKg` from bridge.

**Muscle groups diagram (below progression graph):**
- Body part visualisation using `react-native-body-highlighter` (SVG-based, front + back views side by side)
- Primary muscles highlighted in ACCENT green (`#24ac88`, intensity 1)
- Secondary muscles highlighted in light green (`#a8dfd1`, intensity 2)
- Muscle name strings from the exercise are mapped to body-highlighter `Slug` values via `MUSCLE_SLUG_MAP`
- Each mapping carries a `side: 'front' | 'back' | 'both'` flag so muscles like deltoids (which appear on both SVGs) are highlighted only on the correct view — e.g. `'front delts' → { slug: 'deltoids', side: 'front' }`, `'rear delts' → { slug: 'deltoids', side: 'back' }`
- `muscleGroupsToBodyData(primary, secondary)` returns separate `frontData` / `backData` arrays, each passed to its own `<Body>` component

**Photo section (below sets):**
- Thumbnail row showing session photos for this exercise
- "Add photo" button (camera icon + "Add photo" text) shown when no photos exist; icon-only when photos already exist
- Camera icon in the name row above is a read-only presence indicator — rendered only when photos exist, no touch handler
- Tap thumbnail → white centered modal, image fills edge to edge
- Upload requires an active session (`sessionId` URL param); alert shown if not started

**Note modals:**
- Exercise (i) and set (i) → same white centered modals as Do Mode

**Exercise ✓ checkmark behaviour in Exercise Detail:**
- Tapping the done circle marks the exercise as done AND marks all individual sets as done
- After marking done, auto-navigates to the next unchecked exercise: search forward from current index, then wrap to start; if all exercises are done → custom confirm modal "All exercises done! Finish the session?" with Cancel / Finish
- Finish → `setPendingFinish(true)` then `router.back()` — Do Mode reads `getPendingFinish()` on focus and triggers its own `handleFinish`
- Tapping the done circle when already checked → unchecks exercise only (sets remain as-is)

**Thumbnail strip — done badge:**
- Each thumbnail in the bottom strip shows a small filled ACCENT green ✓ badge in the bottom-right corner when that exercise is done (`isChecked === true`)
- Badge is 15×15px, ACCENT background, white "✓" at 9px/700 weight

**State sync back to Do Mode (via `lib/doModeBridge.ts`):**
- Set field changes: `addPendingSetUpdate()`
- Barbell weight changes: `addPendingBarbellUpdate()`
- Checkmark changes: `addPendingCheckUpdate()`
- All updates flushed in Do Mode `useFocusEffect` via `flushPendingUpdates()` and applied to `exercises` state
- Direct callbacks `notifySetsChanged` / `notifyCheckChanged` also registered from Do Mode so exercise-detail changes appear immediately (no waiting for useFocusEffect)
- **Bridge notify rule:** `notifySetsChanged` and all bridge callbacks must be called **outside** any `setState` updater function — always pre-compute the next state array using `setsRef.current`, then call `setSets(next)` and `notifySetsChanged(...)` as separate statements. Calling bridge callbacks inside a setState updater triggers "Cannot update a component while rendering" errors.

**Session ID:**
- Passed as URL param `sessionId` from Do Mode via `activeSessionIdRef.current ?? ''`
- Required for photo upload; empty string if no active session — show alert rather than crash

---

#### Library tab ✅ partial

**Three tabs: Exercises | Workouts | Nutrition**

**Exercises tab ✅**
- Search bar
- A-Z / Recent toggle
- Body part + Equipment filter buttons (bottom sheet, multi-select)
- Each exercise: name · muscle tag · equipment. The muscle tag shows the **first** primary muscle; when the exercise has more than one primary muscle, a muted `+N` (count of the remaining primaries) is shown next to the tag (e.g. `Upper Chest +2`).
- **Body-part filter mapping** (`lib/exerciseFilters.ts` → `MUSCLE_MAP`): each filter label (Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Full Body) maps to the **granular muscle names** stored by the current builder picker (e.g. Chest → Upper/Mid/Lower Chest, Shoulders → Front/Lateral/Rear Delts, Core → Upper/Lower Abs + Obliques, Legs → Quads/Hamstrings/Calves/Adductors/Abductors) **plus** the legacy group names (Chest/Back/Shoulders/Core/…), so both newer and older exercises still match. Keep this map in sync whenever the builder muscle picker changes, or the filter silently matches nothing. The filter tests **primary** `muscle_groups` only. Same map + `ExerciseRow` are shared by the Library tab and the Add-Exercise picker (`exercise-library.tsx`).
- Tap → edit exercise
- + → new exercise
- No difficulty field

**Exercise Builder (Add / Edit Exercise):**
- Name, primary muscles, secondary muscles (optional), equipment, notes, video, photo
- Muscle pickers use a two-level hierarchy: **Upper Body / Lower Body** section toggle → group headers (Chest, Back, Shoulders, Arms, Core, Lower Body) → specific muscle pills
- Separate pickers for **Primary Muscles** and **Secondary Muscles**
- A muscle selected as primary is automatically removed from secondary (and vice versa) — no overlap allowed
- **Equipment options** (`EQUIPMENT_OPTIONS` in `add-exercise.tsx`): None · Barbell · Z Bar · Dumbbell · Kettlebell · Machine · Bodyweight · Cable · Resistance Band · **TRX**. The Library / picker equipment filter (`EQUIPMENT_FILTER_OPTIONS` in `lib/exerciseFilters.ts`) also includes TRX.
- All selected pills (primary, secondary, equipment) use ACCENT green (`#24ac88`) — `selectPillActive` style applies to all three picker sections
- Saves to `muscle_groups[]` (primary) and `secondary_muscle_groups[]` (secondary) on the `exercises` table
- **Video section:** dashed-border container — empty state shows `video.badge.plus` + "Add video"; set state shows thumbnail + play overlay + Remove link. Video uploaded immediately on pick via `arrayBuffer()` to `exercise-videos` bucket; thumbnail auto-generated and saved to `exercise-thumbnails`.
- **Photo section** (below video): dashed-border container — empty state shows `photo.badge.plus` + "Add photo"; set state shows selected image filling the container (`resizeMode:'cover'`) with a small ✕ button top-right to remove, tap image to replace. Photo is uploaded on save (not on pick) via `arrayBuffer()` to the `workout-covers` bucket at path `exercise-photos/{exerciseId}/{filename}`. The public URL is saved to `exercises.thumbnail_url`, overriding any auto-generated video thumbnail. If no photo is picked, `thumbnail_url` is left unchanged. Existing `thumbnail_url` is pre-populated into the photo picker when editing.

**Workouts tab ✅**
Two underline sub-tabs: **Workouts | Templates**

*Workouts sub-tab:*
- All workouts created for any client across all clients
- Search bar at top: filters by workout name **or client name** (typing "Anna" shows all of Anna's workouts)
- Filter row: **Category** dropdown (expands a pill panel with all 9 categories + All) · **Client** dropdown (default label "All Clients"; expands a pill panel with "All clients" + one pill per client, derived from the loaded workouts). Opening one dropdown closes the other. Category + Client + search all combine.
  - **No Recent/Oldest toggle** — it was removed. Sorting is **always most-recent first**: performed workouts newest→oldest (by last completed session), then never-performed workouts newest→oldest (by creation date).
- Each row: **100px tall cover card** — full-bleed cover photo (or category gradient fallback). Name 14px/600 white bottom-left. Category pill bottom-right: solid `CATEGORY_COLORS[category].border` bg, white text, pill shape. ⋯ button absolute top-right (trainer only).
- ⋯ menu (trainer only): **Rename · Change Photo · Add to Routine · Set Category · Post-workout Stretch · Mark as done / Reactivate · Delete**
  - Change Photo → `expo-image-picker` (16:9 crop) → upload to `workout-covers` bucket via `arrayBuffer()` → updates DB + local card immediately
  - Set Category → opens `CategoryPickerModal` (centered white modal, None + 9 options + STRETCHING separator + 3 stretching categories). Updates `workouts.category` immediately.
  - Post-workout Stretch → `StretchPickerModal` (white sheet modal, None · Upper · Lower · Full). Sets `stretch_type` on the workout. Hidden for stretching-category workouts.
  - Mark as done / Reactivate → toggles `workouts.status` between `'active'` and `'completed'`. Immediate update, no confirmation.
- + button → **universal Workout Builder** (no client / no mode — destination chosen at Save; see Workout Builder → Save flow). *(The old "pick a client first" modal was removed.)*
- Tapping workout opens it in Do Mode

*Templates sub-tab:*
- Lists template **workouts** as 100px cover cards (`TemplateLibraryRow`) — cover photo or category-gradient fallback, "TEMPLATE" badge top-left, name + exercise count, category pill. Empty state prompts building a workout and choosing "Save as a template".
- **Tap a card** → loads that template into the builder (`workout-builder?templateId=X`) to review/assign/tweak.
- **⋯ menu** (`TemplateMenuModal`): **Use template** (→ builder) · Rename · Change Photo (uploads to `templates/` folder) · Set Category (`CategoryPickerModal`) · Delete (removes `template_sets` → `template_exercises` → `workout_templates`).
- + button → universal Workout Builder (same as Workouts sub-tab; choose "Save as a template" at Save).

**Nutrition tab ✅**
File: `app/(trainer)/(tabs)/library.tsx` (NutritionTipsTab + FoodsTab components)
Four underline sub-tabs: **Recipes | Recomm. | Tips | Foods**
Sub-tab switching shared via `nutSubTab` state; `addTick` (Recomm./Tips) and `foodsAddTick` (Foods) counters passed from parent LibraryScreen.

*Recipes sub-tab:*
- Lists all recipes visible to the trainer (own trainer-created recipes + client recipes shared with trainer) — RLS handles visibility, no client-side `.or()` filter needed
- Loads via `useFocusEffect` (reloads on focus after returning from recipe create/edit screen); guarded by `if (!trainerId) return`
- Search bar at top filters by recipe name
- Cards: **120px tall**, full-bleed cover photo or amber gradient fallback (`#c87820 → #e89840` with leaf icon). Name bottom-left, portions bottom-right. No ⋯ button on cards.
- Tap card → white centered detail sheet: cover/gradient top, recipe name, description, ingredients list, instructions, "Edit Recipe" + "Delete" buttons
- + button in header → navigates to `/(trainer)/recipe-create` (trainer-specific route within trainer group; separate from `/(client)/nutrition/recipe/create` to avoid root layout role-guard redirect)
- Edit from detail sheet → `/(trainer)/recipe-create?editId=[id]`
- Delete uses `confirmModal` pattern (white centered modal, red destructive button)

*Recomm. sub-tab (Recommendations):*
- Lists nutrition tips with `category = 'supplement'` from `nutrition_tips` table (trainer_id = current user)
- Search bar at top filters by title (filtered client-side via `filteredRecomm` memo, only when `category === 'supplement'`)
- Cards: **120px tall** (same height as recipe cards), full-bleed cover photo or amber gradient fallback
- Tapping a card → opens white centered **detail sheet** (NOT the edit modal directly): cover/gradient top, title, link URL in ACCENT color (if set), body text, "Edit Recommendation" button + "Delete" button. Both buttons accessible from the sheet.
- + button → opens create recommendation modal inline
- Delete uses `confirmModal` pattern

*Tips sub-tab:*
- Lists nutrition tips with `category = 'tip'` from `nutrition_tips` table; system tips and custom trainer tips mixed
- System tips can be hidden per-trainer (indices stored in `trainer_settings.hidden_system_tip_indices`)
- + button → opens create custom tip modal

*Foods sub-tab:*
- Lists all `trainer_foods` rows for this trainer, ordered by name
- Search bar filters by `name` and `name_de`
- Each food card (white, borderRadius 16, shadow): 52×52 photo thumbnail (or `#3a7d6b → #244e43` gradient placeholder with `fork.knife` icon) · food name (14px/500) · optional German name (12px muted) · macro summary "X kcal · Xg P · Xg C · Xg F per 100g" (11px muted) · chevron right
- Tap card → opens `FoodCreateModal` in trainer edit mode (pre-filled with existing values)
- Floating + button (56×56, ACCENT bg, bottom-right) → opens `FoodCreateModal` in trainer create mode
- Edit modal has "Delete food" red text button; tapping triggers parent `confirmModal` (never `Alert.alert`)
- Empty state: "No foods yet — tap + to add your first food"

---

#### Recipe Create screen ✅

File: `app/(trainer)/recipe-create.tsx`

Registered in `app/(trainer)/_layout.tsx` as `<Stack.Screen name="recipe-create" />`. Navigated to from the Library Nutrition tab's Recipes sub-tab (+ button and edit from detail sheet).

- Trainer-specific recipe create/edit screen — mirrors `app/(client)/nutrition/recipe/create.tsx` in UI but sets `created_by_role: 'trainer'` and uses `trainer_id` (not `client_id`)
- Kept within `/(trainer)/` route group to avoid the root layout role-guard redirect that blocks trainers from `/(client)/` routes
- Cover photo picker, name/portions modals, ingredient list with FoodSearchModal, instructions modal, macro bottom bar
- URL param `editId` triggers edit mode (loads existing recipe, saves with UPDATE instead of INSERT)
- On save: navigates back; Library Recipes tab reloads via `useFocusEffect`

---

#### Workout Picker screen ✅

File: `app/(trainer)/workout-picker.tsx`

Reached from the routine detail screen → + → From Workouts. Query params: `clientId`, `routineId`.

- Shows all workouts across **all clients** (fetches `workouts` table joined with `users` for client name)
- Search bar filters by workout name **or** client name
- 100px tall workout cards with cover photo or category gradient background; name + client name + solid category pill overlaid
- Tapping a card deep-copies the workout into the target routine:
  1. Insert new `workouts` row (same name, category, equipment, muscle groups; `client_id` = target client; `routine_id` = target routine; `order_index` = current count in that routine)
  2. Insert `workout_exercises` rows, preserving order
  3. Insert `workout_sets` rows via ID map (old `workout_exercise_id` → new `workout_exercise_id`)
- Navigates back on success; the routine detail screen reloads via `useFocusEffect`

---

#### All Workouts screen ✅

**Trainer version** (`app/(trainer)/client/[id]/all-workouts.tsx`):
- **Header title:** "[FirstName]'s Workouts" (e.g. "Adam's Workouts") — fetches client first name on mount from `users` table via `clientFirstName` state + `useEffect`. Falls back to "All Workouts" while loading.
- **Workouts / Stretching underline tab switcher** (`mainTab: 'workouts' | 'stretching'`, same underline style as the client version). The **Stretching tab** shows the client's stretching-category workouts so the trainer can review/adjust each client's stretch sessions — including the ones auto-provisioned from stretch templates. *(This replaced the earlier behaviour where stretch workouts were hidden entirely on the trainer side.)* The category filter, Active/Not-Active toggle, and weekly bar render only on the Workouts tab.
- Filter row (Workouts tab only): **Category** button (expands pill panel) · **Active / Not Active** toggle (Type 1 style switcher)
  - Active: `status='active'` workouts; Not Active: `status='completed'` workouts
  - Sort: always newest first (by `created_at` desc)
- ⋯ menu on each card: **Rename · Change Photo · Add to Routine · Mark as done / Reactivate · Delete**
  - **Mark as done**: sets `status='completed'` — trainer decision, independent of session completion
  - **Reactivate**: sets `status='active'`
  - Change Photo → image picker (16:9) → upload to `workout-covers` bucket
- Done workouts appear at the bottom within each status filter view

**Client version** (`app/(client)/(tabs)/train/all-workouts.tsx` — a nested-stack screen inside the Training tab so the native bottom bar stays visible):
- Top: **Workouts / Stretching** underline tab switcher (same style as Body composition / Strength in the Progress tab — centered, 17px/600, gap 32, 2px ACCENT underline on active, `#bbb` inactive). NOT a Type 1 pill switcher.
  - Workouts tab: shows non-stretching workouts; filter row has **Category** picker + **Active / Not Active** toggle
  - Stretching tab: shows stretching-category workouts; no status toggle (all stretch sessions shown newest first)
- **THIS WEEK label row** (shown only when `weeklyGoal != null`): left "THIS WEEK" (12px/700 `#999` uppercase), right count e.g. "2 / 3" (14px/700 dark, turns amber `#f5a623` when exceeded). Fetched on load from `availability_submissions.sessions_wanted` (current week) or `users.weekly_session_goal` fallback. `paddingTop:16, marginBottom:12`. No bar, no pip.
- **Section sorting** (Workouts tab, Active filter only): workouts done this week float to top; a "NOT DONE THIS WEEK" label (12px/700 `#aaa` uppercase, `marginTop:14`) separates them from the rest. Only shown when both groups are non-empty. If nothing done this week, all cards appear without a divider.
- **Done-this-week badge**: green ✓ (20px ACCENT circle, top-right on card). When performed multiple times this week: `✓ ×N` pill (width expands to fit). `thisWeekCount: number` field on `WorkoutRow`, computed in `fetchAllWorkouts` from completed sessions in the current week.
- Sort within each group: newest first (by `created_at` desc)
- Done workouts (`status='completed'`) show a muted "Done" badge top-right + slight opacity reduction
- Tapping a done workout → white centered prompt: "This workout is marked as done" → "Open for this session" or Cancel
- No ⋯ menu (clients cannot edit workouts)
- Header: 62px, `#244e43` bg — back chevron left · "My Workouts" centered 18px/700 · VFIcon right (→ home)

**Client version** (`app/(client)/all-routines.tsx`):
- Same **THIS WEEK** label row as all-workouts (same fetch logic, same style). No section sorting — routines are not divided by done-this-week status.

#### All Routines screen ✅
- **Active / Closed segmented switcher** at top — Active tab shows routines with `status='active'`, Closed tab shows `status='closed'`
- **Active routine cards:** routine name · workout count · last session date ("Not yet done" if never)
- **Closed routine cards:** routine name · date range subtitle in format `D.M.YYYY – D.M.YYYY` (created_at → closed_at)
- Search bar filters by name within the active tab
- Tapping routine → Routine detail screen

**Trainer ⋯ menu per routine card (trainer only):**
- Active routines: **Rename · Deactivate · Delete**
  - Deactivate: white centered confirm modal → sets `status='closed'`, sets `closed_at`, appends `{status:'closed', at}` to `status_history`
- Closed routines: **Rename · Reactivate · Delete**
  - Reactivate: white centered confirm modal → sets `status='active'`, appends `{status:'active', at}` to `status_history` (does NOT clear `closed_at`)
- Delete: white centered confirm modal (red destructive button)
- All confirmations use the custom `confirmModal` state pattern — never `Alert.alert()`

**Client version** (`app/(client)/(tabs)/train/all-routines.tsx` — nested-stack screen inside the Training tab, native bottom bar stays visible): same Active/Closed switcher, same date range subtitle for closed routines. No ⋯ menu — clients cannot edit routines. Header: glass `LightHeader` (`smartBack` chevron left · "My Routines" title · VFIcon → home right). Routine cards with SVG progress ring. Shows **THIS WEEK** label row (same `WeekProgressBar` as all-workouts) when weekly goal is set — no section sorting.

#### Routine detail screen ✅
- All workouts in that routine listed as cards; each tappable to open Do Mode
- **Header:** routine name centered · **(i) button** immediately right of name (semi-transparent white circle, `rgba(255,255,255,0.18)` bg + subtle white border) → white centered modal showing full activation history (oldest period first)
  - Each period shown as a row: dot indicator + date range text
  - Green dot = currently open (active) period; gray dot = completed (closed) period
  - Date format: `D.M.YYYY – D.M.YYYY` for closed periods, `D.M.YYYY – present` for the current active period
  - History reconstructed from `created_at` + `status_history` JSONB + `closed_at` fallback via `buildPeriods()` helper
- Active routine shows **"Active Routine"** teal badge below the header

**Program order display (trainer + client):**
- Above the workout sections, a "PROGRAM ORDER" label row shows the cycle sequence using the same visual as the routine card in All Routines:
  - **Strips row**: one colored horizontal bar per workout (`height: 4, flex: 1`), color = `CATEGORY_COLORS[category].border` or `#888`. Full opacity if done/next/cycle-just-completed, 0.4 opacity otherwise
  - **Labels row**: below the strips — each cell shows the workout name (truncated to ~9 chars, 10px, `#666`) + a status character (10px/600): `→` for NEXT UP, `✓` for done in current cycle, `—` for not yet done. ACCENT when active/done, `#ccc` when pending
  - When the cycle just completed: all strips full opacity, all status chars show `✓` in ACCENT
  - `cycleRow` has `marginBottom: 12` to give breathing room before the workout sections
- Trainer-only: an **Edit** text link (ACCENT green, 12px/600) in the top-right of the header row opens the reorder modal

**Reorder modal (trainer only):**
- White centered modal — titled implicitly by the row list
- Each row: colored dot (10×10px, same category border color) + workout name + up ▲ / down ▼ chevron buttons
- Up/down buttons shift that workout one position in the list; top/bottom items disable the appropriate button
- **Save Order** green pill button applies the new order: updates `order_index` in Supabase + local state
- Cancel text link below dismisses without saving

**Workout cards in routine detail (trainer + client):**
- 100px cover cards (photo or category gradient), same spec as All Workouts
- Subtitle bottom-left: relative time since last session ("3 days ago") or "Not yet done"
- Cards are grouped into sections with small uppercase labels above each group
- **⋯ menu (trainer only):** ellipsis button `top:9, right:10` on every card. When `isDone=true` (COMPLETED section), button shifts to `right:34` to avoid overlap with the green ✓ badge positioned at `right:8`. Options: Rename · Change Photo · Add to Routine · Delete. Rename swaps the card for an inline text input row. Delete uses the `confirmModal` pattern (never `Alert.alert`). Client cards have no ⋯ button.

**Routine cycle logic:**
- Sessions are fetched with `status='completed'` filter, sorted ascending by date+created_at. Each session is walked in order; a Set tracks which workouts are done in the current cycle. When all workouts in the routine have been done → cycle completes, the Set resets, and a `hasCyclesCompleted` flag is set. After the loop: `cycleJustCompleted = hasCyclesCompleted && currentCycleDone.size === 0`.

**Workout section display:**
- **NEXT UP** label + card: the first workout NOT in `currentCycleDone` (by `order_index`)
- Queue (no label): remaining not-yet-done workouts in `order_index` order
- **COMPLETED** label + cards: workouts in `currentCycleDone`, each with a green ✓ badge (18px ACCENT circle, top-right)
- **When `cycleJustCompleted`**: the NEXT UP and COMPLETED sections are replaced by a "Start routine again?" heading + "Start with" subtitle + the first workout by `order_index` as a tappable suggestion. No green checkmarks in this state — the new cycle hasn't begun yet
- **When the first workout of the new cycle is done**: it enters `currentCycleDone`, the restart prompt disappears, and the layout returns to normal NEXT UP queue
- `order_index` defines the programmatic cycle order (e.g. Push → Pull → Legs); skipping is fine — the cycle tracks what's been done, not what order it was done in

**Section label styles:** 12px, 700 weight, uppercase, letterSpacing 0.8, `marginTop:4, marginBottom:2`. "NEXT UP" in `HEADER` dark green (`#244e43`). "COMPLETED" in muted grey (`#bbb`) with `marginTop:16` for extra breathing room. Program order "PROGRAM ORDER" label: 11px, 700, `#888`, uppercase; workout name labels below strips: 10px, `#666`; status chars: 10px/600. `cycleRow` has `marginBottom:12` to separate it from the sections below.
- Green **+** button in the header opens a white centered modal with four options:
  - **New Workout** → Workout Builder pre-seeded with `routineId` (save sheet defaults to "Add to Existing Routine" with that routine pre-selected)
  - **From Workouts** → Workout Picker screen (`workout-picker?clientId=X&routineId=Y`) — deep-copies the chosen workout into the routine
  - **From Template** → Template picker modal — deep-copies template exercises + sets into a new workout in the routine
  - **Start Free Session** → Do Mode in free-session mode (`workout/free`)

---

#### Finance tab ✅

File: `app/(trainer)/(tabs)/finance.tsx`

**Header:**
- Dark green (#244e43) background
- VFIcon (white) left · "Finance" title centered · ＋ green circle button right → creates new invoice

**Invoices / Earnings segment switcher:**
- Type 1 segmented control: `backgroundColor: '#d8d8d4'`, `padding: 3`, `borderRadius: 100`
- Active segment: dark green (#244e43) filled — same pattern as Progress "Body composition / Strength"
- Default tab: **Invoices**

---

**Invoices tab:**
- Search bar: rounded pill (white), searches client name + invoice number
- Filter row: status pills (All / Draft / Sent / Updated, dark green active) + "Year ▾" pill on the right
- Year pill taps open a white centered modal picker: "All years" + year list (current year down to 2023), with checkmark on selected
- Full invoice FlatList: white card rows with shadow, gap: 8 between cards
  - Each row: invoice number · client name (left) + amount · date · status pill (right)
  - Status pills: Draft (grey), Sent (green), Updated (amber)
  - Tap row → full invoice detail/edit screen
- Empty state: "No invoices yet"

---

**Earnings tab:**

**Time range pills (flexWrap row inside ScrollView):**
- Month | Last month | Quarter | Year | All time
- Active pill: dark green filled (#244e43). Inactive: white with grey border.
- Pills wrap to two rows if needed.

**Hero income card (dark green):**
- Period label in muted uppercase (e.g. "Q2 2026 · APR–JUN")
- Large income total: `€[amount]` — session packages + manual entries (white, 40pt bold)
- Comparison row: ↑/↓ €[diff] vs [last period] — green tint if up, red tint if down
- "All time" range: no comparison row

**Stats row (two cells):**
- Left: Sessions delivered (completed sessions count in period)
- Right: Invoiced (€ sum of sent + updated invoices with `issue_date` in period)

**Earnings bar chart:**
- Section label "EARNINGS"
- View-based bars (no SVG), proportional heights based on period max
- Week bars (Wk 1–4) for Month/Last month ranges; month bars for Quarter/Year; year bars for All time
- Bar label below + amount below label (€ or —)
- Reflects session package income + manual entries (not invoice income separately)

**By client breakdown:**
- Section label "BY CLIENT"
- One row per client: colored initials circle (cycling `CLIENT_COLORS` array) + name + package subtitle + amount right-aligned in dark green
- Sorted descending by amount

**Manual historical entry (bottom dashed card):**
- Dashed border card: "Add historical entry" + "+ Enter past income manually"
- Tap → white centered modal: Label, Amount (€), Month (optional, 1–12), Year fields
- Saves to `finance_manual_entries` table; included in totals and bar charts

**Data sources:**
- Session income: `session_packages.price_eur` filtered by `activated_at` in period
- Manual entries: `finance_manual_entries` filtered by `entry_year` / `entry_month`
- Invoice income (stats row only): `invoices.gross_amount_eur` where `status in ('sent','updated')` AND `issue_date` in period AND `created_by = trainerId`
- Sessions count: `sessions` filtered by `date` in period, `status = 'completed'`
- `loadFinanceData(range, trainerId)` — trainerId required for invoice income query

**Comparison logic:**
- Current period packages+manual vs same-length previous period
- Month → vs previous calendar month · Last month → vs 2 months ago · Quarter → vs previous quarter · Year → vs last year · All time → no comparison

---

#### All Invoices screen ✅

File: `app/(trainer)/all-invoices.tsx`

Standalone screen (accessible via deep link or future navigation). Finance tab Invoices tab is the primary invoice view and duplicates this functionality inline.

- Header: back button · "All Invoices" title · ＋ button (new invoice)
- Search bar + status filter pills (All / Draft / Sent / Updated) + Year dropdown pill (same pattern as Finance Invoices tab)
- No month filter — year only. Tapping "Year" pill opens white centered modal picker.
- Invoice FlatList: white cards with shadow, gap: 8

---

#### Invoice system ✅

Invoices are created from the Finance tab and visible on the client's Me tab.

**Invoice data model (as built):**
```
id, invoice_number (text, sequential NNN-YYYY),
client_id, created_by,
status (draft | sent | updated | paid),
issue_date,
paid_at (timestamptz, nullable — set when trainer confirms payment),
line_items (jsonb array: [ { description, additional_info, leistungszeitraum, quantity, unit_price_eur, total_eur } ]),
net_amount_eur, vat_rate (19), vat_amount_eur, gross_amount_eur,
notes (nullable),
trainer_snapshot (jsonb — trainer details at time of send),
client_snapshot (jsonb — client details at time of send),
pdf_url (nullable — HTML file stored in invoices Supabase bucket),
created_at, updated_at
```

**RLS policies:**
- Trainer: ALL where `created_by = auth.uid()`
- Client: SELECT where `client_id = auth.uid()`

**Invoice numbering:**
- Format: NNN-YYYY (e.g. 48-2026) — sequential within each year
- Trainer sets the starting number in Account settings (to continue from existing sequence in Bookipi)

**Create/edit invoice flow (as built):**
- Tap "+ New Invoice" in Finance tab → opens invoice screen
- Client picker (new invoices only; locked after first save)
- Line items: description · additional info · Leistungszeitraum · quantity · unit price · total (auto-calculated)
- "From Package" button (green) → preset picker with 9 hardcoded package presets (always shown, never dynamic)
- "Add line item" button (muted) → appends empty row
- Leistungszeitraum auto-calculated from description: 6er = +6 months, 12er = +9 months, 20er = +12 months from issue date (format DD.MM.YYYY–DD.MM.YYYY); recalculates when issue date changes; editable
- Totals: Nettobetrag (gross/1.19) → Mehrwertsteuer 19% → divider → Gesamtbetrag → Betrag fällig (bold, same as gross)
- Notes field
- **Save Draft** → saves status=draft, no share
- **Preview** → generates HTML invoice, writes to device cache, opens native preview modal

**Invoice preview modal (as built):**
- Full-screen pageSheet showing rendered invoice content natively (no WebView)
- Shows: RECHNUNG header, trainer info, client+meta box, line items table, totals, Betrag fällig, payment instructions
- Two action buttons:
  - **Share** (green filled pill) → uploads HTML to `invoices` Supabase bucket, marks invoice sent/updated, opens iOS share sheet (WhatsApp, Drive, AirDrop, etc.)
  - **Save to File** (accent outline pill) → same upload + mark logic, opens iOS share sheet
  - Either action marks the invoice as `sent` (first time) or `updated` (already sent)
- "Cancel" → dismisses without saving

**Bottom action bar (trainer):**
- `draft` status: **Save Draft** (outline) + **Preview** (dark green filled)
- `sent` / `updated` status: **Mark as Paid** (accent outline) + **Preview** (dark green filled)
- `paid` status: **✓ Paid · [date]** green badge (non-interactive) + **Preview**

**Mark as Paid flow:**
- Tap "Mark as Paid" → white centered modal with date input (prefilled today, format YYYY-MM-DD)
- Confirm → sets `status = 'paid'` and `paid_at = selectedDate`

**Finance tab invoice list:**
- Status filter pills: All / Draft / Sent / Updated / **Paid**
- Paid pill: solid green fill. All pills have `minWidth: 72` so layout never shifts.

**HTML invoice output:**
- German throughout; all Pflichtangaben included
- Dark green (#244e43) header bar + RECHNUNG heading
- Line items table with dark green header row
- Totals: Nettobetrag → Mehrwertsteuer 19% → Gesamtbetrag → Betrag fällig (bold 18px)
- Payment section: IBAN, BIC, Verwendungszweck reminder
- Stored as HTML (not PDF) — Expo Go limitation; convert to PDF in production build

**9 hardcoded package presets (always available):**
- Quick 40: 6er €480 / 12er €900 / 20er €1,400
- Standard 60: 6er €540 / 12er €1,020 / 20er €1,600
- Extended 75: 6er €600 / 12er €1,140 / 20er €1,800

**Trainer Account screen (`app/(trainer)/(tabs)/account.tsx`):**

**CLIENT HOME BANNER section (top of Account screen):**
- "Banner photo" tappable row → `expo-image-picker` → upload to `client-banners` Supabase storage bucket using `arrayBuffer()`
- After upload: 220px tall live preview with drag-to-reposition and ±zoom controls
- Drag gesture: RNGH `GestureDetector` + `Gesture.Pan` adjusts `banner_photo_offset_y` (0–100). Image natural dims fetched via `Image.getSize`; `baseH = naturalH × containerW / naturalW`; image rendered at `containerW × zoom` wide and `baseH × zoom` tall, centered horizontally — no distortion at any zoom level.
- Zoom buttons −/+ (range 1.0–2.5): preserves visible center when changing zoom
- "Remove photo" red link at bottom of banner card — clears the URL and saves `null` on next Save
- Same banner editor logic (including remove) used in Info tab (`app/(trainer)/client/[id]/index.tsx`)
- Saved to `users.banner_photo_url`, `users.banner_photo_offset_y`, and `users.banner_photo_zoom` on the trainer's own user record (NOT `trainer_settings`)
- **This is the default banner for every client.** The client home screen shows the client's own per-client override (set in the Info tab) when present, otherwise falls back to this account banner. Because RLS blocks clients from reading the trainer's `users` row, the client home reads the fallback via the `get_trainer_banner()` `SECURITY DEFINER` RPC — see §5 User model.

**BUSINESS DETAILS section:**
- Full name, street address, city, postcode, phone
- Steuernummer, IBAN, BIC
- Logo (production build only — Expo Go lacks crypto for UUID filename generation)
- Starting invoice number
- Fields use tappable row → centered white modal → Confirm updates local state
- Single **Save** button at bottom: dimmed until any field is modified, shows "✓ Saved" for 2s on success
- Business data stored in `trainer_settings` table (upsert on `trainer_id`); banner data updated in `users` table
- Either way: read-only PDF preview, client cannot edit
- Decide when building client-facing screens
- All time → no comparison

---

### CLIENT SCREENS ✅

The client app has two distinct areas accessed from a home screen.

**Login routing:** clients are routed to `/(client)` (home screen) on login.

---

#### Home screen ✅ (`app/(client)/index.tsx`) — no bottom navigation

The first screen a client sees after login. Pure scroll screen with no tab bar, no switcher, no nav.

**1. Hero photo (top, ~300px content height):**
- Container: `overflow: 'hidden'`, height = `HERO_HEIGHT + insets.top` (extends behind status bar)
- Photo source: uses the client's own `banner_photo_url` if set (with their `banner_photo_offset_y`/`zoom`); otherwise falls back to querying `users WHERE role = 'trainer'` for the trainer's default banner. Trainer removes a client-specific banner from the Info tab ("Remove photo" link) to revert to the default.
- If `banner_photo_url` is set: fetch natural image dims via `Image.getSize`. Render image at `containerW × zoom` wide and `baseH × zoom` tall (`baseH = naturalH × containerW / naturalW`), shifted left by `containerW × (zoom−1) / 2` to center horizontally. Vertical offset: `top = -(offsetY / 100) × (imageH - containerH)`. Use `resizeMode="stretch"`.
- If no banner photo: plain dark green gradient `#244e43 → #1a3d32` fills the container
- Top gradient only: `rgba(0,0,0,0.78) → transparent` covering the top 48% — NO bottom gradient
- Bottom-left: "Hi [firstName]," (17px, muted white) · slogan 19px bold white below; paddingBottom 54px so text clears the rounded card overlay
- Rounded card overlay: scroll area has `borderTopLeftRadius:26, borderTopRightRadius:26, marginTop:-32` so it slides up over the hero bottom
- VFIcon: absolutely positioned in hero using `vf_icon_pos_x/y` ratios × screen dimensions. Position set by trainer in Info tab (client-specific) or Account screen (trainer default). **Known limitation:** preview aspect ratio differs from actual hero, so icon placement in the preview is approximate.

**Scroll behaviour:** The ScrollView uses `contentContainerStyle={{ height: screenH }}` (device screen height) so children with `flex: 1` fill the remaining space exactly. The sheet `View` has `flex: 1` inline so it always covers from the rounded top edge to the bottom of the screen regardless of content height.

**Sheet background:** flat `#faf9f7` — same off-white as the rest of the app, no gradient. `borderTopLeftRadius:26, borderTopRightRadius:26, paddingTop:28`. Cards are stacked in a `cardStack` View with `gap:20`.

**2. Appointments card — white, `borderRadius:20`, plastic shadow (no border):**
- First card in the sheet — appears above the feature tiles
- Plastic shadow: `shadowOffset:{width:0,height:4}, shadowOpacity:0.10, shadowRadius:10, elevation:4`
- "YOUR APPOINTMENTS" 9px uppercase #999 label (`paddingTop:10, paddingBottom:6`)
- Fetches the next upcoming appointment (`status='scheduled'`, `date >= today`, ordered by date+time asc, `.maybeSingle()`) on `useFocusEffect` load.
- **When appointment exists:** `CalendarIcon` (48×~41px, HEADER bg, borderRadius 8, day abbreviation 9px muted · date number 22px bold white) + type label (13px/600, TEXT) + time (12px, MUTED). Chevron right. Full-opacity row.
- **When no upcoming appointment:** single dimmed row (opacity 0.45) with CalendarIcon showing today's date + "No sessions scheduled" italic muted.
- Thin separator + footer row: "See all →" ACCENT left (→ `/(client)/(tabs)/schedule`) · "Give availability →" ACCENT right (tappable → `/(client)/availability`). `paddingVertical:8`.
- Entire card is a `TouchableOpacity` → `/(client)/(tabs)/schedule`.

**3 & 4. Feature tiles row — side-by-side, Nutrition left · Training right:**

`flexDirection:'row', gap:12, marginTop:8` (extra breathing room below appointments card). Each tile is split into two layers — **outer** (`tileOuter`: `flex:1, borderRadius:20` + plastic shadow, no `overflow`) holds the shadow; **inner** (`tileInner`: `height:228, borderRadius:20, overflow:'hidden'`) clips the gradient. Content layout: `padding:16, justifyContent:'space-between'` — title + bullets at top, arrow at bottom-left.

**Nutrition tile (left):**
- Gradient: `['#2d7a68', '#1e4f42', '#163830']`, `start:{x:0.4,y:0}`, `end:{x:0.6,y:1}` (~160°)
- Icon watermark: `PearIcon` (`components/icons/PearIcon.tsx`), **112px**, `rgba(255,255,255,0.10)`, absolutely positioned `right:-48, bottom:0`. 60% of the icon is visible (right 40% clipped by the tile's `overflow:'hidden'`). `strokeWidth=1.0` (component default; renders slightly bolder at large watermark sizes).
- Title: "Nutrition" 20px/600 white
- Four bullet rows below title (each a `TouchableOpacity`): **Food log · Favourites · Weekly · Grocery** — mirrors the Nutrition bottom nav tabs. Each row = 3px white dot + 12px `rgba(255,255,255,0.55)` label, `marginTop:11, paddingVertical:2`. Tapping navigates directly to that screen.
- Food log → `/(client)/nutrition` · Favourites → `/(client)/nutrition/favourites` · Weekly → `/(client)/nutrition/weekly` · Grocery → `/(client)/nutrition/grocery-list` (route file is `grocery-list.tsx`, not `grocery`)
- Arrow: `arrow.right` 13px `rgba(255,255,255,0.4)` at bottom-left via flex layout
- Tapping tile title/arrow area → `/(client)/nutrition/`

**Training tile (right):**
- Gradient: `['#244e43', '#1a3830', '#112820']`, same `start`/`end` as Nutrition
- Icon watermark: `KettlebellIcon` (`components/icons/KettlebellIcon.tsx`), **120px**, `rgba(255,255,255,0.10)`, `right:-48, bottom:-10`. `bottom:-10` compensates for the extra empty space at the bottom of the kettlebell SVG viewBox so its visual base aligns with the pear. 60% visible, right 40% clipped. `strokeWidth=0.9` (component default).
- Title: "Training" 20px/600 white
- Four bullet rows (each a `TouchableOpacity`): **Workouts & Routines · Appointments · Progress · Me** — mirrors the Training bottom nav tabs. "Training" omitted (repeats title); "Workouts & Routines" covers both screens. Same bullet style as Nutrition.
- Workouts & Routines → `/(client)/(tabs)/train` · Appointments → `/(client)/(tabs)/schedule` · Progress → `/(client)/(tabs)/progress` · Me → `/(client)/(tabs)/me`
- Arrow: `arrow.right` 13px `rgba(255,255,255,0.4)` at bottom-left
- Tapping tile title/arrow area → `/(client)/(tabs)/train`

**tileIconWrap style:** `{ position:'absolute', right:-48, bottom:0 }` shared by both tiles; kettlebell overrides with `bottom:-10` inline.

**5. VITEK FITNESS wordmark:**
- `VFLogo` component with `textOnly={true}`, `width:148`, `color:'rgba(36,78,67,0.28)'` — renders only the "VITEK FITNESS" text path (no VF figure mark), dark green at 28% opacity, watermark feel.
- Centered below the tiles, `paddingTop:20, paddingBottom:8`. No decorative rule.

---

#### Train area — Bottom navigation: Training · Appointments · Progress · Me

Tab bar bg: `#faf9f7`, accent active tint, 10px label font, `tabBarItemStyle: { flex: 1 }` on each visible tab. Overview tab hidden via `tabBarButton: () => null` + `tabBarItemStyle: { flex: 0, width: 0, overflow: 'hidden' }` — takes no space in the tab bar flex layout.

**Header layout (62px row height, `#244e43` bg, defined in `_layout.tsx`):**
- **Training tab:** `KettlebellIcon` 32px (left) — tapping opens the training `NotificationOverlay` (or the session modal when a session is suspended). No vibration on tab focus (removed). Badge dot when unread training notifications exist.
- **All other tabs (Appointments · Progress · Me):** back chevron (left) · title centered · VFIcon 30px (right → home screen). The back chevron does a **true back** (`router.canGoBack() ? router.back() : router.navigate('/(client)')`) — it returns the client to wherever they came from, which is normally the home screen since the home-screen tiles `router.push` directly into these tabs. It does NOT jump to the Training tab. The VFIcon remains the explicit "home from anywhere" button.
  - **Required navigator config:** the `<Tabs>` navigator sets `backBehavior="none"`. With the default (`firstRoute`) the bottom-tab navigator intercepts `router.back()` and switches to the first tab (`train`) instead of letting the back propagate up to the parent `(client)` Stack → home. The nutrition `<Tabs>` (`app/(client)/nutrition/_layout.tsx`) sets the same, so its `weekly`/`grocery`/`favourites` back chevrons reach home rather than stopping at the Food Log tab.
- Left and right elements each occupy a 48px-wide touch area (`hdrStyles.side`)
- Unread training notification count checked via Supabase on mount (`useEffect` in `ClientTabsLayout`)

---

#### Overview screen (`app/(client)/(tabs)/overview.tsx`)

Client's personal training status dashboard. Exists as a hidden tab (href: null in the tab layout) but is currently not reachable from anywhere in the UI — the home screen Training entry card routes to the Training tab instead. This screen is deferred; the Training tab covers the same information for now.

**1. Upcoming sessions card (white, borderRadius 14):**
- When session scheduled: calendar date widget (`#f0f8f5` bg, accent green DOW abbreviation, large bold day number) · "Next session" bold · formatted date + time · trainer note in accent green italic · "See all →" button → Appointments tab
- When no session: muted "No sessions scheduled" · "See all →"

**2. Training status card (dark green gradient):**
- Package progress ring (SVG, `StatusProgressRing`) top-left
- "LAST DONE" row: last completed workout name + days ago
- "NEXT UP" row: next programmed workout name
- Stats row: Sessions total · Streak · Days since last session
- Amber warning row when package is expiring soon or sessions low

**3. Last session highlights:**
- Queries last 2 completed sessions; computes per-exercise weight direction (↑↓→) and diff
- Up to 3 exercise rows with arrow icon (accent/red/grey), exercise name, current weight, diff label

Data: `fetchClientTraining(profile.id)` + `session_packages` for active package + `calendar-next-session` edge function for upcoming session widget.

---

#### Training tab ✅ (`app/(client)/(tabs)/train.tsx`)

Dark green header "Training". Tab background: **`#faf9f7`**. Scroll order: gauge section (no card wrapper) → session card → WORKOUTS gallery → ROUTINES section.

- **`WeeklyGaugeCard`** (standalone component, rendered when `weeklyGoal != null`):
  - **No card wrapper** — the arc, pips, message, and days strip sit directly on the `#faf9f7` tab background. `gcStyles.container` is a plain transparent `View` (`marginTop:18, paddingTop:4, paddingBottom:4`). Only the session card and the stat tiles are white cards.
  - **No floating header row** — week label lives inside the arc; calendar icon lives above the days strip.
  - **Two greens only** — muted/secondary green text uses `#3a7d6b` (arc label, `"workouts"`, message); bright ACCENT `#24ac88` is reserved for meaningful accents (arc fill, DONE, selected day, session dots). The old lighter `#7aaa8a` green was removed — do not reintroduce a third green.
  - **Arc (SVG):** `PAD=8`, `R = Math.round((sw - 80) / 2.2)`. Track `rgba(36,172,136,0.15)` 11px. Fill: solid `#24ac88` when not exceeded; SVG gradient (`gradientUnits="userSpaceOnUse"`, `#24ac88 → #f5a623` left-to-right) when exceeded. Arc center text: week+goal label (10px/600, `#3a7d6b`) e.g. `"THIS WEEK GOAL"` / `"NEXT WEEK GOAL"` / `"8 - 14 JUN GOAL"` · count (34px/500) · `"workouts"` (11px, `#3a7d6b`).
  - **Stats (absolutely positioned):** container `height: svgH + 48`. DONE (60px-wide block) centered at `left: PAD - 30`; BONUS/LEFT (60px-wide) centered at `left: D + PAD - 30`. DONE label: `#24ac88`. LEFT label: `#1a1a1a`. BONUS number+label: `#f5a623`.
  - **Pips:** 24×24 circles, `marginTop:6`, centered (`justifyContent:'center'`). **Only completed pips are rendered — never dimmed/empty pips.** Done (`Math.min(weeklyCompleted, weeklyGoal)`): `rgba(36,172,136,0.2)` + 🏋️ emoji (fontSize:11, opacity:1). Bonus (exceeded): `rgba(245,166,35,0.2)` + 🏋️ emoji (opacity:1). Because the row is centered, 1 done shows a single centered pip, 2 done shows two, etc. **Hidden entirely when `weeklyCompleted === 0`** — at 0 done the message alone carries the state; pips appear only once there's progress/bonus.
  - **Per-pip → single workout:** **each pip is individually tappable and maps to the specific workout that produced it.** Sessions are sorted oldest→newest, so pip 1 = the first workout of the week, pip 2 = the second, and bonus pips continue the sequence past the goal. Tapping one pip opens a compact white centered **single-pip overlay** showing just that workout: a "WORKOUT DONE" label, the workout cover (or green gradient fallback with a ✓ badge), the workout name (or "Free session"), and the full date. If a pip has no matching session (only when viewing a swiped non-current week, since the goal count reflects the current week while the session list reflects the viewed week), it falls back to opening the full overview.
  - **Message → full overview:** the message below the pips is tappable in all states (including 0 done, where the overlay shows an empty state prompting the first workout) → opens the white centered "Trainings done" overlay listing **all** the week's completed sessions (workout name + weekday/date, sorted ascending) with a `gaugeWeekLabel · N of goal` subtitle and a Done pill. The pips themselves no longer open this full overview — only the message text does.
  - **Message (11px/500, marginTop:5, centered, `#3a7d6b`):** 0 → "First workout this week awaits" · partial → varied text via `motivationMsg(done, goal)` · exact → ACCENT checkmark + "Goal reached this week" · exceeded → amber flame + "Goal exceeded — great week!".
  - **Goal-reached celebration (`GoalCelebration` component):** a one-time full-screen confetti burst (88 brand-colour pieces falling with drift + rotation, staggered so they rain through the message) + a centered white badge ("🎉 Weekly goal reached! / Great work this week") that springs in, holds, and fades. Fires when the client reaches their weekly goal (`weeklyCompleted >= weeklyGoal`) and is back on the Training tab. Includes a short celebratory `Vibration`. Overlay is `pointerEvents="none"`, `zIndex:999`, auto-dismisses after ~6.2s. **Fires once per at-or-above-goal streak, per week** via `checkGoalCelebration()`, which queries the **real current week** (independent of the viewed week) and uses a persisted per-week AsyncStorage flag (`goalCelebrated:<monday>`): reaching goal with the flag unset celebrates + sets it; dropping below goal clears it (re-arms). A persisted flag (not an in-memory ref) is required because the Training tab remounts after the log → session-complete flow. Called on tab focus and after a session delete. Re-fires if a session is removed and re-logged (also how to test it). Training tab only (not the home screen).
  - **Divider:** `height:0.5, backgroundColor:'rgba(36,78,67,0.28)', marginTop:12, marginHorizontal:12` — separates message from days section.
  - **Always expanded** — no chevron, no collapse state. Days row + session card always visible.
  - **Days section** (`gcStyles.daysSectionWrap`, `marginHorizontal:12, marginTop:10`): two children:
    1. **`calBtn` row** (`alignSelf:'flex-end', flexDirection:'row', gap:8, paddingBottom:6`): when `weekOffset !== 0` shows a **today button** (18×18 HEADER circle, white date number 9px/700) tapping `onGoToToday` → `setWeekOffset(0) + setSelectedDate(todayStr)` · always shows `calendar` SF Symbol 18px HEADER → `onOpenCalendar`.
    2. **`daysRow`**: **no ‹/› arrows** (removed to give the days more space; week navigation is swipe-only), day circles 34×34, day numbers 17px/600. Today: ACCENT green number. Selected: `#24ac88` bg + white number. Session dot 5×5 `#24ac88`. Swipe via PanResponder on `daysSectionWrap`.
  - **Session card** — two-layer: `sessCardOuter` (`marginHorizontal:12, marginTop:8, borderRadius:12`, white card shadow) holds the shadow; `sessCard` (`borderRadius:12, overflow:'hidden'`) clips content. Floats as a standalone white card on the `#faf9f7` background. Cover 62px + highlights area (no "THIS SESSION" label). Highlights: `ellipsis` button right-aligned → move calendar; stat row (timer duration + exercises done/total); exercise list with deltas. Same-weight delta (`→ X kg`) shown in black (`TEXT`). Shown only when `selectedSession` exists.
  - **Session card ⋯ menu (client):** tapping `ellipsis` opens a white centered action menu with **Move training** and **Delete**. **Move training** → calendar picker modal (white centered) showing `dumbbell.fill` icons on days with completed sessions; tapping a day selects it (dark green circle) → confirmation bar "Move to [Weekday, D Mon]?" + ACCENT "Move" pill; navigating months clears selection; moves `sessions.date`. **Delete** → confirmation modal ("Delete training?" · "This removes the session from your calendar. The workout itself is not deleted." · red Delete pill · grey Cancel) → deletes the `sessions` row only (workout untouched; child logs/photos cascade), then reloads the week + the weekly goal count. Requires the `sessions: client deletes own` RLS policy (`FOR DELETE USING (client_id = auth.uid())`). (Delete was added so a client can undo a mistaken log; previously they could only move.)
  - **Empty day** (`emptyDay`, `paddingVertical:10, marginTop:2` — sits close under the days strip): day-scoped text — **"No workout logged today"** when the selected day is today, otherwise plain **"No workout logged"** (the highlighted calendar day already conveys which day) — + ACCENT `+` (`marginHorizontal:12`) — no white box. This day-scoped line is intentionally distinct from the week-scoped gauge message; do not merge them. Tapping → "Training" modal with exactly **two options**: **Log workout** (faded opacity:0.4, non-tappable if `standaloneWorkouts` is empty) and **Log routine** (faded, non-tappable if no `activeRoutine`). Both navigate to `all-workouts` and `all-routines` respectively. No subtitle text on options. **Logging for a non-today selected day:** when the selected day is not today, the logged session is dated to that day, not the current day. The picked date is carried through the log flow (all-workouts/all-routines → session-intro → Do Mode) via `pendingLogDate` in `sessionStore` (URL params would need threading through too many screens); Do Mode consumes it once when creating the session and clears it, and does **not** overwrite the date on completion; the Training tab clears it on focus so a backed-out flow can't leave a stale date.
  - `loadWeeklyGoal()` always queries **current** week (not offset-dependent). `loadWeekSessions()` reloads on week navigation.

- **WORKOUTS section** (replaced the old two square tiles): section header (🏋️ emoji + "WORKOUTS" label + "See all →" → `all-workouts`) above a **horizontal** `ScrollView` of mini cover cards. The gallery **lives on its own** — it is NOT tied to the week strip (does not reload on week navigation).
  - Data: active, non-stretching workouts with their **all-time** last-completed date. Sorted most-recently-done first; never-done fall to the end. `loadWorkoutsSection()` runs on focus only (no week param).
  - Mini card (width 180, two-layer white card, cover 90px): cover image or `['#2a5448','#1a3832']` gradient fallback + bottom dark overlay · workout name bottom-left · category pill bottom-right. **No ✓ badge, no cover date.** Body (pinned to the bottom via `flex:1, justifyContent:'flex-end'` so the date lines up across cards): for **routine-linked** workouts a `RoutineIcon` + routine name line, then the last-done line; for **standalone** workouts just the last-done line (no "Standalone" label — the absence of a routine is implicit). Last-done line = `Done <D Mon>` (ACCENT green) or `Never done` (grey). Cards tap into `session-intro`.
  - Dashed **"See all N"** card at the end of the row → `all-workouts`.
- **ROUTINES section:** section header (`RoutineIcon` + "ROUTINES" label + "See all →" → `all-routines`) above the **active routine** rendered with the same `RoutineCard` component/styles copied from the My Routines screen — but as a **plain white card** (the beige `#ffffff→#f0eee9` gradient was dropped so it sits cleanly on the `#faf9f7` background). Shows cycle-progress ring, name, "X workouts · Y% complete", Active badge, program-order strips, and ⋯ (opens `RoutineQuickLookModal`). When there is no active routine: grey "No active routine" text.
- **No dividers** between the session card and WORKOUTS, or between WORKOUTS and ROUTINES. Section headers use `paddingTop:18, paddingBottom:14` for breathing room above the cards. 24px bottom padding after the ROUTINES section.

- **Tip of the day:** moved to kettlebell tap overlay — no longer a scroll card. See kettlebell/header section above.

---

#### Session Intro screen ✅ (`app/(client)/workout/session-intro.tsx`) — CLIENT ONLY

Shown between a **client** workout-card tap and Do Mode — a cinematic full-screen preview. **Client-only:** the trainer version was removed (July 2026); trainer taps go straight to Do Mode. It is **always shown** (never skipped) — with no exercise `thumbnail_url`s it falls back to a dark-green gradient + faint dumbbell.

**Route:** `/(client)/workout/session-intro?workoutId=<id>` (static route — takes priority over the dynamic `[workoutId]` route).

**Two buttons, context-aware.** The screen reads `sessionDate` / `planned` params to decide what to show:
- **Launcher** (gallery / all-workouts / routine — no params) → **View session** + **Start session today**.
- **Completed session card, today** → **View session** only.
- **Completed session card, past** (week strip) → **View session** + **Start session today**.
- **Planned/future card** (`planned=1`) → **View session** only.

**"Start session today"** (always this label — starting always logs a session dated **today**) → `router.replace('/(client)/workout/<id>?autoStart=1')`, which auto-starts immediately (timer running, FINISH visible). **"View session"** → `router.push('/(client)/workout/<id>?viewOnly=1&viewMode=<finished|start|none>')` — a **fully read-only** Do Mode (never startable; a completed session shows a non-clickable `mm:ss · FINISHED` pill, others no pill). Starting is only ever the Start button.

**Background — alternating-layers crossfade:**
Two `Image` / `Animated.Image` components always mounted (layer 1 + layer 2). Only the *invisible* layer ever has its source updated — this prevents any visible flash:
- When layer 2 is invisible (opacity=0): set layer 2 source to new image, fade layer 2 opacity 0→1 (600ms, native driver).
- When layer 2 is visible (opacity=1): set layer 1 source to new image (hidden under layer 2), fade layer 2 opacity 1→0.
Slideshows through exercises with `thumbnail_url` in workout order, cycling every **2 seconds**. Exercises without a photo are skipped in the slideshow but shown in the exercise list. Slideshow loops.

**Overlays (on top of background):**
- Full-screen `rgba(0,0,0,0.55)` dark layer
- Bottom `LinearGradient`: `rgba(0,0,0,0.85)→transparent`, 320px from bottom
- Left `LinearGradient`: `rgba(0,0,0,0.5)→transparent`, 160px from left

**Top area:**
- Back button: 34×34 white circle `rgba(255,255,255,0.12)`, chevron.left
- Session meta centered (between back button and spacer): fontSize **13**, `rgba(255,255,255,0.55)` — context-aware text: `"Session X · D Mon"` (launcher) / `"Done · D Mon"` (completed) / `"Planned · D Mon"` (future)
- Top label: fontSize 11, `rgba(255,255,255,0.35)`, letterSpacing 1, uppercase — `"Today's session"` / `"Past session"` / `"Planned session"` by context
- Workout name: 24px/700, white
- Progress dots (hidden when only 1 photo exercise): one dot per exercise with `thumbnail_url`; active = ACCENT `#24ac88` width 26; done (before active in slideshow) = `rgba(255,255,255,0.5)` width 18; upcoming = `rgba(255,255,255,0.2)` width 18; height 2, borderRadius 1, gap 4. Dots and exercise list update at the **start** of each transition (not the end), so they track the animation.

**Bottom area (absolute, bottom of screen):**
Exercise list (`paddingHorizontal:20, gap:8`) with a dot + name per row:
- **Done** (order_index before active): dot `rgba(255,255,255,0.4)`, name `rgba(255,255,255,0.45)`, 13px/400
- **Active** (currently showing in slideshow): dot ACCENT, name `#fff`, 15px/700
- **Upcoming** (order_index after active): dot `rgba(255,255,255,0.2)`, name `rgba(255,255,255,0.25)`, 13px/400
- Tapping an exercise name with a `thumbnail_url` jumps instantly to that slide; slideshow pauses and resumes after 2s.

**Buttons row:** `marginHorizontal:20`, `marginBottom: max(36, insets.bottom+16)`. **View session** = white outline pill (`rgba(255,255,255,0.6)` border, `flex:1`). **Start session today** = ACCENT `#24ac88` filled pill (`flex:1.25`), shown only for launcher / past contexts. When only View is shown it fills the row.

---

#### Appointments tab ✅ (`app/(client)/(tabs)/schedule.tsx`)

Second tab (file: `schedule.tsx`, tab label: "Appointments"). Dark green header provided by `_layout.tsx`.

**Data:** fetches ALL appointments (`client_id = auth.uid()`, no status filter — includes cancelled + cancelled_charged). Builds three date sets on load: `completedDates`, `cancelledDates` (includes `cancelled_charged`), `scheduledDates`. Also fetches trainer phone from `users` table for WhatsApp link in move request modal.

**Screen layout (top to bottom):**

1. **Monthly calendar card** (white, `borderRadius:16`, `padding:14`)
   - Header: `‹` Month Year `›` (no session count subtitle)
   - Mo–Tu–We–Th–Fr–Sa–Su day label row
   - Date grid: today = ACCENT circle · selected = HEADER dark green circle · tap again to deselect
   - **Dot below each date** (5×5, `borderRadius:2.5`):
     - Cancelled / cancelled_charged: red `#e85d4a` (priority 1)
     - Completed: light green `#b8ede0` (priority 2)
     - Scheduled/upcoming: ACCENT `#24ac88` (priority 3)
     - No dot: no appointment
   - **Legend** at bottom of card (no separator line, `marginTop:6`): ● Upcoming · ● Done · ● Cancelled
   - `localDateStr()` helper used everywhere — never `toISOString()`

2. **Selected date detail card** (white card, shown when a tapped day has appointments)
   - Section header: formatted date e.g. "Sun, 7 Jun" in HEADER dark green
   - One `ApptDetailRow` per appointment on that day (`showDate=false`)
   - Tapping the same date again collapses the card

3. **YOUR SESSIONS section** (shown when upcoming scheduled appointments exist)
   - White card with tappable rows — one per future scheduled appointment
   - Each row: ACCENT left stripe 3px + appointment type + date/time/duration + `›` chevron
   - Tapping → white centered **Move Request modal**:
     - **If >24h before appointment:** "REQUEST TO MOVE" label + multiline TextInput + "Send request" button → inserts `move_requests` row + shows "Request sent" confirmation
     - **If ≤24h before:** "This session is too soon to request a change in the app." + "Contact Vitek on WhatsApp" button → `Linking.openURL('https://wa.me/TRAINERPHONE')`
   - Trainer phone fetched from `users` where role='trainer' on load

4. **Give Availability** — white card row with 1.5px ACCENT green border, `calendar` SF Symbol icon left (ACCENT), bold ACCENT "Give Availability" title, `chevron.right` icon right. Tappable → navigates to `/(client)/availability`.

   **Saved availability chips** — white card rendered immediately below the Give Availability button when the client has saved slots for any future week. One row per future week: `checkmark.circle.fill` ACCENT · "Availability saved · week of DD–DD Mon" HEADER/500 · `chevron.right` muted. Tapping navigates to `/(client)/availability?weekStart=YYYY-MM-DD`. Loaded via `availability_slots` grouped by `week_start`, filtered to `>= current Monday`, sorted ascending. Fetched in parallel with appointments in `load()`.

5. **PAST SESSIONS section** — label + "See all →" ACCENT link top-right → `router.push('/(client)/past-sessions')`
   - Shows only the single most recent past appointment
   - `ApptDetailRow` with `showDate=true`

6. **MY PACKAGE section** — card: name · "X of Y sessions remaining" · ACCENT progress bar (height 6). No active package: "No active package" italic muted.

**`ApptDetailRow` component** (exported from `schedule.tsx`, shared with `past-sessions.tsx`):
- **`showDate=true`** (used in PAST SESSIONS and past-sessions list):
  - Row 1: date bold left + status badge right
  - Row 2: time · duration (`fontSize:14, color:TEXT`, `marginTop:4`)
- **`showDate=false`** (used in selected date detail):
  - Single row: time · duration left + status badge right
- **Status badge:** 22×22 circle — ACCENT green + white `✓` for completed; RED `#e85d4a` + white `✗` for cancelled. No badge for scheduled.
- **No type pill** — to be designed in a future iteration
- Notes shown below (`fontSize:13, color:MUTED, lineHeight:18`) when `appt.notes` non-empty
- Rescheduled indicator: amber `↕ Moved from [date] at [time]` when `appt.is_rescheduled=true` + `appt.original_date` set (DB columns `is_rescheduled`, `original_date`, `original_start_time` are in the type but not yet added to the appointments table)

---

#### Past Sessions screen ✅ (`app/(client)/past-sessions.tsx`)

Reached via "See all →" from the Appointments tab.

**Header:** `SafeAreaView edges={['top']}` + 62px bar. Pattern identical to `all-workouts.tsx`: chevron.left → `router.back()` left; "Past Sessions" 18px/700 white centered; VFIcon → home right.

**Filters (top of scroll content):**

1. **Status switcher** — Type 1 three-pill: All | Done | Cancelled. Changing status resets month filter (not year).

2. **Year filter row** — tappable white card row: "Year" label left · selected value ("All years" or e.g. "2026") right in ACCENT when active · `chevron.down` SF Symbol (ACCENT when active, MUTED default). Tapping opens white centered modal: "All years" option at top + year rows with their status-filtered session count right-aligned. Selecting a year resets month filter.

3. **Month filter row** (shown only when a year is selected) — same row style: "Month" label · selected value ("All months" or e.g. "Jun") · soft green count badge (`rgba(36,172,136,0.12)` bg, ACCENT text, `borderRadius:100`) showing session count for current selection · `chevron.down`. Tapping opens white centered modal with "All months" + individual months with counts.
   - Count badge = **year total** when "All months"; **month count** when a month is selected
   - The **year row has no count badge** — count lives in the month row only

**Session list:** groups by month (e.g. "JUN 2026" section label). Each group is a white card with 0.5px dividers between rows. Each row: `ApptDetailRow showDate=true` inside `padding:14`.

**Empty state:** "No sessions match the selected filters" muted italic centred.

**Key implementation note:** `monthDisplayCount` must be computed **after** `availableMonths` array — ordering dependency (was the cause of a "cannot read property 'find' of undefined" crash).

**Shared exports from `schedule.tsx`:** `ApptDetailRow`, `type Appointment`, `TYPE_LABELS`, `localDateStr`, `formatDate`, `formatTime`, `det` StyleSheet.

---

#### My Availability screen ✅ (`app/(client)/availability.tsx`)

Reached from the "Give Availability" card in the Appointments tab (no param), or from a saved-week chip (`?weekStart=YYYY-MM-DD`).

**Header:** dark green, chevron.left back left · "My Availability" 18px/700 centered · VFIcon 28px right → home. Same pattern as `all-workouts.tsx`.

**URL param:** optional `weekStart` (YYYY-MM-DD). When provided, `weekOffset` is initialised to the Monday diff from today (`Math.round((target - currentMonday) / 7days)`), clamped to ≥ 0.

**Week picker card** (white, `borderRadius:14`):
- `‹` / `›` arrows to navigate weeks. Default: next week (`weekOffset=1`). Minimum: current week (`weekOffset=0`, ‹ disabled). No maximum.
- Center: "Week of [D Mon]–[D Mon]" 14px/700 + "This week" / "Next week" / "In N weeks" tag in ACCENT 11px/600 below
- Subtitle: "Tap or drag down to add · drag up to remove" 11px muted
- **Existing-slots info note** (shown below subtitle once load completes, only when `hasExistingSlots=true`): `SymbolView name="info.circle"` 12px ACCENT + ACCENT text "You've already shared availability for this week — submitting will update it." Resets when the week changes.

**Grid card** (white, `borderRadius:14`, `flex:1` fills remaining screen space — **no ScrollView on the screen**, preventing gesture conflicts):
- Day headers: Mo · Tu · We · Th · Fr
- Left column (28px): hour labels 8px `#777` at each hour mark (08–20)
- 5 day columns: each with its own **PanResponder** (independent — so tapping a different column always works cleanly)
- **Slot cells:** `flex:1` (not fixed height) — flexbox distributes the column height evenly across 25 slots. No circular dependency on height measurement.
- Slot height for PanResponder is measured from slot 0's `onLayout` and stored in a ref. `pageY - colTopY` (via `measureInWindow`) gives the correct position regardless of where in the column the user touches (`locationY` would be relative to the tapped child cell, not the column — always near 0).
- 25 selectable slots: 08:00–20:30 (each slot = 30 min). Slot index → time: `08:00 + index × 30min`.
- Only solid lines at hour boundaries (even indices). No dashed half-hour lines.
- Selected slots: `rgba(36,172,136,0.22)` green fill
- **Loading overlay** — semi-transparent white + `ActivityIndicator` rendered over the grid while `loadingSlots=true` (during initial load and week changes).

**Loading existing slots:** `useEffect([profile.id, weekStart])` — clears `selected`, fetches `availability_slots` for `client_id + week_start`, reconstructs `selected` Set from `day_of_week` (→ col 0–4) and `start_time` (→ slotIdx). Sets `hasExistingSlots = rows.length > 0`.

**Gesture logic (per-column PanResponder):**
- **Tap** (< 6px movement): toggles single slot
- **Drag down** (first movement `dy ≥ 0`): ADD mode — all crossed slots get selected
- **Drag up** (first movement `dy < 0`): DELETE mode — all crossed slots get cleared
- Mode locked on first real movement. No dependency on start slot's selection state.
- `onPanResponderTerminationRequest: () => !isDragging` — releases gesture if not mid-drag

**Submit button** (ACCENT filled pill, full width): deletes existing `availability_slots` for client + week_start, inserts new rows, notifies trainer, navigates back.
- `trainer_id` sourced from client's `appointments` (clients cannot query `users` by role due to RLS). Fallback: `availability_slots` for the client.
- If slots > 0: insert rows, check for existing `availability_notifications` row (→ `is_update`), upsert `availability_notifications {client_id, trainer_id, week_start, status:'pending', is_update}`.
- If slots = 0: delete any existing `availability_notifications` for this week (no trainer notification when availability is cleared).

---

#### Progress tab ✅ (`app/(client)/(tabs)/progress.tsx`)
Wraps `ProgressTab` from `app/(trainer)/client/[id]/progress-tab.tsx` with `clientId = profile.id`, `client = profile`, and **`variant="client"`**. Two sub-tabs: **Body composition** | **Strength**.

**Tab switcher style (client only):** Plain underline text — two labels centered horizontally, active label has a 2px ACCENT (#24ac88) underline and dark text; inactive is muted grey (#bbb). Font 17px, gap 32, marginTop 8, marginBottom 24. No pill/background. This is different from the trainer side which uses the Type 1 segmented pill switcher. The `variant="client"` prop on `ProgressTab` controls which style renders.

Client can view all their own data and add measurements (tagged "Added by you"). ScrollView content uses `padding: 16, paddingBottom: 32`.

---

#### Me tab ✅ (`app/(client)/(tabs)/me.tsx`)

**Dark green header** — "Me" title

**Profile card:** circular avatar (tappable → picks photo from library, uploads to `profile-avatars` bucket via `arrayBuffer()`, updates `users.avatar_url`; falls back to initials on dark green circle) · Name (22px/800 bold) · "@username · email · Client since [date]" muted subtitle

**MY PROFILE section** — white card with tappable rows (tappable row → centered white modal with TextInput + Confirm + Cancel, same pattern as elsewhere):
- Name
- Date of birth (displayed as DD.MM.YYYY; stored as YYYY-MM-DD; both formats accepted on input)
- Sex (opens white centered modal with Male / Female pill buttons — tapping the same sex again deselects it)
- Phone
- Street address
- City
- Postcode
- Country
Each field saves immediately to `users` table on confirm; shows "✓ Profile updated" toast for 2s. Uses `InputAccessoryView` to suppress iOS keyboard Done toolbar.

**MY PACKAGE card:**
- Active package: name · "Valid until [date]" · progress bar · stats row (Remaining / Used / This month) · amber warning ≤30 days / ≤2 sessions
- No active package: muted placeholder

**INVOICES card:**
- Shows `sent`, `updated`, and `paid` invoices (fetched via RLS client policy)
- Each row: invoice number · issue date · amount · status pill
  - `sent` or `updated` → amber **"Unpaid"** pill (persistent visual reminder — Phase 2: push notification reminders)
  - `paid` → solid green **"Paid"** pill + "Paid [date]" subtitle below the issue date
- Tappable → `Linking.openURL(invoice.pdf_url)` when pdf_url is set
- Empty: muted "No invoices yet"

**ACCOUNT card:**
- "Change password" (lock icon) → white centered modal with two TextInputs (secure, New password + Confirm) → `supabase.auth.updateUser({ password })` → "✓ Password updated" toast
- "Sign out" (red text + icon) → white centered confirm modal → `signOut()` → routed back to login

---

#### Client Nutrition area ✅ (`app/(client)/nutrition/`)

Accessed from the Nutrition entry card on the client home screen. Separate stack with its own bottom tab navigation — outside the client's main `/(client)/(tabs)/` area.

**Navigation structure:**
- **Bottom nav (4 visible tabs):** Food Log · Favourites · Weekly · Grocery
- **Tips tab** (`app/(client)/nutrition/tips.tsx`): hidden (`href: null`) — replaced with a `<Redirect>` to the Food Log. Content previously shown there is now in the pear notification overlay (tip of the day) and the Favourites tab (recipes, recommendations).
- **Hidden routes** registered in `_layout.tsx`: `tips`, `recipes`, `recommendations`, `recipe/create`, `recipe/[id]`
- Files: `app/(client)/nutrition/_layout.tsx` (tab layout), plus one file per tab

---

**Food Log tab** (`app/(client)/nutrition/index.tsx`) ✅

**Header (glass `LightHeader`, migrated from the old 62px #244e43 bar):**
- Left: `PearIcon` **size 34, strokeWidth 1.5** (`components/icons/PearIcon.tsx`) — dark-green (`HEADER_ICON`) SVG outline pear sized + weighted to match the training-tab `KettlebellIcon` (same viewBox, so identical thickness — matches the solid VF mark). `HeaderIcon` badge dot when unread nutrition notifications exist; taps to open `NotificationOverlay` (area="nutrition"). Unread count checked on every `useFocusEffect`. (`PearIcon` now takes a `strokeWidth` prop, default `1.0` so the home-hero watermark + overlay pears are unchanged.)
- Center: date text (tappable → opens Calendar Picker modal)
- Right: VFIcon 26 → `router.navigate('/(client)')`; session timer in the `overlay` slot when a session is suspended

**NotificationOverlay** (`components/NotificationOverlay.tsx`):
- Reusable slide-down sheet (spring animation, `borderBottomLeftRadius:20, borderBottomRightRadius:20`). Accepts `area: 'nutrition' | 'training'`, `visible`, `onClose` props.
- Header: area icon (PearIcon or KettlebellIcon, ACCENT color) + "Notifications" title + X close button.
- Loads `client_notifications` filtered by `client_id` + `area`, ordered newest first.
- Each row: unread = white bg + 3px ACCENT left border; read = `#f9f9f7` bg, no border. Title 13px/700 + body 12px muted + timestamp muted right.
- "Mark all as read" text button at bottom when any unread exist. Auto-marks-all on overlay close.
- Empty state: area icon (35% opacity) + "No notifications yet" muted text.

**Adding food — one floating action button (FAB):**
- All food is added via a **single FAB** (56×56 ACCENT circle, white `plus`, bottom-right, `bottom: insets.bottom + 24`). Hidden while loading or in selection mode. There are **no per-meal `+` buttons and no per-meal/snack save-as-meal hearts** — the meal cards are display-only. Save-as-meal is done through selection mode (select rows → **Meal**).
- FAB → **add picker** (white centered modal, "Add to your log"): Breakfast · Lunch · Dinner rows + a **Snack** row that expands to the 5 subtypes (Morning · Afternoon · Evening · Pre-Workout · Post-Workout). Picking a leaf opens `FoodSearchModal` for that meal. Below a divider, a final **📅 "Add a day from Favourites"** row navigates to the Favourites → Days insert flow (the sole entry point for inserting a saved day).

**Summary card (gradient, rounded, top of scroll content):**
- `expo-linear-gradient` background: `['#eef8f3', '#daf0e7']`, `start={x:0,y:0}`, `end={x:1,y:1}` — matches WeeklyGaugeCard on training tab. (Original darker gradient: `['#f0f7f4', '#cce8de', '#aed8ca']`, `end={x:0.6,y:1}` — may revert)
- Three layers:
  1. **Corner row:** a single ♥ (save this day as a favourite) top-right in a semi-transparent white circle. The former top-left `+` (insert a saved day) was moved into the FAB picker's "Add a day from Favourites" row.
  2. **CalorieRing arc:** half-circle "rising sun" SVG gauge; EATEN count below left endpoint · LEFT count below right endpoint
  3. **Collapse/expand chevron:** opens the stats section below

**CalorieRing component:**
- True 180° semicircle spanning ~74% of card width. `R = Math.round((sw - 64) / 2.7)` (≈120px on standard iPhone)
- **Two-arc workaround:** a perfect 180° arc is degenerate in `react-native-svg` (invisible). Split into two 90° arcs: `M ${PAD},${R+PAD} A ${R},${R} 0 0,1 ${R+PAD},${PAD} A ${R},${R} 0 0,1 ${D+PAD},${R+PAD}`. `PAD=8` insets the path so rounded stroke caps don't clip at SVG edges.
- Track: `rgba(36,78,67,0.12)` stroke, 12px wide.
- **Three fill gradients** (left→right), selected by `overBy = Math.round(consumed - target)`:
  - `arcGrad` (≤0 over): `#52d4a8 → #1a7a5e` — light mint to slightly darker green
  - `arcGradYellow` (1–99 kcal over): `#52d4a8 → #EF9F27` — green to amber
  - `arcGradRed` (100+ kcal over): `#52d4a8 → #e8a040 (60%) → #e05555` — green → amber → red
- Center text: "GOAL" (10px, muted green) · target kcal (30px/500) · "kcal" (10px, muted green)
- **EATEN / LEFT / OVER row:** `endRow` `marginHorizontal: -PAD*2`; both groups `alignItems:'center'`.
  - Left: eaten kcal + "EATEN" — always normal color.
  - Right: when `overBy >= 1` → overage + "OVER"; else → remaining + "LEFT". Over color: `CORAL (#D85A30)` if ≥100 kcal over, `AMBER (#EF9F27)` if 1–99 kcal over. Applied to number and label only.

**Expanded stats (collapsed by default, toggled by chevron):**
- **Macro bars:** Protein (blue `#378ADD`), Carbs (amber `#EF9F27`), Fat (coral `#D85A30`). Each: label + consumed/target text row + 4px progress bar. Fill bar color never changes.
- **Macro over-budget:** consumed number text only — `#F5C518` (golden yellow) if ≤15% over target, `#EF4444` (red) if >15% over. Bar color unchanged.
- **Limits row:** Fiber · Sugar · Salt — each cell shows `value / max g`; value turns amber at 80% of max, coral when over
- **Warning badges (shown when condition met):**
  - 🥕 "No veg yet today" — shown only after 15:00 when no food_groups `veg` or `fruit` in today's log
  - 💧 "Don't forget to drink!" — shown when `waterGlasses === 0`

**Water tracker (below summary card):**
- Row of glass icons (tap to increment 0 → N where N = `water_target_ml ÷ 250`)
- Saved to `water_logs` table (upsert by client_id + date)

**Meal sections — display cards (adding is FAB-only):**
- 3 main cards (Breakfast, Lunch, Dinner) always shown. Cards contain no add/heart buttons.
- **Empty card:** dimmed (`opacity 0.55`) and **not tappable** — icon + title + "Not logged yet". No chevron, nothing to expand. Empty cards are intentionally not tappable so tap never means "add" on one card and "expand" on another.
- **Card with food:** full opacity; the whole header is tappable (inline chevron on the right after the kcal total) → expand/collapse the food rows.
- **Snacks section** is a **single display card** with the same rules. Empty = dimmed, not tappable, "Not logged yet". With food = tappable header (🍿 Snacks + total kcal + chevron) that expands to show entries grouped per subtype (a subtype header row — emoji + uppercase label + kcal — then that subtype's rows). Subtype choosing moved into the FAB picker; the card has no per-subtype `+`, picker rows, or hearts.
- `collapsedMeals: Set<string>` manages collapse state (meal names + `'snacks'`); empty (default) = all expanded.

**Food log item rows (`FoodLogRow` component):**
- **Left:** food thumbnail image (42×42, borderRadius 8) — loaded from `food_cache` by `source:source_id`; falls back to 🍏 green apple emoji on `#f0f7f4` background (consistent with `FoodSearchModal` and meal ingredient rows). No meal-specific placeholder styling.
- **Center (2-line layout):**
  - Line 1: food name (13px/600, truncated) + kcal count right-aligned (11px/500, muted green `#3a7d6b`)
  - Line 2: amount+unit (11px, muted) followed inline by colored macro tags — **P** (blue `#378ADD`) · **C** (amber `#d4920a`) · **F** (coral `#D85A30`)
- **Right:** selection circle (**18×18**, borderRadius 9) — empty with grey border when unselected; ACCENT filled with white checkmark (size 8) when selected
- **Image loading:** `imageUrlMap` built in `load()` by batch-querying `food_cache` on `source_id IN [...]`; keyed by `source:source_id`

**Food item interactions:**
- **Tap row** (not in selection mode) → opens edit modal (white centered): amount input pre-filled, unit shown alongside, live kcal/protein/carbs/fat recalculated by scale factor (new ÷ old amount). "Remove from log" link below. Confirm updates DB + local state proportionally.
- **Tap circle** → enters selection mode, toggles that item selected

**Selection mode:**
- When any item is selected: nutrition tab bar hidden via `navigation.setOptions({ tabBarStyle: { display: 'none' } })`; white selection panel slides in from bottom, replacing the tab bar
- Selection panel: white card, `borderTopLeftRadius:18, borderTopRightRadius:18`, bottom:0, full width, subtle upward shadow
- Panel layout: top row = "X items selected" + Cancel; bottom row = 4 action buttons: **Grocery** · **Meal** · **Favourite** · **Delete**
  - Grocery: adds all selected items to `grocery_list_items`
  - Meal: shows name-input modal → saves selected items as a `saved_meals` entry
  - Favourite: saves each selected food to `favourite_foods` (fetches per-100g data from `food_cache`; falls back to proportional scaling for manual foods). The `favourite_foods` table is `id, client_id, food_name, brand, source, source_id, nutrients_json (jsonb), food_groups (text[]), created_at` with `UNIQUE(client_id, source, source_id)` and `source` CHECK `off | usda | manual | custom | trainer`. (The `food_groups` column + `custom`/`trainer` source values were added July 2026 — previously the column was missing, so every favourite upsert failed silently and nothing saved.) Saving a food to favourites from the search modal's heart button shows an auto-dismissing "Saved to favourites" toast and adds it to the Favourites tab immediately. Tapping a filled heart to **remove** a food opens a "Remove from favourites?" confirmation modal (red Remove pill + Cancel) so it never happens by accident.
  - Delete: deletes all selected from `food_log_entries`
- Cancel: clears selection, tab bar restored via `navigation.setOptions({ tabBarStyle: originalStyle })`
- While in selection mode: tapping a row body also toggles selection

**Calendar picker modal** (white centered, animationType="fade"):
- Mon-first calendar grid with month navigation
- Future dates disabled
- Colored dot indicators on past dates: green (≥90% calorie goal), amber (40–89%), coral (<40% with any food). Pink heart dot if that date is saved as a favourite.

**Add food (FoodSearchModal):**
- Opens on + in corner buttons or + in any meal section header
- Searches Open Food Facts + USDA FoodData Central in parallel; checks Supabase `food_cache` first
- Barcode scanner tab (opens camera)
- Portion picker: amount input + unit selector (g/ml/serving/piece/cup/tbsp/tsp)
- Confirms → inserts `food_log_entries` row

**Save Day as Favourite:**
- ♥ corner button → white centered modal with name input → inserts `favourite_days` row
- If favourite already exists for that date → warn modal before overwriting
- Favourite days show pink heart dots on the calendar picker

---

**Favourites tab** (`app/(client)/nutrition/favourites.tsx`) ✅

**Landing page (default view):**
- Four full-width gradient cards stacked vertically, **`height:142`**, `borderRadius: 20`, spring scale press animation (`toValue:0.97` on pressIn)
- **Recipes card:** deep forest green gradient `#2d6456 → #1e4038`, `book.closed.fill` icon, description "Trainer picks & your own creations", live count badge
- **Meals card:** rich indigo gradient `#2e4288 → #1d2d6a`, `fork.knife` icon, description "Saved meal combinations", live count badge
- **Days card:** warm plum gradient `#7a3060 → #551a48`, `heart.fill` icon, description "Favourite full-day logs", live count badge
- **Recommendations card:** amber gradient `#c87820 → #e89840`, `pills.fill` icon, description "Supplements & nutrition tips", live count badge
- Each card: icon top-left (in normal document flow, not absolute), title **18px/800** `letterSpacing:-0.3`, description 13px 60% white, footer row with count pill (`rgba(255,255,255,0.18)`, 12px/700) + `arrow.right` 14px 55% white. Two decorative translucent circles as background detail.
- Count badges show `—` while data is loading, actual count once loaded
- `FullWidthCard` component shared by all four cards

**`ViewState` type:** `'landing' | 'recipes' | 'meals' | 'days' | 'recommendations'`

**Deep-link params:**
- `?tab=recipes|meals|days|recommendations` — bypasses landing and opens that category list directly
- `?insertMode=true&tab=days` — used by Food Log to pick a saved day to insert into today

**Header:** back chevron from landing → `router.back()`; back chevron from a category list → returns to landing (`setView('landing')`). **Exception — insert mode** (`insertMode=true`, reached directly from the Food Log FAB's "Add a day from Favourites"): the back chevron goes straight to the Food Log (`router.navigate('/(client)/nutrition')`) in one step, rather than dropping the user on the Favourites landing. Title updates to the category name when in a list view.

**Recipes list:**
- Search bar + `plus.circle.fill` create button
- **Filter pills row** (below search bar): **All** · **Mine** · **Vitek's** — `RecipeFilter` `'all' | 'mine' | 'trainer'`. Mine = `created_by === clientId`; Vitek's = `created_by_role === 'trainer'`. Default: All.
- Recipe cards: 130px height, full-bleed cover photo or `#3a7d6b → #244e43` gradient fallback, name + portions/kcal subtitle, source badge top-right
- Tap → `/(client)/nutrition/recipe/[id]`

**Meals list:**
- **Search bar** (filters by name) + **sort pills**: **Newest** · **Oldest** · **A–Z** · **Z–A** — `mealSort` state, default `'newest'`. "No results" empty state when search finds nothing.
- Cover photo (76×76) or `#2e4288→#1d2d6a` gradient placeholder with fork.knife icon, meal name, item count, kcal · P · C · F macro row. Tap → full meal detail screen.

**Meal detail** (absolutely-positioned full-screen `View`, not a Modal — avoids iOS stacking issues):
- Header: dark green 62px + safe area. Meal name centered — tap to open rename overlay. Back chevron left.
- Cover photo 200px full width, camera badge (bottom-right) to change photo via `ImagePicker` → `meal-covers` bucket, saves immediately.
- Nutrition strip: kcal / Protein / Carbs / Fat in white card row.
- Ingredients: swipe left to remove (Swipeable, red 80px action); tap row to edit amount (inline overlay with live nutrition preview). "+ Add food" button always visible (opens `FoodSearchModal` as external sibling).
- Notes: tappable box opens inline notes overlay (multiline input, saves immediately).
- Share with: 3 pills — No one (default) · My trainer · My clients. Tap saves to DB immediately.
- "Log this meal" button → Log Meal Modal (date picker + meal category pills).
- Delete meal link (red) → `confirmModal` pattern.
- All inner editing (rename, notes, ingredient amount) uses inline absolutely-positioned overlays — no nested Modals.

**Days list:**
- White item cards with heart.fill ACCENT icon, name, date reference, kcal total, macro summary
- Expand/collapse → shows food entries grouped by meal (Breakfast/Lunch/Dinner/Snack)
- "Use this day" → white centered modal: date picker + "Log all items" confirm
- In `insertMode`: tap card → insert modal (logs to today immediately)
- Delete: `confirmModal` pattern (danger:true)

**Recommendations list:**
- Fetches `nutrition_tips` where `category IN ['supplement','tip']` AND `is_published = true`, ordered newest first
- **Underline tab switcher**: **Supplements** · **Tips** — `recommTab` state `'supplement' | 'tip'`, default `'supplement'`. 20px text, gap 32, paddingTop 20; active = 2px ACCENT underline + TEXT color; inactive = `#bbb`.
- Supplements: amber gradient `#c87820 → #e89840` thumbnail with `pills.fill` icon
- Tips: dark green gradient `#3a7d6b → #244e43` thumbnail with `lightbulb.fill` icon
- Strip cards: thumbnail (52×52) + title 14px/600 + body preview 11px muted + chevron right
- Tap → white centered modal: gradient top 100px (amber for supplement, dark green for tip) + 4px accent bar (AMBER or ACCENT) + title + link URL (ACCENT) + body + "Close" link
- Client read-only — no create button

---

**Tips tab** (`app/(client)/nutrition/tips.tsx`) — **removed from nav**

Tab is hidden (`href: null`). File contains only `<Redirect href="/(client)/nutrition" />`. Content previously shown here has moved:
- Tip of the day → nutrition `NotificationOverlay` (type: `tip_of_the_day`)
- Recipes → Favourites tab Recipes list
- Recommendations → Favourites tab Recommendations list

---

**Grocery tab** (`app/(client)/nutrition/grocery-list.tsx`) ✅

DB table `grocery_list_items`: `id (uuid PK)`, `client_id (uuid → auth.users)`, `name (text)`, `quantity (text, nullable)`, `is_checked (boolean, default false)`, `checked_at (timestamptz, nullable)`, `created_at`. RLS: client ALL where `client_id = auth.uid()`.

**Item row (`GroceryRow` component):**
- Name (15px/500) + optional quantity (12px, muted) on the left
- **Circle on the right** (26×26): empty grey border = to buy; ACCENT filled + checkmark = bought. Tap circle to toggle.
- Swipe **left** → red Delete action (80px reveal, top/bottom-right radius). Always shows a white centered confirmation modal before deleting: "Remove item?" + item name + red Remove pill + Cancel link.
- Swipe **right** → green Bought/Uncheck action (80px reveal, top/bottom-left radius). For unchecked items: marks bought (`is_checked=true, checked_at=now()`). For checked items: unchecks (`is_checked=false, checked_at=null`).

**List layout:**
- **"TO BUY (N)"** section label → all unchecked items in order of `created_at`
- **"BOUGHT — TODAY / YESTERDAY / D MONTH YYYY"** section labels → checked items grouped by `checked_at` date. Today and Yesterday labels in English; older dates formatted as `D Month YYYY`. Groups ordered Today → Yesterday → older.
- Items never disappear when checked — they move to the Bought section and stay there until explicitly deleted (via swipe-left + confirmation)
- Delete confirmation always required — no silent deletes anywhere in the grocery list

**Add item:** green + button → white centered modal with name input + optional quantity input + "Add to list" confirm pill.

**Counter in toolbar:** "N to buy · N bought" — always visible.

---

**Weekly tab** (`app/(client)/nutrition/weekly.tsx`) ✅ — 3rd bottom nav tab, `chart.bar` icon

- **Header:** dark green 62px — back arrow left · "Weekly Report" centered · VFIcon right → home.
- **Week selector bar** (below header, separate from header on BG background): `< This week · 25–31 May 2026 >` with `paddingTop:16, paddingBottom:8`. Dark green text, right chevron disabled on current week. Changing week resets the selected day and reloads all data.
- **Critical date fix:** `toDateStr()` uses local date components (`getFullYear/getMonth/getDate`) — never `toISOString()`, which returns UTC and shows the wrong day in UTC+ timezones like Berlin.
- **Content sections (in order):**
  1. **Trainer note** — shown when `weekly_nutrition_notes` exists for this week.
  2. **Diet badge** — colored pill (from `DIET_COLORS` map) if diet type is set on targets.
  3. **Stats card** (white, 3-column): Days logged · Avg kcal/day · Protein on target. Color coding on values: days ≥7=HEADER / 5–6=AMBER / 0–4=CORAL; avg kcal ≤100 off target=HEADER / 101–200=AMBER / >200=CORAL / null=MUTED; protein = ACCENT when 7/7 else COL_PROT (`#378ADD`).
  4. **Weekly Average vs Target** (dark green `HEADER` bg card) — only when ≥1 day logged. Light-on-dark color scheme. Bars stay macro color even over target; number turns `#ff9090` when over. Caption "Average daily intake (week total ÷ 7)".
  5. **7-day strip** with two stacked status lines per day: calorie line (green/amber/coral/transparent) + protein line (blue when target met, transparent when not). Tap day → inline detail below; tap again → collapse.
  6. **Inline day detail**: TARGETS card (food log gradient) + meal section cards with food items styled to match the food log (`FoodLogRow` style — 🍏 thumb + nameRow + metaRow with P/C/F macros).
  7. **What you ate** — food group rows per diet type. Vegetarian diet includes a Meat row (shows 0/7 by design). "Dairy & Eggs" label with egg name-pattern detection for all diets with dairy.
  8. **Coaching insights** — from `getWeeklyInsights()`. Severity-coded cards.
- See `CLAUDE-nutrition.md` → Client Weekly Report section for full implementation details.

---

**Recipe screens (hidden tabs):**

`app/(client)/nutrition/recipes.tsx` — lists recipes available to the client (own + trainer-created via RLS). Search bar, cards same height/style as trainer Library recipes tab. Tap → detail sheet.

`app/(client)/nutrition/recipe/create.tsx` — client recipe create screen. Sets `created_by_role: 'client'`, `client_id = profile.id`. Cover photo stored in `recipe-covers` bucket via `arrayBuffer()`. Ingredients, instructions, portions fields.

`app/(client)/nutrition/recipe/[id].tsx` — recipe detail/edit screen for client-owned recipes.

All recipe tab/route screens are registered as `href: null` in `_layout.tsx` so they don't appear in the bottom nav.

---

**Trainer Nutrition tab** (`app/(trainer)/client/[id]/nutrition-tab.tsx`) ✅

Inside the client profile (4-tab layout: Training / Nutrition / Progress / Info). Two sub-tabs: **Planning | Overview**. See `CLAUDE-nutrition.md` for full implementation details.

---

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
