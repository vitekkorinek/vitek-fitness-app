# CLAUDE-schedule.md — Schedule, Availability & Plan Week

Companion to CLAUDE.md — **read CLAUDE.md first**. Read before working on the trainer Schedule tab (`app/(trainer)/(tabs)/schedule.tsx`), the client Availability screen (`app/(client)/availability.tsx`), or the Plan Week screen (`app/(trainer)/plan-week.tsx`). (Extracted from CLAUDE.md §9 + §10b + §10c — section numbers preserved.)

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
- When confirming (`newConfirmed = true`): the app only updates `appointments.is_confirmed` — **the client's tray row (`{type:'appointment_confirmed', …}`) is written by the DB trigger `appointment_sent_notify`** (Aug 3 2026, on `is_confirmed` false→true AND `sent_to_client=true`). ⚠️ **Never insert `client_notifications` from the app** — the phone-side write was fire-and-forget and one dropped request lost the notification silently (happened live Aug 2).
- When un-confirming: DB update only, no notification (the trigger only fires on the false→true transition).
- **New appointment creation** (`NewAppointmentSheet.save()`, non-block, non-edit): generates `newId = makeUUID()` and inserts the appointment with that ID. **The `client_notifications` tray row (`{type:'appointment_planned', body:'Your [type] on YYYY-MM-DD at HH:MM has been scheduled.', …}`) comes from the DB trigger `appointment_sent_notify`** — fires when a row is inserted with `sent_to_client=true` or a draft flips false→true, from EVERY path (sheet, view-sheet Send, Plan Week send/send-all). Editing/moving an already-sent appointment stays silent. ⚠️ The body keeps the raw `YYYY-MM-DD` date — `NotificationOverlay.handleView` deep-links by regexing it.
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
- **Save buttons (July 2026):** a **new** PT/Nutrition appointment shows **"Save & send"** (`save(true)` → inserts `sent_to_client:true`; the DB trigger writes the tray row) **and "Save as draft"** (`save(false)` → `sent_to_client:false`, no notification). **Block type and editing keep a single "Save."** Same two-button pattern in the Planning sheet.
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

- **Crash draft (July 30 2026)** — ticked slots live only in state until Save, so `lib/formDraft` mirrors them to disk while `editing && isDirty`, keyed **per week** (`availability:<userId>:<weekStart>`) so one week's ticks can never reappear on another. Restored **after** the week's saved slots have loaded (the draft sits on top of them) and with `editing: true`, while **`baselineRef` stays the SAVED week** — that is what keeps `isDirty` honest and Cancel reverting to what the trainer actually has. Cleared by Cancel, and **explicitly inside `doSave`**, which leaves via `smartBack` and so never gets a render for the effect to notice.
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
- **Draft appointments + send flow:** appointments created on Planning default to **drafts** (`sent_to_client: false` — the DB trigger stays silent until the flag flips) — a draft the client can't see. **The `NewAppointmentSheet` (header "+", empty-cell tap, who's-free "Book") offers TWO buttons for appointment types: "Save & send" (`save(true)` → `sent_to_client:true`; tray row via DB trigger) and "Save as draft" (`save(false)`)**; Block type keeps a single "Save". Suggestions "Apply all" always creates drafts. Draft cards render **dashed + dimmed** (`{ borderWidth:1, borderStyle:'dashed', borderColor: color, opacity:0.6 }`; day view appends " · Unsent" via the `draft` prop on `DayApptCard`). Tapping any appointment (week-grid cards are now `TouchableOpacity`; `DayApptCard.onTap`) opens `apptAction` (`aa` styles): draft → amber "Not sent yet" note + **Send to client** (`sendAppt`) + **Delete** (`deleteDraftAppt`, drafts only); sent → "Sent to client ✓". Bottom bar (`s.bottomRow`): when idle **Suggest schedule** + **Send all (N)** (`sendAllDrafts`, `s.sendAllBtnDim` + `disabled` when `draftCount === 0`); **when suggestions are showing → Discard (`setSuggestions([])`) + Apply all (N)** so there's always a way out. `draftCount` = unsent appts with a `client_id`; guest drafts can only be deleted. **Client side** filters `sent_to_client = true` in all appointment queries (`app/(client)/index.tsx`, `past-sessions.tsx`, `(tabs)/schedule.tsx`); the **`count-completed-sessions` edge function** also filters it so a draft never auto-completes / charges a package. (The trainer Schedule tab still shows drafts as normal cards — not dashed there.)

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
