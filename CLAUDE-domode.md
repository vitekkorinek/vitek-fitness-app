# CLAUDE-domode.md — Do Mode & Exercise Detail

Companion to CLAUDE.md — **read CLAUDE.md first**. Read this file before any work on the Do Mode screens (`app/(client)/workout/[workoutId].tsx`, `app/(trainer)/client/[id]/workout/[workoutId].tsx`) or the Exercise Detail screen. (Extracted from CLAUDE.md §5 + §7 — section numbers preserved.)

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
