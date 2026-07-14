# Nutrition Screens — Detailed Rules

Referenced from CLAUDE.md §8. Read alongside CLAUDE.md at session start.

---

## Trainer Nutrition tab — Client profile (`app/(trainer)/client/[id]/nutrition-tab.tsx`)

### Planning sub-tab — layout order

1. **Macro + Calories card** (standalone, no NUTRITION SETUP wrapper)
   - Calories: large `38px/800` number, tappable → number input modal (`openField('calories', 'Calories')`). Dark-green draggable bar below (0–6000 kcal, `calPR` PanResponder, `animCal` Animated.Value).
   - Three macro rows (Protein / Carbs / Fat). Each row: stats row (name · colored% · grams · g/kg if weight available) + full-width draggable bar with thumb (`protPR/carbsPR/fatPR` PanResponders). Dragging one bar auto-balances the other two proportionally via `balanceMacros()`. Tapping stats row → `openMacroModal()` to type % directly.
   - Macros always kept consistent via `balanceMacros()` — no "targets look consistent" warning needed.
   - When calories changes, grams recalculate from existing percentages automatically in `confirmField`.
   - Amber BMR warning below calories bar if calorie target < profileBmr.

2. **Calculate targets button** — `s.calcBtn` style (outlined pill, ACCENT border/text). Two-step modal:
   - Step 1: Weight (editable, initialises from most recent measurement), Height, Age (read-only from DOB), Sex, Activity level, Goal — all tappable rows → sub-modals. Weight/Height are for calculation only; Sex/Activity/Goal are saved to `users` table on confirm.
   - Step 2: BMR · TDEE · Goal adj · Calories · Protein/Carbs/Fat breakdown. "Use these values" applies via `patchTargets`.

3. **Daily limits card** — Water target · Fiber (min) · Sugar (max) · Salt (max g). All via `openField()`.

4. **Diet & Notes card** — Diet type (pill picker via `dietModal`) + `nutrition_notes` free-text textarea (allergies, intolerances, dislikes). Saved with dedicated "Save notes" button → `patchTargets({ nutrition_notes })`.

### Key state / refs

- `protPct / carbsPct / fatPct` — local percentage state, derived from targets in useEffect (guarded by `skipMacroSyncRef`)
- `animProt / animCarbs / animFat / animCal` — `Animated.Value` refs for bar widths; `setValue()` for instant drag, `Animated.timing` for external changes
- `protPctRef / carbsPctRef / fatPctRef / targetsRef / patchFnRef` — stable refs used inside PanResponder callbacks (avoid stale closures)
- `isDragging` ref — skips `Animated.timing` useEffect during active drag
- `skipMacroSyncRef` — prevents the targets-change useEffect from re-deriving percentages after our own save
- `draftCalRef / draftCalView` — live calories value during calorie bar drag (not persisted until `onPanResponderRelease`)
- `barWidthRef / calBarWidthRef` — set by `onLayout` on each bar track; used in PanResponder to convert `dx` → percentage

### `patchTargets`
Uses `.upsert({ onConflict: 'client_id' })` — idempotent, safe for first-time inserts and updates. `patchFnRef.current = patchTargets` is reassigned each render so PanResponder release callbacks always call the latest closure.

### `balanceMacros(edited, newPct, p, c, f)`
Clamps `newPct` to 5–90%. Distributes remaining 100-newPct to the other two macros in proportion to their current values. If other two sum to 0, splits equally.

### `macroGrams(calories, protPct, carbsPct, fatPct)`
`protein_g = round(cal × prot/100 / 4)`, `carbs_g = round(cal × carbs/100 / 4)`, `fat_g = round(cal × fat/100 / 9)`.

### Calorie bar range: 500–6000 kcal
`dx / barWidth * 6000` maps pixels to kcal delta. Reference labels shown at 0/3000/6000.

---

### Overview sub-tab — layout and behaviour

No date navigation, no trainer note textarea, no "See full week" modal link. Shows the current week inline. Three cards rendered directly inside the parent `ScrollView`:

#### 1. Stats card (`wkStatsCard`)
White card, `flexDirection:'row'`, three equal columns (`wkStatCell`). Center column has left+right `borderColor:BORDER` dividers.
- Days logged: HEADER dark green number
- Avg kcal/day: HEADER dark green number (based on logged days only — total ÷ loggedDays, not ÷ 7)
- Protein on target: COL_PROT number; turns ACCENT when all 7 days hit target

#### 2. Weekly Average vs Target card
Section label: `"WEEKLY AVERAGE VS TARGET"`. Four `analysisRow` blocks, rendered only when `loggedDays > 0`:

| Nutrient | Color constant | Unit |
|---|---|---|
| Calories | `HEADER` (`#244e43`) | kcal |
| Protein | `COL_PROT` (`#378ADD`) | g |
| Carbs | `COL_CARB` (`#EF9F27`) | g |
| Fat | `COL_FAT` (`#D85A30`) | g |

Value = `Math.round(sumField(weekLogs, field) / 7)` — **week total ÷ 7**, not average of logged days. This reflects full-week performance including days with zero intake.

`analysisRow` style: `{ marginBottom:14, paddingHorizontal:16 }`. `analysisLabels` row: `{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }`. Bar: `analysisTrack` height 6px BG-colored track + `analysisFill` filled to `Math.min(1, val/target)*100%`. Bar color = nutrient color normally; coral (`#e05555`) if over target. Only render the bar when target > 0.

Caption below bars: `"Average daily intake (week total ÷ 7)"` — `analysisNote` style, centered, `paddingBottom:4`.

#### 3. 7-day strip card (`dayStrip`)
Section label: `"TAP A DAY FOR DETAIL"`. `dayStrip` style: `{ flexDirection:'row', gap:4, marginHorizontal:10, marginTop:10 }`.

Each day button (`dayBtn`): `{ flex:1, alignItems:'center', paddingVertical:12, borderRadius:10, backgroundColor:BG }`. When selected: add `backgroundColor: HEADER+'1A', borderWidth:1.5, borderColor:HEADER`.

Contents top-to-bottom:
- Day abbreviation (2 chars, `dayBtnName` 11px/600 MUTED; ACCENT when today; HEADER when selected)
- Date number (`dayBtnDate` 16px/700; ACCENT+700 when today; HEADER+700 when selected)
- Kcal count if logged (`dayBtnKcal` 10px MUTED; HEADER when selected), else `<View style={{height:14}}/>` placeholder
- Status line (`dayStatusLine`): `{ height:4, width:'65%', borderRadius:2, marginTop:6 }`, `backgroundColor`:
  - `ACCENT` when kcal ≥ 90% of `targets.calories`
  - `AMBER` (`#f5a623`) when 40–89%
  - `CORAL` (`#e05555`) when 1–39% (any food but under 40%)
  - `'transparent'` when no food logged

**Tap behaviour:** tap selects the day (sets `selectedWeekDay`); tap the same day again deselects (sets `null`).

Legend (`dayLegend`): `{ flexDirection:'row', justifyContent:'center', gap:16, marginTop:10, paddingTop:9, paddingBottom:11, borderTopWidth:1, borderTopColor:BORDER }`. Three items: ● On track · ● Partial · ● Struggling.

#### Inline day detail (below strip, when `selectedWeekDay` is set)

Day header row (`dayDetailHeader`): `{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:4, paddingTop:12, paddingBottom:6 }`. Left: day name in `dayDetailTitle` (15px/700 HEADER). Right: `xmark.circle.fill` SF Symbol (size 20, MUTED) to collapse (`setSelectedWeekDay(null)`).

**If no logs for the day:** white card with centered italic `"No food logged for this day"` (`emptyText` style).

**If logs exist, two sections in order:**

1. **Targets card** — same `analysisRow` pattern as the Weekly Average card but shows the day's actual consumed values vs targets:
   - Calories (HEADER), Protein (COL_PROT), Carbs (COL_CARB), Fat (COL_FAT)
   - Section label: `"TARGETS"`. Only rendered when at least one target (`targets.calories`, `targets.protein_g`, `targets.carbs_g`, or `targets.fat_g`) is non-null.
   - Value format: `{val}` then ` / {target} {unit}` in `analysisMuted`. Calories shows no `" g"` suffix; macros show `" g"`.
   - Bar turns coral if actual > target.

2. **Meal sections** — same pattern as the day view in do-mode / client food log:
   - `ALL_MEALS` iterated: `['breakfast','snack_morning','lunch','snack_afternoon','dinner','snack_evening']`
   - `meal_category === 'snack_afternoon'` also captures legacy `'snack'` entries
   - Each section: `mealCard` with header row (emoji in colored circle + meal label + kcal total) then `logRow` entries (food name + portion + kcal bold + "Xg P")
   - Sections with no entries for the selected day are skipped (`if(!entries.length) return null`)

**No dark green macro summary card** — this was removed as it repeated the Targets card data.

#### Key computed values (Overview sub-tab uses `weekLogs` directly)
```ts
// Loaded in load() — Mon to today of current week
weekLogs: FoodLogEntry[]

// Derived
weekDates = [...new Set(weekLogs.map(e => e.date))]
loggedDays = weekDates.length
avgCal     = loggedDays > 0 ? round(sum(perDayKcal) / loggedDays) : null
proHitDays = weekDates.filter(d => dayPro(d) >= targets.protein_g).length

// Weekly avg (total ÷ 7)
wkAvgCal7, wkAvgPro7, wkAvgCarbs7, wkAvgFat7

// Day status
getDayStatus(ds) → 'green'|'amber'|'coral'|'none'

// Day detail
selDayLogs   = weekLogs.filter(e => e.date === selectedWeekDay)
selDayCal, selDayPro, selDayCarbs, selDayFat, selDayCalPct
mealLogsForDay(meal) — filters selDayLogs by meal_category
```

#### Full-screen week modal (dormant)
A full-screen modal (`weekModal` state) remains in the file for potential future use. It has a dark green header with back chevron, a `wkNavRow` below the header for week date navigation (prev/next week), summary stats, global analysis, and a 7-day strip with day detail view. It is **not opened from the Overview tab** — no "See full week" button exists. The modal can be activated in future if week navigation or a richer weekly report is needed.

---

## Library Nutrition tab (`app/(trainer)/(tabs)/library.tsx` — `NutritionTipsTab` + `RecipesTab` + `FoodsTab`)

- **Tab structure:** 3 top-level tabs: Exercises | Workouts | Nutrition. Workouts has underline sub-tabs (Workouts / Templates). Nutrition has underline sub-tabs (Recipes / Recomm. / Tips / Foods).
- **Sub-tab `addTick` guard:** the `nutAddTick` prop passed to `NutritionTipsTab` is shared across both Recomm. and Tips tab instances. On mount both instances have the current `addTick` value. Use `useRef(addTick)` at component mount and only open the create modal when `addTick > addTickAtMount.current` — this prevents the modal from firing on mount when the previous tab's + press left `addTick > 0`.
- **Foods sub-tab** uses a separate `nutFoodsAddTick` counter (not shared with tips). `FoodsTab` uses the same `addTickAtMount` guard pattern to open `FoodCreateModal` when the counter increments.
  ```ts
  const addTickAtMount = useRef(addTick);
  useEffect(() => {
    if (addTick > addTickAtMount.current) {
      addTickAtMount.current = addTick;
      openCreate();
    }
  }, [addTick]);
  ```
- **Card spacing:** `listContent` style uses `paddingTop: 12` (nutStyles) or `paddingTop: 2` (recStyles) to give breathing room between the tab switcher/search bar and the first card. `recStyles.searchBarWrap` uses `marginBottom: 12`.
- **Recipe card + button navigation:** always `router.push('/(trainer)/recipe-create' as any)`. Never navigate to `/(client)/nutrition/recipe/create` — the root layout role-guard will redirect trainers back to the clients screen.
- **Recommendation card tap:** opens a slide-up **`BottomSheet` detail panel** (July 2026 — was a centered detail sheet; not the edit modal). It has: cover photo/gradient, title, link URL (ACCENT color), body, "Edit Recommendation" button → `close(() => openEdit(tip))`, "Delete" button → `close(() => setConfirmDelete(tip))` (capture `tip`/`recipe` in a local before `close()` since it nulls the source state). State: `recDetail: NutritionTip | null`. The recipe detail (`detail`) and the client recommendation detail (`app/(client)/nutrition/recommendations.tsx`) are likewise slide-up `BottomSheet`s now. Edit/create forms and delete confirms stay centered.
- **Recipe + recommendation cards:** both `height: 120` in the `recStyles.card` style. Keep in sync — they share the same visual height.
- **Recommendation search:** `recSearch` state filtered as `filteredRecomm` via `useMemo`; search bar only renders when `category === 'supplement'`.
- **RecipesTab load pattern:** `useFocusEffect` with `useCallback` around the load function, dependency on `trainerId`. No `.or()` filter — rely purely on RLS.

---

## Client Nutrition Food Log (`app/(client)/nutrition/`)

**Navigation:**
- Bottom nav: **Food Log · Favourites · Weekly · Grocery** (4 visible tabs). Tips tab is hidden (`href: null`) — contains only `<Redirect href="/(client)/nutrition" />`.
- `_layout.tsx` registers hidden tabs: `tips`, `recipes`, `recommendations`, `recipe/create`, `recipe/[id]`.

**Food Log screen header** (defined inline in `index.tsx`, not in `_layout.tsx`):
- 62px, `#244e43` bg. Left: `PearIcon` (30px, `components/icons/PearIcon.tsx`) — SVG outline pear, white; 8px ACCENT badge dot when unread nutrition notifications; taps to open `NotificationOverlay` (area="nutrition"). Center: date text (tappable → calendar picker modal). Right: VFIcon 28px → home.
- Unread count: checked via Supabase (`client_notifications` where `client_id = profile.id AND area = 'nutrition' AND is_read = false`) on every `useFocusEffect`. State: `hasUnreadNotifs`.

**NotificationOverlay** (`components/NotificationOverlay.tsx`):
- Reusable component. Props: `area: 'nutrition' | 'training'`, `visible: boolean`, `onClose: () => void`.
- White card slides down from top of screen (spring `Animated.Value`, `borderBottomLeftRadius:20, borderBottomRightRadius:20`, shadow).
- Header: area icon (`PearIcon` or `KettlebellIcon`, ACCENT) + "Notifications" title + X close button (28px circle, `#f0f0ec` bg).
- Loads `client_notifications` filtered by `client_id + area`, ordered newest first. Marks all read on close.
- Row styles: unread = white bg + 3px ACCENT left border; read = `#f9f9f7` bg, no border. Title 13px/700 + body 12px muted + `timeAgo()` timestamp right 11px.
- "Mark all as read" text link at bottom when any unread exist.
- Empty state: area icon (opacity 0.35) + "No notifications yet".

**Adding food — single FAB only (no per-meal or summary-card `+`):**
- All food is added via **one floating action button** (`styles.fab`): 56×56 ACCENT circle, white `plus` SF Symbol, `position:'absolute', right:20, bottom: insets.bottom + 2` (lowered again July 2026 — closer to the tab bar). Hidden while `loading` or in selection mode (`selectedIds.size > 0`), but **stays visible while the add-picker is open** (it is the ✕ that closes it). Scroll `paddingBottom` = `insets.bottom + 100` (non-selection) so the Water row clears the FAB.
- **FAB add-picker = anchored popover (July 2026, built).** This is the ONE deliberate exception to the app-wide "menus slide up from the bottom" convention — it opens as a **popover that scales out of the `+` FAB's bottom-right corner** (Virtuagym-style), NOT a `BottomSheet`. Implementation (all inline in `index.tsx`, no `Modal`):
  - `popAnim` (`Animated.Value` ref, 0→1) drives it; `popH` (state, measured via the card's `onLayout`) is the card height for the pivot math.
  - **`openPicker()`** resets `pickerSnackOpen`/`pickerWaterOpen`, sets `popAnim=0`, mounts (`setMealPickerVisible(true)`), then `Animated.spring(popAnim→1)`. **`closePicker()`** timings `popAnim→0` (150ms) then unmounts. A `useEffect` resets `popAnim` to 0 whenever `mealPickerVisible` is false (covers the instant closes from picking a meal, so the FAB doesn't stay as ✕).
  - **Corner-pivot scale** (grows from the FAB): `transform: [{translateX: POP_W/2},{translateY: popH/2},{scale: popAnim→[0.35,1]},{translateX: -POP_W/2},{translateY: -popH/2}]` — this sets the scale origin to the card's **bottom-right corner** (nearest the FAB). `styles.popCard` is `position:'absolute', width:POP_W(300)`, **`right:46`** (vs the FAB's `right:20`) so the FAB **straddles the card's bottom-right corner** — the corner tucks behind the button and the ✕ pokes out bottom-right, so the card reads as rising out of the +. `bottom: insets.bottom + 42` gives a ~16px vertical overlap with the FAB top. Rows live in a `ScrollView maxHeight: SCREEN_H*0.5`; the water drops use `justifyContent:'space-between'` for even spacing.
  - **FAB morphs + → ✕:** the `plus` icon is wrapped in an `Animated.View` rotating `popAnim→[0deg,45deg]` (a 45°-rotated plus reads as ✕). FAB `onPress` = `mealPickerVisible ? closePicker() : openPicker()`. FAB `zIndex:42` sits above the `popBackdrop` (`rgba(0,0,0,0.18)`, `zIndex:40`, fades with `popAnim`, tap → `closePicker`) and `popCard` (`zIndex:41`).
  - **Rendered in a `Modal` so the dim covers the nav row too, without moving anything.** The nutrition screen sits *above* the tab bar (non-overlay), so hiding the tab bar expands the screen and **drops the FAB** — that looked wrong. Instead the popover (backdrop + card + ✕) lives in a transparent full-screen `Modal` (`animationType="none"`, `statusBarTranslucent`), whose backdrop dims the **whole** screen including the still-visible tab bar. Because the Modal frame is the physical screen (bottom = physical bottom, not tab-bar-top), the card + ✕ are offset by **`tabBarH` (`useBottomTabBarHeight()`)**: `bottom: tabBarH + insets.bottom + 42` (card) / `tabBarH + insets.bottom + 2` (✕) — landing them at the exact same spot as the resting `+` (`insets.bottom + 2` in screen coords), so nothing jumps. The resting `+` (screen-level, `styles.fab`) is rendered only when `!mealPickerVisible`; the Modal's ✕ takes over while open. Do NOT hide the tab bar for this picker.
  - **Inline expand kept** (Vitek's choice): Snack → 5 subtypes and Water → glasses still expand *inside* the popover (it grows taller; `scale` is already 1 so no jump). The Cancel link was dropped — the ✕ FAB / backdrop tap close it.
- The picker's content (`mealPickerVisible`), titled "Add to your log": Breakfast · Lunch · Dinner rows, then a **Snack** row that expands (`pickerSnackOpen`) to reveal the 5 snack subtypes (Morning · Afternoon · Evening · Pre-Workout · Post-Workout) as **indented plain list rows with hairline separators** (`pickerSubRow` = `paddingLeft:24` + `borderTopWidth: hairline` — no beige fill; the old `backgroundColor: BG` cards were dropped July 2026). Picking a leaf sets `addingToMeal` → opens `FoodSearchModal`. `pickerSnackOpen` resets to false on each FAB press. Below a `pickerDivider`: a **💧 Water** row (shows the current total, e.g. `750ml`) that **expands** (`pickerWaterOpen`) to a row of tappable drop icons (`pickerWaterGlasses`) — tapping drop `i` calls `saveWater(i < waterGlasses ? i : i+1)` (250 ml/glass) — this is the **sole way to add water** (the old bottom water card is gone). Then another `pickerDivider` + the **📅 "Add a day from Favourites"** row → `handleInsertDay()` (`favourites?tab=days&insertMode=true`) — the sole entry point for inserting a saved day. Both `pickerSnackOpen` and `pickerWaterOpen` reset to false on each FAB press.
- **No per-meal `+`, no per-meal/snack save-as-meal hearts** — all removed. Save-as-meal is done through selection mode (select rows → **Meal** button). The `SaveMealTarget` type, `saveMealModal`/`saveMealName` state, `saveMealCombo`, and the Save-meal modal were deleted.

**Food Log gauge section (flat — no card; July 2026 redesign):**
The old green-gradient **summary card**, the old **← date → switcher row**, the **expand/collapse chevron + expandable `MacroBar`/`LimitValue` stats**, the **🥕 veg / 💧 water warning badges**, and the **bottom WATER glasses card** were all **removed**. Screen background is `#faf9f7` (`SCREEN_BG`, matches the Training tab — the brief `#edede9` was reverted). The gauge sits **flat** on the tab background (no card container). Order top→bottom inside `styles.gaugeSection`: arc gauge → macro pips → micro-pips toggle → (micro pips when expanded) → divider → week strip; the meal sections follow.
- `MacroBar` / `LimitValue` / `statsToggle` components + `flagsRow`/`vegBadge`/`waterBadge`/`summaryCard`/`cardTopRow`/`cornerBtn` styles still exist in `index.tsx` but are **unused** (dead — left in place, harmless).

**`CalorieRing` component (same arc logic, restyled to match the Training tab gauge):**
- `R = Math.round((sw - 80) / 2.2)`, `PAD=8`, two-90°-arc path (avoids the degenerate 180° case). SVG size `(D+PAD*2) × (R+PAD*2)`, `D=R*2`.
- Track: `rgba(36,172,136,0.15)`, `strokeWidth:11`, `strokeLinecap:"round"`.
- Fill: **solid `#24ac88`** normally; `url(#arcGradYellow)` (`#52d4a8 → #EF9F27`) at 1–99 kcal over; `url(#arcGradRed)` (`#52d4a8 → #e8a040 → #e05555`) at 100+ over. `overBy = Math.round(consumed - target)`.
- Center (`top: Math.round(R*0.42 + PAD)`): "GOAL" (10px `#3a7d6b`) · target kcal (30px/500) · "kcal". EATEN / LEFT (/ OVER) row below the arc endpoints — OVER amber `#EF9F27` (1–99) / coral `#D85A30` (100+).
- **No heart on the gauge** — the save-day ♥ moved to the week-strip header (see below).

**`LiquidPip` component** (module-level in `index.tsx`): a liquid-fill circle used for every macro/micro pip. Props `icon, consumed, goal, bg, border, fillColors:[string,string], size?:'macro'|'micro', decimals?=1, unit?='g', iconSize?, onPress`. `pct = goal ? min(consumed/goal,1) : 0`. `dim = micro?36:52`, `borderRadius:dim/2, overflow:'hidden', borderWidth:micro?1.5:2`. A `LinearGradient` fill (`start{x:0,y:1}`→`end{x:0,y:0}`, so `fillColors[0]` renders at the **bottom**) at `height:${pct*100}%`. Centered emoji (`fontSize: iconSize ?? (micro?14:20), zIndex:2`). Below: `{consumed.toFixed(decimals)}{unit}` (10px/600 macro, 9px/600 micro) + goal `/ {goal}{unit}` (9px / 8px, `#999`).

**Macro pips row** (`macroPipsRow`, `justifyContent:'space-around', marginTop:12`) — **always visible**, three 52px pips:
- Protein — 💪 · **purple** `['#7c5cd6','#9d84e4']`, bg `#f0ecfb`, border `#ddd2f5`, goal `protein_g`.
- Carbs — 🌾 · **orange** `['#f0850f','#f7ab52']`, bg `#fdf1e4`, border `#f8dcbb`, goal `carbs_g`.
- Fat — 🧈 (`iconSize:26`, deliberately bigger) · **gold** `['#f0d000','#f5e040']`, bg `#fefce8`, border `#faf0b0`, goal `fat_g`.

**Micro pips — collapsible, default collapsed** (`microExpanded` state, default `false`): a centered toggle (`microToggle`) reads **"Fiber · Sugar · Salt · Water ⌄"** when collapsed / **"Hide ⌃"** when expanded (`microToggleText` 11px/600 `#3a7d6b`). When expanded, `microPipsRow` with four 36px pips:
- Fiber — 🥦 green `['#24ac88','#44cc9a']`, bg `#eaf5ea`, border `#c8e8c8`, goal `fiber_min_g`.
- Sugar — 🍬 pink `['#e91e8c','#f048a8']`, bg `#fceef5`, border `#f8d8eb`, goal `sugar_max_g`.
- Salt — 🧂 blue-grey `['#6b8cba','#8aaad0']`, bg `#eef2f8`, border `#d8e2f0`, `decimals:2`, goal `salt_max_g`.
- Water — 💧 blue `['#5a9fd8','#85c0ec']`, bg `#eaf2fb`, border `#cfe1f7`, shows **litres** (`consumed=waterMl/1000, goal=targetMl/1000, decimals:1, unit:'L'` → e.g. `0.8L / 2L`).

**Pip detail modal (`pipModal` state):** tapping **any** pip opens a slide-up **`BottomSheet`** (July 2026 — was centered; it's a read-only info panel so it follows the slide-up convention) with the nutrient name + "Current intake" and "Goal" rows (formatted via `pipModal.decimals`/`unit`). The last row (Goal) has `borderBottomWidth:0` so there's no stray divider above Done; Done is the **full-width `styles.confirmBtn` pill** (same as Do Mode's sheet Done — a small auto-width pill looked wrong in a sheet). **All pips are read-only info displays — none of them add data.** Water's modal shows exact ml.

**Water — display pip + add via FAB (no bottom card):** water is (1) the 4th micro pip (display only, litres, tap → info modal); (2) **added** through the FAB "+" picker's **💧 Water** row (see the FAB section). `totalWaterGlasses = round((water_target_ml ?? 2000)/250)`, each glass = 250 ml; `saveWater(glasses)` upserts `water_logs` on `client_id,date`.

**Week strip (mirrors the Training tab `WeeklyGaugeCard` days row):** below a `0.5px #ddddd9` divider (`weekDivider`, `marginTop:14`). **No date-range label.** A right-aligned icon row (`weekCalBtn`, `alignSelf:'flex-end', gap:8, paddingBottom:6, paddingHorizontal:4` — matches the Training tab `calBtn` spacing exactly, so the icons sit the same distance above the day strip): a "today" jump button (18×18 **solid light-green** `ACCENT #24ac88` circle + white date number) shown when `showTodayBtn = !isCurrentWeek || !isToday(selectedDate)` → `goToToday()` (snaps to current week + selects today); a `calendar` SF Symbol (18px `HEADER` — **dark green, the resting icon color**) → month picker; a `heart` SF Symbol (18px) → **saves the current day as a `favourite_day`** (`handleSaveDayPress`). The heart is `HEADER` dark green + outline `heart` when the day is **not** saved, and **`heart.fill` in light-green `ACCENT`** when `favDates.has(toDateStr(selectedDate))` (i.e. the day is already saved) — the accent brightening signals the "on"/saved state; the resting empty heart + calendar stay dark green so the toolbar keeps its weight. Days row (`weekDaysRow`): 7 `flex:1` columns Mo–Su (`DAY_HEADERS`), `gap:3`. Each day column wraps the weekday label **and** the date number **together in one rounded pill** (`weekDayPill` — `alignItems:'center', gap:1, paddingTop:5, paddingBottom:6, paddingHorizontal:10, borderRadius:16`), matching the Training tab `dayPill` (the old separate `weekDayCircle` 34×34 badge was dropped): selected → `weekDayPillSelected` solid `#24ac88` pill, white label + number; today-not-selected → green `#24ac88` label + number (no background pill); future → `#ccc` number, **non-tappable**; a 5px `#24ac88` dot below the pill when that day has food logged (`calData`). **Swipe-only** week navigation (`weekPan` PanResponder on the strip — no ‹/› arrows). The PanResponder is tuned to **match the Training tab** for a fluid swipe: `onMoveShouldSetPanResponder` triggers at `|dx| > 8 && |dx| > |dy|*2`, `onPanResponderTerminationRequest: () => false` (stops the parent ScrollView from stealing the gesture mid-swipe — the key fix), release threshold `±30`. State: `weekStart` (Monday of shown week, via `mondayOf`). Tapping a day sets `selectedDate` (drives the whole screen — the focus effect reloads because `load` depends on `selectedDate`); the calendar `onSelect` also snaps `weekStart = mondayOf(d)`. `loadCalendarData()` is now called on `useFocusEffect` too, so the dots + calendar indicators stay fresh. The `gaugeSection` has `marginBottom:12` so the first meal card (Breakfast) sits clear of the week strip (≈24px total with the `scrollContent` `gap:12`).

**Meal sections — display cards (adding is FAB-only):**
- `MAIN_MEALS = ['breakfast', 'lunch', 'dinner']` always shown as separate cards. Cards no longer contain any add/heart buttons — they only display and expand.
- **Empty card** (`entries.length === 0`): dimmed & **not tappable** — `[styles.mealCard, styles.mealCardEmpty]` (`mealCardEmpty: { opacity: 0.55 }`). Header shows icon + title, then "Not logged yet" below. No chevron, no expand (nothing to show). Adding to it happens only via the FAB. This is deliberate: an empty card must not be tappable — one tap = add then the next tap = expand would be confusing.
- **Card with food:** full opacity. The whole **header is a `TouchableOpacity`** (`onPress = toggleCollapse`) with an **inline chevron on the right** (`chevron.up`/`chevron.down`, size 14, MUTED) after the kcal total. Tap header = expand/collapse the food rows. `isCollapsed = collapsedMeals.has(meal) && !isEmpty`.
- **Meal section icon:** `mealIcon` style — `width:52, height:52, borderRadius:15`. `mealEmoji` fontSize 30.
- **Snacks section** — a **single display card** (same rules as the meals). Empty = dimmed, not tappable, "Not logged yet". With entries = tappable header (🍿 Snacks + total kcal + inline chevron) that expands to show, **grouped per subtype**, a `snackGroupHeader` row (emoji + uppercase subtype label + kcal) followed by that subtype's `FoodLogRow`s; legacy plain `'snack'` entries follow in their own group. Collapse key is `'snacks'` in `collapsedMeals`. Subtype **choosing moved into the FAB picker** — the card no longer has per-subtype picker rows, `+`, or hearts, and `snacksExpanded` state was removed.
- DB `CHECK` constraint on `meal_category` allows: `breakfast | lunch | dinner | snack | snack_morning | snack_afternoon | snack_evening | snack_pre_workout | snack_post_workout`.
- `snackLogs()` = `logs.filter(e => e.meal_category === 'snack' || e.meal_category.startsWith('snack_'))`.
- `collapsedMeals: Set<string>` tracks collapsed card keys (meal names + `'snacks'`). **Default = all collapsed** — initialised to `new Set(['breakfast','lunch','dinner','snacks'])` (July 2026; meals used to default expanded). Empty meals ignore it (they show "Not logged yet", no toggle).

**Food log item rows (`FoodLogRow` component in `index.tsx`):**
- Layout: `[thumb 42×42] [textBlock flex:1] [circle 18×18]`
- Thumb: Image from `imageUrlMap.get('source:sourceId')` if available; else `fork.knife` SF Symbol (`size={22}`, `tintColor="#bbb"`) on `#f0f7f4` background. `meal` prop removed from `FoodLogRow` — no meal-specific placeholder styling.
- `imageUrlMap`: built in `load()` — batch query `food_cache` on `source_id IN [...]`, keyed by `source:source_id`.
- `textBlock` line 1 (`nameRow`): food name (`flex:1, 13px/600`) + kcal (`11px/500, color:'#3a7d6b'`) right-aligned.
- `textBlock` line 2 (`metaRow`): amount+unit (`11px, MUTED`) then inline: **P** (`#7c5cd6` purple) · **C** (`#f0850f` orange) · **F** (`#d4b800` gold) (all `11px/600`), separated by `fr.dim` (`#ccc`). Only shown when any macro > 0. (July 2026 — recoloured to match the macro pips: protein purple / carbs orange / fat gold.)
- Circle (`fr.circle`): **18×18**, `borderRadius:9`, `borderWidth:1.5, borderColor:'#ccc'`. Active (`fr.circleActive`): ACCENT bg + white SF `checkmark` size 8.

**Food item interactions:**
- Tap row (not in selection mode) → `startEditEntry(entry)` (async). This fetches the food from `food_cache` using `source + source_id`. If found, opens `FoodSearchModal` with `initialFood` set (full portion picker: qty stepper + named portion dropdown + Wikipedia image), `confirmLabel="Update"`, and `onDelete` to remove the entry. `handleEditFood` writes the new amount/unit/nutrition to DB and updates local `logs` state. If cache lookup fails (custom/manual foods), falls back to the simple `editEntry` modal (amount-only TextInput + proportional scale).
- Tap circle → `toggleSelect(id)`. Entering selection mode hides the nutrition tab bar.

**Selection mode state + behavior:**
- `selectedIds: Set<string>` — empty = normal mode; non-empty = selection mode.
- `useEffect` on `selectedIds.size` calls `navigation.setOptions({ tabBarStyle: selectedIds.size > 0 ? { display:'none' } : defaultTabBarStyle })`. Cleanup restores `defaultTabBarStyle`. `defaultTabBarStyle = { backgroundColor:'#edede9', borderTopColor:'#e8e8e4', borderTopWidth:1 }`.
- Selection panel: `position:'absolute', left:0, right:0, bottom:0`. White bg, `borderTopLeftRadius:18, borderTopRightRadius:18`, upward shadow. Replaces the tab bar visually.
- Panel top row: "X items selected" + Cancel (clears `selectedIds`). Panel bottom row: 4 buttons (flex:1 each): Grocery · Meal · Favourite · Delete.
  - **Grocery** → `addSelectedToGrocery()`: inserts into `grocery_list_items` for each selected entry.
  - **Meal** → shows `createMealModal` (name input, `KeyboardAvoidingView behavior="padding"` to avoid keyboard overlap, `InputAccessoryView` to suppress iOS Done toolbar) → `createMealFromSelected()`: saves `saved_meals` row with `visibility:'private'` default.
  - **Favourite** → `addSelectedToFavourites()`: for each entry, fetches `nutrients_json` from `food_cache` (source+source_id); falls back to proportional scale from log values. Upserts a `favourite_foods` row (incl. `food_groups`). Shows the `groceryToast` "Added to favourite foods".
  - **Delete** → `deleteSelected()`: removes from `food_log_entries`, clears `selectedIds`.
- ScrollView `paddingBottom` increases by 80px extra when selection mode is active.
- In selection mode, tapping row body also toggles selection (same as tapping circle).

**Calendar picker modal** (slide-up `BottomSheet`, July 2026 — was centered; the `CalendarPicker`'s `onClose` prop is passed the sheet's `close` so a day-tap slides it down):
- `CalendarPicker` component. Mon-first week. Future dates disabled (grey). Each day number sits in a **small fixed 32×32 `dayCircle`** centered in the cell (NOT the full-cell circle — the old `cellActive`/`cellToday` styles applied `borderRadius:100` to the whole `aspectRatio:1` cell, producing an oversized circle/ring; replaced July 2026). **Selected:** `dayCircleActive` → small solid ACCENT circle, white number. **Today (when not selected):** `dayNumToday` → **just a green `ACCENT` number, no ring** — matching the week-strip today style (the old `borderWidth:1.5` ring was removed).
- Color dot indicators (non-selected past days): green ≥90% calorie goal, amber 40–89%, coral <40% (with any food). Pink heart for `favourite_days`.
- Props: `calTarget` (from `targets.calories`), `calData` (Map<dateStr, kcal>), `favDates` (Set<dateStr>). Loaded in `loadCalendarData()` on mount (past 1 year of entries).

**FoodSearchModal** (`components/FoodSearchModal.tsx`): full-screen slide-up modal. Dark green header (`#244e43`, full height including safe area) with title centered and × left. Returns `FoodConfirmResult` when confirmed; consumer inserts `food_log_entries` row.

### FoodSearchModal — filter tabs
Permanent pill row below the search bar (All · Favourites · My foods · Meals). Pill style: `borderRadius:100, borderWidth:1.5, borderColor:BORDER` inactive; `backgroundColor:ACCENT, borderColor:ACCENT` active. Default: **All**.

- **All** — API search (OFF + USDA + custom foods). Empty state shows **RECENTLY ADDED** from `recent_foods` table (no FAVOURITES section). API search only fires when this tab is active.
- **Favourites** — client-side filter on `favourite_foods` rows by query.
- **My foods** — client-side filter on `custom_foods` rows. Floating **+ New food** button (56×56 circle, ACCENT bg, bottom-right). Tapping opens the create food modal.
- **Meals** — client-side filter on `saved_meals` rows. Expanded meal shows ingredient cards (white bg, standard card shadow) each with: `fork.knife` placeholder, food name + amount, brand, kcal (HEADER color) + P/C/F macros in their respective colors. Collapsed header shows item count + total kcal.

### FoodSearchModal — source icons
Small badge inline with food name on every result row:
- `VFIcon` size 13 `#244e43` — **trainer food** (curated by trainer). No heart shown for trainer foods.
- `checkmark.seal.fill` size 11 `#378ADD` — USDA official data
- `checkmark.circle.fill` size 11 ACCENT — OFF completeness ≥ 80
- `person.fill` size 11 `#999` — OFF community (completeness < 80 or unknown)
- `star.fill` size 11 `#EF9F27` — custom food (user-created)

Custom foods and trainer foods do not show a heart (favouriting is not allowed).

### FoodSearchModal — favourites (`toggleFavourite` + `favourite_foods` schema)
- **`favourite_foods` schema** (critical): `id, client_id, food_name, brand, source, source_id, nutrients_json (jsonb), food_groups (text[] NOT NULL DEFAULT '{}'), created_at`. `UNIQUE(client_id, source, source_id)` (the upsert `onConflict` target). `source` CHECK allows `off | usda | manual | custom | trainer`. RLS: `client_manage_own_favourite_foods` (`client_id = auth.uid()`, ALL). **The `food_groups` column and the `custom`/`trainer` CHECK values were added July 2026** — before that the table had no `food_groups` column, so every favourite upsert (both `toggleFavourite` and `addSelectedToFavourites`) failed silently with "column does not exist" and nothing was ever saved. Both call sites write `food_groups`, so the column must exist.
- **`toggleFavourite(food)`** (heart button on a search result / portion card): key = `${source}:${sourceId ?? name}`. Add → upsert row + update **both** `favIds` (heart fill state) **and** `favRows` (the Favourites-tab list, optimistically, so it appears without a reload — a temp `id` is used for the FlatList key only; the real `gen_random_uuid()` row loads next open) + show the "Saved to favourites" toast. Remove → **opens the "Remove from favourites?" confirmation modal** (`confirmRemoveFav` state) so it can't happen by accident — never deletes on the first heart tap. Supabase errors are surfaced via `Alert` (never swallowed) so a future schema drift can't fail silently again.
- **Remove-from-favourites confirmation** (`confirmRemoveFav: FoodResult | null`): white centered modal (`s.centeredOverlay`/`s.centeredCard`, tap-outside dismisses) — title "Remove from favourites?" · message "'{name}' will be removed from your favourites." · red **Remove** pill (`s.removeBtn`, `CORAL #e05555`) → `doRemoveFavourite(food)` · grey **Cancel** link. `doRemoveFavourite(food)` holds the actual delete (uses `.is('source_id', null)` when `sourceId` is falsy, not `.eq(...)`, so null-id foods actually delete) + prunes `favIds` and `favRows`. Cleared on modal close.
- **Toast:** auto-dismissing pill (`s.toast` / `s.toastText`, `Animated.Value` opacity, ~1.4s then fades) at `bottom:48` centered — dark `rgba(26,26,26,0.92)` pill + white `heart.fill` icon + message. Like the iOS "copied" confirmation. State: `toast` + `toastOpacity` + `toastTimer`; helper `showToast(msg)`. Cleared on modal close.

### FoodSearchModal — create custom food
The inline overlay has been extracted to `components/FoodCreateModal.tsx` (mode="client"). `FoodSearchModal` renders `<FoodCreateModal mode="client" clientId={clientId} onSavedClient={...} />` when `showCreateFood` is true. Saves to `custom_foods` table; new row appended to local `customFoods` state sorted by name.

### FoodSearchModal — edit logged entry (EditPortionSheet)
When a food log row is tapped in `app/(client)/nutrition/index.tsx`, the edit flow opens `components/EditPortionSheet.tsx` (a bottom sheet) instead of `FoodSearchModal`. `FoodSearchModal` is no longer used for editing. For trainer food entries, `startEditEntry` queries `trainer_foods` directly (not `food_cache`) to build the `FoodResult` including `portions`.

### FoodSearchModal — portion picker for trainer foods
When `openPortion(food)` is called with a trainer food (`source === 'trainer'`):
- `namedPortions = food.portions ?? []` (no USDA fetch)
- Default selected portion = `gram` (not first named portion) — trainer food default is always 100g entry mode

### FoodSearchModal — thumbnail placeholder
`fork.knife` SF Symbol, `size={22}` (food rows) or `size={18}` (meal ingredient rows), `tintColor="#bbb"`, on `#f0f7f4` background. Consistent with `FoodLogRow` in the food log screen.

### FoodSearchModal — portion picker (June 2026 redesign)

The unit-pills + gram-amount input has been replaced with a **named-portion picker**:

- When a food is tapped, `openPortion(food)` is called (async).
- While loading: a spinner is shown inside the portion card.
- For USDA foods, `fetchUSDAPortions(food.sourceId)` and `fetchWikipediaImage(food.name)` are called **in parallel**.
- The portion card then shows:
  - `[− qty +]` stepper (quantity, with "×" label). Increments by 0.5; minimum 0.5.
  - A tappable dropdown row showing the current portion name + gram weight, e.g. `egg (50g) ▼`.
  - Tapping the dropdown opens a **white centered modal** listing all named portions + "gram / ml" at the bottom.
  - The preview label reads "NUTRITION FOR 1 egg (50g)".
- When "gram / ml" is selected: the stepper shows gram amount and increments by 10g.
- `serving` and `piece` unit pills are no longer shown if the food has no known `servingSizeG`.

**Portion data sources:**
- Foundation foods: `foodPortions[]` array → `modifier` field is the label ("large grade a", "tablespoon"). `portionDescription` used as fallback with leading quantity stripped.
- SR Legacy foods: `foodMeasures[]` array → `disseminationText` field ("1 large") with leading number stripped.
- Both loops apply `isGarbage()` filter: skips purely-numeric labels, "undetermined", "quantity not specified", "unknown", "not specified", "other".

**Portion picker props** (`FoodSearchModal`):
- `initialFood?: FoodResult` — when set, skips search UI and goes directly to the portion card. `autoFocus` on search input is disabled. Used for the edit flow.
- `confirmLabel?: string` — overrides "Add to {mealLabel}" button text (e.g. "Update").
- `onDelete?: () => void` — when set, shows a "🗑 Remove from log" link below the confirm button.

### FoodSearchModal — food images
- OFF foods: `imageUrl` comes from `image_front_thumb_url` in the search results and is cached in `food_cache.image_url`.
- USDA foods: no images in the USDA API. When a USDA food is tapped, `fetchWikipediaImage(food.name)` is called in parallel with `fetchUSDAPortions`. It tries `"{keyword} as food"` first (e.g. "egg as food"), then falls back to the bare keyword ("egg"). If a thumbnail is found, it is: (1) shown in the portion card immediately, (2) used to update the in-memory search results list, (3) saved to `food_cache.image_url` so future searches display the thumbnail without re-fetching.
- After adding or editing a food log entry, `imageUrlMap` is updated from `food_cache.image_url` so the food item in the log shows the image immediately.

### `lib/foodApi.ts` — FoodResult
Added fields: `completeness?: number` (OFF score 0–100), `isGerman?: boolean` (countries_tags contains `'en:germany'`), `isBrandSubmitted?: boolean` (data_sources contains producers/database). `source` type extended to `'off' | 'usda' | 'manual' | 'custom'`.

### `lib/foodApi.ts` — USDA data type filter
`searchUSDA()` passes `dataType=Foundation,SR%20Legacy` to the FoodData Central API. This excludes:
- **Survey (FNDDS)** — mixed-dish survey entries like "Egg Burrito", "Egg, Creamed", "Egg Omelet Or Scrambled" that pollute ingredient searches
- **Branded Food** — manufacturer SKUs better served by OFF

Only whole-food Foundation and SR Legacy entries are returned (e.g. "Chicken, Broilers or Fryers, Breast, Meat Only, Raw"). USDA API key stored in `searchUSDA()` — personal key required (not DEMO_KEY which is rate-limited to 40 req/day).

### `lib/foodApi.ts` — German-first OFF search
`searchOFF()` runs the Germany-filtered query first (`tagtype_0=countries&tag_contains_0=contains&tag_0=germany`). If ≥ 5 results, returns them. If < 5, also runs a global query and merges/dedupes. OFF API fields: `code,product_name,brands,nutriments,categories_tags,countries_tags,data_sources,completeness,serving_size,image_front_thumb_url`.

### `lib/foodApi.ts` — cache lookup strategy
Cache query uses only the **first word** of the query (`ilike '%{firstWord}%'`), not the full phrase. This ensures "chicken breast" finds all "Chicken, …" cache entries rather than requiring the literal substring "chicken breast". For **single-word queries** with ≥10 cache hits, the API is skipped. For **multi-word queries**, the API is always called regardless of cache size — the cache alone will not contain the specific multi-word combinations (e.g. "Chicken, Broilers or Fryers, Breast, …" won't be found by `%chicken breast%`).

### `lib/foodApi.ts` — zero-calorie filtering
`rankResults()` filters out any result with `nutrientsPer100g.calories === 0` before sorting. USDA Foundation/SR Legacy occasionally has incomplete entries where the energy field was not measured — these are always data gaps and should never appear to the user.

### `lib/foodApi.ts` — search ranking
Two separate scoring paths based on query word count. Custom foods always return 1000 (always first).

**Single-word query** (e.g. "pear", "egg", "chicken"):

Primary concept = text before the first comma in the food name (USDA convention: "Pears" in "Pears, Raw, Bartlett"; "Pear Nectar" in "Pear Nectar, Canned"). Uses `deplural()` for singular/plural matching ("pears" → "pear").

| Condition | Score |
|---|---|
| Single pre-comma word, depluraled match (e.g. "pears" for "pear") | +80 |
| Single pre-comma word, starts with query | +55 |
| Single pre-comma word, partial deplural match | +40 |
| Compound pre-comma exact match | +70 |
| Compound pre-comma starts with query | +40 |
| Name starts with query | +30 |
| Each extra word in compound pre-comma concept | −15 per word |
| No brand | +15 |
| Has brand | −25 |
| Dish word in name (burrito, omelet, creamed, etc.) | −30 |
| Space-separated name with ≥3 words, no commas | −15 |
| USDA source | +10 |
| German product | +8 |
| OFF completeness ≥ 80 | +8 |
| OFF, not German | −10 |
| OFF completeness < 40 | −15 |

**Multi-word query** (e.g. "chicken breast", "egg boiled"):

| Condition | Score |
|---|---|
| All query words present in name | +60 |
| Name starts with full query | +20 (additive) |
| Single pre-comma concept matches first query word | +20 (additive) |
| Each missing query word | −80 |
| No brand | +15 |
| Has brand but all words present | 0 (neutral) |
| Has brand and words missing | −25 |
| All words present + space compound ≥3 words | −10 |
| Dish word (words present path) | −20 |
| USDA source | +10 |
| German product | +8 |
| OFF completeness ≥ 80 | +8 |
| OFF, not German | −8 |
| OFF completeness < 40 | −15 |

The −80 per missing word is intentionally crushing — when a user searches "chicken breast", any result that doesn't contain "breast" (e.g. "Chicken, ground") should effectively be excluded.

`DISH_WORDS_RE` catches stale FNDDS cache entries from before the dataType filter was added: `burrito|sandwich|salad|wrap|pizza|pasta|burger|taco|quesadilla|enchilada|sushi|soup|stew|curry|casserole|pie|muffin|cookie|brownie|donut|doughnut|pudding|smoothie|shake|cocktail|granola|frittata|quiche|omelet|omelette|risotto|paella|lasagna|lasagne|ramen|chili|chilli|goulash|stroganoff|creamed|deviled|stuffed|benedict|au gratin`.

### `lib/foodApi.ts` — exports
- `loadCustomFoods(clientId)` — fetches all custom foods for a client, returns `FoodResult[]`
- `customFoodRowToResult(row)` — converts a `CustomFoodRow` to `FoodResult`
- `CustomFoodRow` interface
- `searchFoods(query, clientId?)` — when `clientId` provided, includes filtered custom foods in All results
- `fetchUSDAPortions(fdcId)` — calls USDA detail endpoint (no `format=abridged`), returns `FoodPortion[]`. Handles Foundation (`foodPortions[]`, uses `modifier` as label) and SR Legacy (`foodMeasures[]`, strips leading quantity from `disseminationText`). Garbage filter: numeric-only strings, "undetermined", "quantity not specified", "unknown", "not specified", "other" are skipped.
- `fetchWikipediaImage(foodName)` — free, no API key. Tries `"{keyword} as food"` then `"{keyword}"` on the Wikipedia REST API (`/page/summary/`). Returns `thumbnail.source` URL or `undefined`. Keyword = first word before first comma, lowercased, crude-depluralized.
- `FoodPortion` interface — `{ label: string; grams: number }`
- `FoodResult.portions?: FoodPortion[]` — named portions from USDA (populated transiently during search, not persisted in cache)

**Salt normalization (critical — do not break):** `food_cache.nutrients_json.salt` and `food_log_entries.salt_g` are always in **grams** (not mg). Three layers enforce this:
1. `normaliseOFFNutriments` / `normaliseUSDANutrients`: `if (salt > 10) salt /= 1000` on fresh API data.
2. `getCached()`: `if (n.salt > 50) n.salt /= 1000` on every cache read. Threshold is **50, not 10** — legitimate high-salt condiments (bean sauce, soy sauce) reach 11–18g/100g; using 10 would incorrectly halve them. Values > 50g/100g are physically impossible for any food.
3. One-time DB migration (May 2026) corrected existing stale rows in `food_cache` and `food_log_entries`. Do not lower the `getCached` threshold below 50.

**Water tracker (July 2026 — moved into the pips + FAB, no standalone card):** the old bottom "WATER" glasses card was removed. Water now lives as the **4th micro pip** (💧, display only — shows `waterMl/1000 L / targetMl/1000 L`, tap → info modal in ml) and is **added** via the FAB "+" picker's expandable **💧 Water** row (tap drops to set the level). `totalWaterGlasses = round((water_target_ml ?? 2000) / 250)`, each glass 250 ml, `saveWater(glasses)` upserts `water_logs` on `client_id,date`.

**Save Day as Favourite:** the ♥ now lives in the **week-strip header** (right side, next to the calendar icon) — `handleSaveDayPress` → white centered modal with name input. Inserts a `favourite_days` row (`client_id, name, date_reference, snapshot_json` = the day's `logs`), then optimistically adds the date to `favDates` so the heart fills and the calendar pink dot appears immediately. If duplicate date → warn before overwriting (`saveDayWarnModal` state). **The `favourite_days` table itself was created July 2026** — before that it did not exist, so every save failed silently (see CLAUDE.md §4 / SPEC.md). The heart shows `heart.fill` light-green `ACCENT` when the selected day is in `favDates`, else the outline `heart` in dark-green `HEADER`.

---

## Client Weekly Report (`app/(client)/nutrition/weekly.tsx`)

### Header + week selector

- **Header:** dark green 62px + `insets.top`. Back chevron left · "Weekly Report" centered · VFIcon right → home.
- **Week selector bar** (separate `View` below header, NOT inside it): `flexDirection:'row', justifyContent:'center', gap:12, backgroundColor:BG, paddingTop:16, paddingBottom:8`. Dark green HEADER chevrons + label. Right chevron disabled (`tintColor:'#ccc'`) on current week.
- **`toDateStr(d)`** uses `getFullYear/getMonth/getDate` (local time) — **never `d.toISOString().split('T')[0]`** which shifts the date back one day in UTC+ timezones, causing the wrong day to show in the detail view.
- Changing `weekStart` resets `selectedWeekDay` to null via `useEffect`.
- Scroll content: `paddingHorizontal:16, paddingTop:10, gap:12`.

### Data loading

```ts
load() → Promise.all([
  food_log_entries WHERE client_id + date BETWEEN weekStart AND weekStart+6,
  client_nutrition_targets WHERE client_id,
  weekly_nutrition_notes WHERE client_id + week_start = weekStartStr,
])
```

Called via `useFocusEffect(useCallback(() => { setLoading(true); load().finally(...) }, [load]))`. `load` depends on `clientId` + `weekStart` so changing weeks triggers a reload while screen is focused.

### Computed values

```ts
const weekDays   = Array.from({length:7}, (_, i) => toDateStr(addDays(weekStart, i)));
const weekDates  = [...new Set(logs.map(e => e.date))];
const loggedDays = weekDates.length;
const avgCal     = loggedDays > 0 ? Math.round(sumField(logs,'calories') / loggedDays) : null;
const proHitDays = targets?.protein_g != null
  ? weekDates.filter(d => sumField(logs.filter(e=>e.date===d),'protein_g') >= targets.protein_g!).length
  : null;
// Week total ÷ 7 (includes unlogged days as zero)
const wkAvgCal7, wkAvgPro7, wkAvgCarbs7, wkAvgFat7 = sumField(logs, field) / 7;
// Stats card color coding
const daysColor = loggedDays >= 7 ? HEADER : loggedDays >= 5 ? AMBER : CORAL;
const calDiff   = avgCal != null && targets?.calories ? Math.abs(avgCal - targets.calories) : null;
const calColor  = avgCal == null ? MUTED : calDiff == null ? HEADER : calDiff <= 100 ? HEADER : calDiff <= 200 ? AMBER : CORAL;
// Day detail
const selDayLogs = selectedWeekDay ? logs.filter(e => e.date === selectedWeekDay) : [];
```

### Layout — sections in order

#### 1. Trainer note card
Shown only when `weekly_nutrition_notes` has a row for this week. White card, 3px ACCENT left border, trainer "V" avatar circle (HEADER bg).

#### 2. Diet badge
`alignSelf:'flex-start'` pill from `DIET_COLORS` map. Colors: vegan=green, vegetarian=purple, pescatarian=blue, omnivore=orange, keto=amber, carnivore=red, low-carb=teal, custom=grey.

#### 3. Stats card (`wkStatsCard`)
White card, `flexDirection:'row'`, 3 equal cells with `borderColor:BORDER` dividers. Cell: `paddingVertical:16, alignItems:'center'`. Number `fontSize:24, fontWeight:'700'`. Label `fontSize:11, color:MUTED`.
- **Days logged:** color = `daysColor`
- **Avg kcal / day:** color = `calColor`; shows `'—'` when null
- **Protein on target:** color = ACCENT when 7/7 else `COL_PROT` (`#378ADD`)

#### 4. Weekly Average vs Target card (`wkAvgCard`)
Dark green `HEADER` bg, `borderRadius:16, padding:16`. Shadow: `shadowOpacity:0.22, shadowRadius:10, offset{0,4}, elevation:6` (dark card spec). Only shown when `loggedDays > 0`.

Light-on-dark color scheme:
| Nutrient | Color |
|---|---|
| Calories | `#38c49a` (light mint green) |
| Protein | `#7ec8f5` (light blue) |
| Carbs | `#f5c842` (light amber) |
| Fat | `#f0916a` (light coral) |

- Section label: `wkAvgLabel` — `rgba(255,255,255,0.5)`, 11px/700, letterSpacing 0.6
- Row names: `wkAvgName` — `rgba(255,255,255,0.85)`, 13px
- Values: `wkAvgVal` — 13px/600; color = `#ff9090` when over target, else macro color
- Target text: `wkAvgMuted` — `rgba(255,255,255,0.4)`, 12px normal weight
- Track: `wkAvgTrack` — height 6, `rgba(255,255,255,0.15)` bg
- Bar fill: always the macro color (NOT coral when over — only the number changes)
- Caption: `wkAvgNote` — `rgba(255,255,255,0.4)`, 11px centered

#### 5. 7-day strip card

Section label "TAP A DAY FOR DETAIL". `dayStrip: flexDirection:'row', gap:4, marginTop:4`.

Each `dayBtn`: `flex:1, alignItems:'center', paddingVertical:10, borderRadius:10, backgroundColor:BG`. Selected = `backgroundColor: HEADER+'1A', borderWidth:1.5, borderColor:HEADER`.

Contents top-to-bottom:
- Day abbrev (`dayBtnName` 11px/600 MUTED; ACCENT today; HEADER selected)
- Date number (`dayBtnDate` 16px/700; ACCENT+700 today; HEADER+700 selected)
- Kcal count if logged (`dayBtnKcal` 10px MUTED; HEADER selected) else `<View style={{height:13}}/>`
- **Calorie status line** (`dayStatusLine`): `height:4, width:'65%', borderRadius:2, marginTop:4`. ACCENT ≥90% / AMBER 40–89% / CORAL 1–39% / transparent when no logs.
- **Protein line** (only rendered when `targets?.protein_g != null`): same `dayStatusLine` style + `marginTop:2`. `backgroundColor: COL_PROT` when `hitProtein(ds) && dl.length > 0`, else `'transparent'`.

`hitProtein(ds)`: day logs summed protein_g ≥ `targets.protein_g`.

Legend row (`dayLegend`): `flexDirection:'row', justifyContent:'center', gap:14, flexWrap:'wrap'`. Items: ● On track (ACCENT) · ● Partial (AMBER) · ● Struggling (CORAL) · ● Protein ✓ (COL_PROT — only rendered when protein target is set).

#### 6. Inline day detail

Header row (`dayDetailHeader`): day name 15px/700 HEADER + `xmark.circle.fill` to close.

**If no logs:** white card with centered italic "No food logged for this day".

**If logs — two sections:**

**TARGETS card** (gradient, shadow wrapper):
- Outer `targCardWrap`: `borderRadius:16` + standard white card shadow — NO `backgroundColor`, NO `overflow:'hidden'`.
- Inner `LinearGradient` (`targCardGrad`): `colors=['#f0f7f4','#cce8de','#aed8ca']`, `start={x:0,y:0}`, `end={x:1,y:1}`, `borderRadius:16, padding:16, overflow:'hidden'`.
- Section label "TARGETS" in `HEADER` color.
- 4 analysis rows (Calories / Protein / Carbs / Fat). Track bg overridden to `rgba(36,78,67,0.12)`. Bar stays macro color. Number turns CORAL when over. Calories color = `#38c49a`.
- Only shown when at least one target value (`calories`, `protein_g`, `carbs_g`, `fat_g`) is non-null.

**Meal section cards** (`mealCard`): white card, `borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:BORDER`. Header row: emoji icon in colored circle (`MEAL_COLOR[meal]+'20'` bg) + meal label + kcal. Divider. Food item rows:

```
mealCard meals:
  breakfast  🍳  #f5a623
  snack_morning 🥐 #e8923a
  lunch      🥗  #24ac88
  snack_afternoon 🍎 #34c759
  dinner     🍲  #6b5ce7
  snack_evening 🫖 #5ac8fa
```

`snack_afternoon` also captures legacy `meal_category === 'snack'` entries.

**Food item rows** (match `FoodLogRow` style from Food Log screen):
- Layout: `[logThumb 42×42] [textBlock flex:1]` — no selection circle.
- `logThumb`: `borderRadius:8, backgroundColor:'#f0f7f4'` — 🍏 emoji `fontSize:20`.
- `logNameRow`: `flexDirection:'row', alignItems:'center', gap:4`. Food name `flex:1, 13px/600 TEXT`. Kcal `11px/500, color:'#3a7d6b'`.
- `logMetaRow`: `flexDirection:'row', alignItems:'center', marginTop:2, flexWrap:'wrap'`. Portion `11px MUTED`. When any macro > 0: dim `#ccc` · **P** `#378ADD` · dim · **C** `#d4920a` · dim · **F** `#D85A30` (all 11px/600).

#### 7. What you ate card

Shown only when `loggedDays > 0`. Title 14px/700.

`countDaysWithGroup(weekLogs, gd)` — counts distinct dates where any entry matches `foodGroups` OR `name_patterns`. Both arrays optional on `GroupDef`.

**Food group configs per diet:**

| Diet | Groups |
|---|---|
| vegan | Veg & Fruit · Legumes · Whole grains · Nuts & seeds |
| vegetarian | Veg & Fruit · **Meat** (0/7 expected) · **Dairy & Eggs** · Legumes · Whole grains |
| pescatarian | Veg & Fruit · Fish · **Dairy & Eggs** · Whole grains |
| keto | Fat · Protein (meat+fish) · Veg & Fruit · **Dairy & Eggs** |
| carnivore | Meat · Fish · **Dairy & Eggs** |
| omnivore/default | Veg & Fruit · Meat · **Dairy & Eggs** · Fish · Whole grains |

**"Dairy & Eggs"** — `foodGroups:['dairy'], name_patterns:[/\begg\b/i, /\beier\b/i]`. Egg pattern detection catches foods named "egg"/"Egg" or German "Eier" that aren't tagged with the `dairy` food group. The label is always "Dairy & Eggs" for all diets that include dairy.

Vegetarian diet intentionally includes a **Meat** row — it will show 0/7 days for a vegetarian client, which is correct and expected behavior.

Group row: `[10×10 colored dot] [label 96px] [X/7 days 52px right-aligned] [progress track flex:1]`. Track height 6, `BG` bg. Fill colored with group color.

#### 8. Coaching insights

Section label "COACHING INSIGHTS" (11px/700 MUTED, letterSpacing 0.6). From `getWeeklyInsights(logs, targets)` in `lib/nutritionInsights.ts`.

| Severity | Bg | Icon | Icon color |
|---|---|---|---|
| red_flag | `#FCEBEB` | exclamationmark.circle.fill | `#e05555` |
| warning | `#FAEEDA` | exclamationmark.triangle.fill | AMBER |
| info | `#E6F1FB` | info.circle.fill | `#4a9eff` |
| positive | `#EAF3DE` | checkmark.circle.fill | ACCENT |

Each insight card: `borderRadius:12, padding:14`. Row: icon 22px + `flex:1` text block (message 13px/600 + stat 11px MUTED).

---

## Client Grocery List (`app/(client)/nutrition/grocery-list.tsx`)

### DB table
`grocery_list_items`: `id uuid PK`, `client_id uuid → auth.users`, `name text`, `quantity text nullable`, `is_checked boolean default false`, `checked_at timestamptz nullable`, `created_at timestamptz`. RLS: client ALL (`client_id = auth.uid()`).

### `GroceryItem` interface
```ts
{ id, client_id, name, quantity: string|null, is_checked, checked_at: string|null, created_at }
```

### `GroceryRow` component
- **Circle on right** (26×26, `borderRadius:13`): empty border when unchecked, ACCENT filled + `checkmark` SF symbol when checked. `hitSlop:8`. Tap = toggle.
- **Swipe LEFT** → red Delete action (`backgroundColor:CORAL, borderTopRightRadius:12, borderBottomRightRadius:12`). On tap: close swipe, call `onDeleteRequest(item)` → shows delete confirmation modal (never deletes silently).
- **Swipe RIGHT** → green Bought/Uncheck action (`backgroundColor:ACCENT, borderTopLeftRadius:12, borderBottomLeftRadius:12`). Icon: `checkmark` (unchecked) or `arrow.uturn.backward` (checked). On tap: close swipe, call `onCheck` or `onUncheck`.
- `Swipeable` ref stored as `swipeRef` — call `swipeRef.current?.close()` before any action callback.
- `overshootLeft:false, overshootRight:false` on all Swipeables.

### State + handlers
- `checkItem(item)`: sets `is_checked=true, checked_at=now()` locally + DB. Re-sorts: unchecked first.
- `uncheckItem(item)`: sets `is_checked=false, checked_at=null` locally + DB. Re-sorts.
- `confirmDelete(item)`: sets `deleteTarget` state (shows modal).
- `deleteItem()`: deletes `deleteTarget` from DB + local state, clears `deleteTarget`.
- `addItem()`: inserts new unchecked item optimistically with `makeUUID()`.

### Delete confirmation modal
White centered modal (`s.modal`, `borderRadius:16`). Title "Remove item?". Body: `"[name]" will be removed from your grocery list.` Red `confirmBtn` (`backgroundColor:CORAL`) + Cancel link. Always required — no silent deletes.

### List layout
- **"TO BUY (N)"** section label → unchecked items ordered by `created_at`.
- **"BOUGHT — TODAY / YESTERDAY / D MONTH YYYY"** section label → checked items grouped by `formatCheckedDate(checked_at)`. `groupByDate()` helper: Map<label, items[]> then sorted (Today → Yesterday → older).
- `formatCheckedDate(iso)`: compares `new Date(iso).toDateString()` with today/yesterday using `Date.toDateString()`. Returns `'Today'`, `'Yesterday'`, or `d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })`.

### No swipe-to-delete without confirmation
Every delete action (in both TO BUY and BOUGHT sections) goes through `onDeleteRequest` → confirmation modal. There is no direct delete that bypasses the modal.

---

## Client Favourites tab (`app/(client)/nutrition/favourites.tsx`)

**Landing page (default):** Four full-width `FullWidthCard` components stacked vertically. No segmented tab switcher.

```
Recipes         — gradient ['#2d6456','#1e4038']  — book.closed.fill  — "Trainer picks & your own creations"
Meals           — gradient ['#2e4288','#1d2d6a']  — fork.knife         — "Saved meal combinations"
Days            — gradient ['#7a3060','#551a48']  — heart.fill         — "Favourite full-day logs"
Recommendations — gradient ['#c87820','#e89840']  — pills.fill         — "Supplements & nutrition tips"
```

**`FullWidthCard` spec:** `height:142, borderRadius:20, padding:18, overflow:'hidden'`. Shadow wrap: `shadowOpacity:0.2, shadowRadius:14, offset{0,5}, elevation:7`. Spring scale `toValue:0.97` on pressIn (Animated.View + Pressable). Two decorative circles: `circle1` = `top:-32,right:-32, 158×158, rgba(255,255,255,0.07)`; `circle2` = `top:26,right:52, 61×61, rgba(255,255,255,0.05)`. Body: icon in a `View style={fc.iconWrap}` (`marginBottom:8`) as first body child — **icon is in normal document flow, NOT absolutely positioned** — this guarantees it left-aligns exactly with the title text. Title: 18px/800, letterSpacing:-0.3. Desc: 13px/60% white opacity, marginBottom:8. Footer: count badge (`rgba(255,255,255,0.18)` pill, 12px/700 white) + `arrow.right` 14px 55% white. Count shows `—` while loading.

**Navigation:** `view` state: `'landing' | 'recipes' | 'meals' | 'days' | 'recommendations'`. URL param `?tab=X` initialises view to that category (bypasses landing). URL param `?insertMode=true` (used with `tab=days`) puts Days list into insert mode. Header back chevron: **if `isInsertMode` → `router.navigate('/(client)/nutrition')`** (one step straight back to the Food Log, since insert mode is only ever reached from the Food Log FAB — without this the back would `setView('landing')` and strand the user on the Favourites landing); otherwise landing → **`router.navigate('/(client)/nutrition')`** (July 2026: was `router.back()`, which — because the nutrition `<Tabs>` uses `backBehavior="none"` — bubbled past the Food Log tab all the way to the client Home screen; from Favourites the user expects to land on **Food Log**, so navigate there explicitly), list view → `setView('landing')`. Header title updates to category name when in list view.

**Recipes list:** search bar + `plus.circle.fill` create button. **Filter pills row** (below search bar, above recipe cards): **All** · **Mine** · **Vitek's** — `RecipeFilter` type `'all' | 'mine' | 'trainer'`. All = no filter; Mine = `created_by === clientId`; Vitek's = `created_by_role === 'trainer'`. Filter applied before query-string filter. Pill styles: `filterPill` (border 1.5px BORDER, borderRadius 100) / `filterPillActive` (ACCENT bg+border) / `filterPillText` / `filterPillTextActive`. Default: All. Recipe cover cards (`rc` styles, 130px, cover photo or `#3a7d6b→#244e43` gradient).

**Meals list:** search bar (`recipeToolbar` + `searchBar` styles, shared with Recipes) + **sort pills row**: **Newest** · **Oldest** · **A–Z** · **Z–A** — `mealSort` state `'newest' | 'oldest' | 'az' | 'za'`, default `'newest'`. `filteredMeals` IIFE applies name search then sort. Shows "No results / Try a different search" empty state when search finds nothing. Cover photo (76×76) or indigo gradient placeholder (`#2e4288→#1d2d6a`) with fork.knife icon, meal name, item count, kcal/P/C/F macro row. Tap → full meal detail view.

**Meal detail** (`mealDetail` state, rendered as absolutely-positioned `View` with `zIndex:10` covering the screen — NOT a Modal, avoids iOS modal-stacking issues):
- **Header**: dark green 62px + safe area. Meal name centered (tap to open inline rename overlay). Back chevron left.
- **Cover photo** (200px, full width): shows `cover_photo_url` or `#2e4288→#1d2d6a` gradient with fork.knife. Small camera badge (32×32, `rgba(0,0,0,0.55)`) bottom-right — tap to pick photo via `ImagePicker` → upload to `meal-covers` bucket → save immediately.
- **Nutrition strip**: kcal (dark, 17px/700) · Protein (blue `#378ADD`) · Carbs (amber `#EF9F27`) · Fat (coral `#D85A30`) — white card.
- **Ingredients section**: each row = 🍏 placeholder or food image (52×52) + food name + amount·kcal + macros. Swipe left → red 80px "Remove" action (Swipeable). Tap row → opens ingredient edit overlay (amount input + live nutrition preview + Update/Cancel/"Remove from meal").
- **+ Add food button**: always visible below ingredients — opens `FoodSearchModal` (rendered as sibling to detail view, never nested).
- **Notes section**: tappable box shows notes text or "Tap to add a note…" — opens inline notes overlay (multiline TextInput).
- **Share with**: 3 pills (No one · My trainer · My clients) — tap saves visibility to DB immediately.
- **Log this meal button**: opens Log Meal Modal (date picker + meal category pills using lowercase keys `breakfast|lunch|dinner|snack_morning`).
- **Delete meal** text link (red) — `confirmModal` pattern.
- **Inline overlays** (absolutely positioned `View zIndex:20` with dim bg, inside detail view): Rename overlay · Notes overlay · Ingredient edit overlay. Each uses `KeyboardAvoidingView behavior="padding"` and `Pressable` dim background to dismiss.

**`saved_meals` table columns**: `id, client_id, name, ingredients (jsonb), cover_photo_url (text nullable), notes (text nullable), visibility (text NOT NULL DEFAULT 'private'), created_at`. `MealIngredient` JSONB shape: `{ foodName, brand, source, sourceId, amount, unit, nutrition:{calories,protein,carbs,fat,fiber,sugar,salt}, foodGroups, nutrientsPer100g }`. Helper `ingDisplayName(ing)` → `ing.foodName ?? ing.name ?? '—'`.

**Storage bucket `meal-covers`**: public, authenticated users INSERT/UPDATE/DELETE. Upload uses `arrayBuffer()` (never `blob()`).

**Log Meal Modal** (`MEAL_CATS` array): `[{ key:'breakfast', label:'Breakfast' }, { key:'lunch', label:'Lunch' }, { key:'dinner', label:'Dinner' }, { key:'snack_morning', label:'Snack' }]` — uses lowercase DB keys, not display strings. Default `logMealCat = 'lunch'`.

**Days list:** expandable white item cards with `heart.fill` ACCENT icon. Expanded shows food entries grouped by meal category. "Use this day" → date picker modal + confirm. In `insertMode=true`: tap → insert modal (today). Delete uses `confirmModal` (danger:true).

**Recommendations list:** fetches `nutrition_tips` where `category IN ['supplement','tip'] AND is_published=true`, ordered newest first. `Recommendation` interface includes `category: 'supplement' | 'tip'`. **Tab switcher** (underline style, matching Progress screen): **Supplements** · **Tips** — `recommTab` state `'supplement' | 'tip'`, default `'supplement'`. Tab bar: `recommTabBar` (`flexDirection:'row', justifyContent:'center', gap:32, paddingTop:20, paddingBottom:6`); active item has `borderBottomWidth:2, borderBottomColor:ACCENT`; text 20px/500 `#bbb` inactive, 20px/600 TEXT active. List filtered by `recommTab`. Supplements: amber gradient thumbnail (`#c87820→#e89840`, `pills.fill`). Tips: dark green gradient thumbnail (`#3a7d6b→#244e43`, `lightbulb.fill`). Strip cards: thumbnail + title + body preview + chevron. Tap → white centered modal (`width:'85%', overflow:'hidden'`): gradient top 100px (amber for supplement, dark green for tip) + 4px accent bar (AMBER or ACCENT) + title 17px/700 + link URL in ACCENT (if set) + body 14px muted + "Close" bottom link. Client read-only. State: `selectedRecomm: Recommendation | null`. Also accessible as standalone screen `app/(client)/nutrition/recommendations.tsx`.

**All loaders run in parallel** via `Promise.all([loadRecipes(), loadMeals(), loadDays(), loadRecommendations()])` in `useFocusEffect`.

---

## Client Tips tab (`app/(client)/nutrition/tips.tsx`) — removed

Tab hidden (`href: null`). File contains only `<Redirect href="/(client)/nutrition" />`.

Content previously here has moved:
- **Tip of the day** → `NotificationOverlay` (area="nutrition", type `tip_of_the_day`)
- **Recipes** → Favourites tab → Recipes list
- **Recommendations** → Favourites tab → Recommendations list

---

---

## `components/FoodCreateModal.tsx` — shared food creation modal

Used from both the client food log (My foods tab) and the trainer Library Foods tab. `mode: 'client' | 'trainer'`.

### Form layout (both modes)
All sections collapsed by default on open. Sections:
1. **Photo picker** (trainer only) — top of form; 72px tappable area; uploads to `trainer-foods` bucket via `arrayBuffer()`. Aspect 1:1, quality 0.85.
2. **Name *** (required)
3. **Name auf Deutsch** (trainer only, optional)
4. **Brand** (client only, optional)
5. **NUTRITION PER 100g** — collapsible toggle (chevron); default **collapsed**. Contains: Calories, Protein, Carbs, Fat, Fiber, Sugar, Salt (all decimal-pad).
6. **FOOD GROUPS** — collapsible toggle (trainer only); default **collapsed**. Pills: Veg · Fruit · Meat · Fish · Dairy · Legume · Grain · Nut · Fat. Multi-select.
7. **DEFAULT PORTION** — always visible, always at bottom. Not collapsible.

### DEFAULT PORTION — trainer mode
Three independent rows, each with its own gram-weight input:
- **Serving** row: `[ ___ g ]` — gram weight of 1 serving. Leave empty to skip.
- **Piece** row: `[ ___ g ]` — gram weight of 1 piece. Leave empty to skip.
- **Custom** row: `[ label ]  [ ___ g ]` — type any label (Can, Tub, Bottle…) and its gram weight. Both must be non-empty to include.
- A muted italic note: "100g is always available. Set optional extras:"
- Saved as `trainer_foods.portions JSONB`: `[{label:'serving',grams:150},{label:'piece',grams:50},{label:'can',grams:400}]`

### DEFAULT PORTION — client mode
Single `portionAmount` TextInput + unit pills (g · serving · piece). When serving or piece is selected, shows italic hint: "Enter the gram weight of 1 serving (e.g. 1 serving = 50 g)". Saves to `custom_foods.default_portion_amount` + `default_portion_unit`.

### Keyboard behaviour
- No `KeyboardAvoidingView` (causes white-screen bug inside transparent Modal on iOS)
- No `InputAccessoryView` (unreliable for `decimal-pad` keyboards)
- `keyboardDismissMode="interactive"` + `automaticallyAdjustKeyboardInsets` on ScrollView
- Floating green **Done** pill button (`position:'absolute', right:16, bottom:kbHeight+10`) driven by `Keyboard.addListener('keyboardWillShow/Hide')`. Appears above ALL keyboard types uniformly.
- `Keyboard.dismiss()` called at start of `handleSave` before any async work

### Save behaviour
- Client mode → inserts into `custom_foods`; calls `onSavedClient(FoodResult)`
- Trainer mode → inserts/updates `trainer_foods` with portions array; calls `onSavedTrainer(row, isNew)`
- Edit mode (trainer): pre-fills all fields from `editRow.portions`. Custom portion: first entry in `portions` where label ≠ 'serving' and ≠ 'piece'.
- **Delete**: `onDeleteTrainer()` prop called → parent closes modal first, then shows `confirmModal`; never deletes inside the modal component.

---

## `components/EditPortionSheet.tsx` — food log entry edit bottom sheet

Used from the client food log when a logged food entry is tapped. Replaces the full `FoodSearchModal` for the edit flow. Shows only the portion picker — no search bar, no filter tabs.

### Props
`food: FoodResult | null`, `visible: boolean`, `onClose`, `onConfirm(FoodConfirmResult)`, `onDelete?`

### Layout
Bottom sheet: `animationType="slide"`, transparent overlay with `justifyContent:'flex-end'`. White sheet with `borderTopLeftRadius:20, borderTopRightRadius:20`, drag handle pill at top.

### Swipe-down-to-dismiss
The sheet is an `Animated.View` (transform `translateY`) with a `PanResponder` — swiping **down anywhere on the sheet** dismisses it (previously only a backdrop tap worked; the drag handle was decorative). Config: `onStartShouldSetPanResponder: () => true` (claims taps on empty sheet area so the backdrop doesn't close, while deeper interactive children — stepper buttons, amount input, dropdown, Update, Remove — still win the touch first via bubbling); `onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && g.dy > Math.abs(g.dx)` (only clear downward drags); move sets `translateY = g.dy` (down only); release → if `g.dy > 90 || g.vy > 0.6` animate `translateY` to 800 then `onClose()` (via `onCloseRef` so the ref-captured PanResponder always calls the latest `onClose`), else spring back to 0. `translateY` resets to 0 whenever `visible` flips true.

Contents (top to bottom):
1. Drag handle (36×4 pill, `#e0e0dc`)
2. Food photo (180px, borderRadius 12) — if `food.imageUrl` is set
3. Food name (20px/700) + brand (13px muted)
4. `[−] amount [+]` stepper
5. Portion dropdown (shows current selection; tapping opens a centered white modal picker)
6. Nutrition preview card (KCAL, PROTEIN, CARBS, FAT + FIBER, SUGAR, SALT)
7. **Update** green pill button
8. **Remove from log** red link (only when `onDelete` is provided)

### Portion default for trainer foods
When `food.source === 'trainer'`: default selection = gram option. Named portions (serving, piece, custom) are available in the dropdown but not pre-selected. All other sources: default = first named portion (existing behaviour).

### Image loading in food log
`imageUrlMap` in `app/(client)/nutrition/index.tsx` is built by two parallel queries:
- `food_cache` for `source IN [off, usda]` entries
- `trainer_foods` for `source = 'trainer'` entries (keyed as `trainer:{id}`)

---

## Custom SVG icon components

**`components/icons/PearIcon.tsx`**
- Props: `size` (default 30), `color` (default `#ffffff`), `badge: boolean`, `badgeColor` (default `#24ac88`)
- Renders MDI `fruit-pear` path in a 24×24 viewBox — `fill="none"`, `stroke={color}`, `strokeWidth=0.7`, `strokeLinejoin/cap="round"`
- Badge: 8×8px circle, `position:'absolute', top:0, right:0`, `backgroundColor:badgeColor`
- Used in: Food Log header (left, size 30); client home Nutrition tile watermark (size 112, no badge)

**`components/icons/KettlebellIcon.tsx`**
- Props: `size` (default 30), `color`, `badge`, `badgeColor`
- Renders MDI `kettlebell` path in a 24×24 viewBox — `fill="none"`, `stroke={color}`, `strokeWidth=0.6`, `strokeLinejoin/cap="round"`
- Badge: same 8×8px circle spec as PearIcon
- Used in: Training tab header (left, size 32); client home Training tile watermark (size 120, no badge)
