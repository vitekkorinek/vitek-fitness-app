import ActivityKit
import SwiftUI
import WidgetKit

// ─── Shared attributes ────────────────────────────────────────────────────────
// ⚠️ DUPLICATED BY DESIGN: the same struct lives in
// `modules/live-activity/ios/LiveActivityModule.swift` (the app side that starts
// the activity). ActivityKit matches app ↔ widget by the type's NAME and Codable
// shape, so any change here must be mirrored there byte-for-byte.
struct WorkoutActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// The session clock counts UP from here — ticked natively by SwiftUI.
    var sessionStartedAt: Date
    /// Rest countdown target. nil = no rest running (and not paused).
    var restEndsAt: Date?
    /// Paused rest: the display freezes on `restPausedRemaining` seconds
    /// (negative = frozen in overtime).
    var restPaused: Bool
    var restPausedRemaining: Int
    var exercisesDone: Int
    var exercisesTotal: Int
    var currentExercise: String?
    var nextExercise: String?
  }
  var workoutName: String
}

// Brand colors — ACCENT #24ac88 (island, black ground), bright accent #3ddba9
// (lock card, dark-green ground), overtime red, card gradient stops (the
// workout-cover "green depth" family).
private let accent = Color(red: 0x24 / 255, green: 0xAC / 255, blue: 0x88 / 255)
private let accentBright = Color(red: 0x3D / 255, green: 0xDB / 255, blue: 0xA9 / 255)
private let accentSoft = Color(red: 0x5F / 255, green: 0xD6 / 255, blue: 0xB3 / 255)
private let restOverRed = Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x64 / 255)
private let gradTop = Color(red: 0x2C / 255, green: 0x57 / 255, blue: 0x4A / 255)
private let gradMid = Color(red: 0x1F / 255, green: 0x40 / 255, blue: 0x38 / 255)
private let gradBottom = Color(red: 0x15 / 255, green: 0x2E / 255, blue: 0x27 / 255)

private func fmtFrozen(_ secs: Int) -> String {
  let s = abs(secs)
  let text = String(format: "%d:%02d", s / 60, s % 60)
  return secs < 0 ? "-\(text)" : text
}

/// True while a rest is running or paused.
private func isResting(_ state: WorkoutActivityAttributes.ContentState) -> Bool {
  state.restPaused || state.restEndsAt != nil
}

/// OVERTIME — evaluated at REPAINT time (⚠️ deliberately NOT `context.isStale`:
/// iOS marks content stale at `staleDate` without repainting the widget — known
/// limitation, Apple forums 740406/759250 — so the red never appeared on
/// device). Any repaint after the rest expires shows red + minus; the app
/// forces one at rest-end while alive and on foreground.
private func isRestOver(_ state: WorkoutActivityAttributes.ContentState) -> Bool {
  if state.restPaused { return state.restPausedRemaining < 0 }
  if let ends = state.restEndsAt { return ends <= Date() }
  return false
}

/// ⚠️ Sizing a ticking clock: `Text(style: .timer)` is GREEDY — it fills any
/// width it is offered (so it never re-layouts), its "ideal" width is unusable
/// (`.fixedSize` made the layout blow past the card and the WHOLE card rendered
/// EMPTY — build 37 on device), and a fixed frame leaves a gap to the icon.
/// The reliable pattern: a HIDDEN static template ("8:88", monospaced digits)
/// sizes the box to the clock's current digit count, and the live timer is
/// painted in its overlay — offered exactly the template's width. A stale
/// template (crossing 9:59→10:00 between repaints) briefly scales the digits
/// down instead of overflowing; the next repaint recomputes it.
@ViewBuilder
private func sizedSessionClock(_ startedAt: Date) -> some View {
  let elapsed = Date().timeIntervalSince(startedAt)
  Text(elapsed < 600 ? "8:88" : elapsed < 3600 ? "88:88" : "8:88:88")
    .hidden()
    .overlay {
      Text(startedAt, style: .timer)
        .multilineTextAlignment(.trailing)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}

/// The rest clock: live countdown (keeps counting up past zero — free overtime),
/// with a static "-" prefix once a repaint lands in overtime; frozen value while
/// paused. Sized via the same hidden-template trick. Color applied by the caller.
@ViewBuilder
private func restClock(_ state: WorkoutActivityAttributes.ContentState) -> some View {
  if state.restPaused {
    Text(fmtFrozen(state.restPausedRemaining))
  } else if let ends = state.restEndsAt {
    HStack(spacing: 0) {
      if ends <= Date() { Text("-") }
      Text(abs(ends.timeIntervalSinceNow) < 600 ? "8:88" : "88:88")
        .hidden()
        .overlay {
          Text(ends, style: .timer)
            .multilineTextAlignment(.leading)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
    }
  }
}

// ─── Widget bundle ────────────────────────────────────────────────────────────

@main
struct ExportedWidgets: WidgetBundle {
  var body: some Widget {
    WorkoutLiveActivity()
  }
}

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      // ── Lock screen / banner ──
      LockScreenView(context: context)
        .activityBackgroundTint(gradMid)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        // ── Expanded (long-press) — same sides as compact: REST left, SESSION right ──
        DynamicIslandExpandedRegion(.leading) {
          if isResting(context.state) {
            VStack(alignment: .leading, spacing: 2) {
              Text(context.state.restPaused ? "REST · PAUSED" : "REST")
                .font(.caption2.weight(.bold))
                .foregroundColor(isRestOver(context.state) ? restOverRed : accent.opacity(0.8))
              HStack(spacing: 4) {
                Image(systemName: "hourglass")
                  .font(.footnote.weight(.semibold))
                  .foregroundColor(isRestOver(context.state) ? restOverRed : accent)
                restClock(context.state)
                  .font(.title3.weight(.bold))
                  .monospacedDigit()
                  .foregroundColor(isRestOver(context.state) ? restOverRed : .white)
              }
            }
            .padding(.leading, 4)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text("SESSION")
              .font(.caption2.weight(.bold))
              .foregroundColor(.white.opacity(0.55))
            HStack(spacing: 4) {
              Image(systemName: "timer")
                .font(.footnote.weight(.semibold))
                .foregroundColor(accent)
              sizedSessionClock(context.state.sessionStartedAt)
                .font(.title3.weight(.bold))
                .monospacedDigit()
                .foregroundColor(accent)
            }
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 1) {
            Text(context.attributes.workoutName)
              .font(.footnote.weight(.semibold))
              .foregroundColor(.white.opacity(0.85))
              .lineLimit(1)
            if context.state.exercisesTotal > 0 {
              Text("\(context.state.exercisesDone)/\(context.state.exercisesTotal)")
                .font(.caption2.weight(.semibold))
                .monospacedDigit()
                .foregroundColor(accent)
            }
          }
        }
      } compactLeading: {
        // The session clock NEVER moves or recolors — right slot, green, always.
        // The rest joins LEFT with the hourglass (the in-app header chip sides).
        if isResting(context.state) {
          HStack(spacing: 3) {
            Image(systemName: "hourglass")
              .font(.caption2)
              .foregroundColor(isRestOver(context.state) ? restOverRed : accent)
            restClock(context.state)
              .font(.caption.weight(.bold))
              .monospacedDigit()
              .foregroundColor(isRestOver(context.state) ? restOverRed : .white)
              .frame(maxWidth: 44)
              .minimumScaleFactor(0.7)
          }
        } else {
          Image(systemName: "timer")
            .foregroundColor(accent)
        }
      } compactTrailing: {
        HStack(spacing: 3) {
          if isResting(context.state) {
            Image(systemName: "timer")
              .font(.caption2)
              .foregroundColor(accent)
          }
          Text(context.state.sessionStartedAt, style: .timer)
            .font(.caption.weight(.bold))
            .monospacedDigit()
            .foregroundColor(accent)
            .frame(maxWidth: 46)
            .minimumScaleFactor(0.7)
        }
      } minimal: {
        if isResting(context.state) {
          Image(systemName: "hourglass")
            .foregroundColor(isRestOver(context.state) ? restOverRed : accent)
        } else {
          Image(systemName: "timer")
            .foregroundColor(accent)
        }
      }
      .keylineTint(accent)
    }
  }
}

// ─── Lock screen card ─────────────────────────────────────────────────────────
// Vitek's final layout (Aug 2026, mockup-approved): name + count top-LEFT, the
// VF logo alone top-RIGHT (no "Vitek Fitness" text), NOW/NEXT lines, and the
// clocks row with REST ALWAYS visible — dimmed 0:00 when idle, lit while
// running, red + minus in overtime. The card never changes shape.

struct LockScreenView: View {
  let context: ActivityViewContext<WorkoutActivityAttributes>

  var body: some View {
    let state = context.state
    let resting = isResting(state)
    let over = isRestOver(state)
    let dim = Color.white.opacity(0.35)

    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(context.attributes.workoutName)
            .font(.subheadline.weight(.bold))
            .foregroundColor(.white)
            .lineLimit(1)
          if state.exercisesTotal > 0 {
            Text("\(state.exercisesDone)/\(state.exercisesTotal)")
              .font(.footnote.weight(.semibold))
              .monospacedDigit()
              .foregroundColor(accentBright)
          }
        }
        Spacer(minLength: 8)
        // The bare white VF mark (Assets.xcassets/Logo — rasterized from
        // components/VFIcon.tsx's SVG), same as the app's dark headers.
        Image("Logo")
          .resizable()
          .scaledToFit()
          .frame(width: 26, height: 23)
      }
      .padding(.bottom, 7)

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("NOW")
          .font(.caption2.weight(.bold))
          .foregroundColor(accentSoft)
          .frame(width: 34, alignment: .leading)
        Text(state.currentExercise ?? "—")
          .font(.caption)
          .foregroundColor(.white)
          .lineLimit(1)
      }
      .padding(.bottom, 2)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("NEXT")
          .font(.caption2.weight(.bold))
          .foregroundColor(.white.opacity(0.45))
          .frame(width: 34, alignment: .leading)
        Text(state.nextExercise ?? "—")
          .font(.caption)
          .foregroundColor(.white.opacity(0.6))
          .lineLimit(1)
      }
      .padding(.bottom, 12)

      // ⚠️ `Text(style: .timer)` is GREEDY — it takes all offered width so it
      // never re-layouts while ticking, which shoved the timer glyph away from
      // the session digits (device, build 36). `.fixedSize(horizontal:)` pins
      // each clock to its content width so the icons hug the digits.
      HStack(alignment: .bottom) {
        VStack(alignment: .leading, spacing: 2) {
          Text(state.restPaused ? "REST · PAUSED" : "REST")
            .font(.caption2.weight(.bold))
            .foregroundColor(over ? restOverRed : (resting ? accentSoft : dim))
          HStack(spacing: 5) {
            Image(systemName: "hourglass")
              .font(.subheadline.weight(.semibold))
              .foregroundColor(over ? restOverRed : (resting ? accentBright : dim))
            if resting {
              restClock(state)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .foregroundColor(over ? restOverRed : .white)
            } else {
              Text("0:00")
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .foregroundColor(dim)
            }
          }
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text("SESSION")
            .font(.caption2.weight(.bold))
            .foregroundColor(.white.opacity(0.5))
          HStack(spacing: 5) {
            Image(systemName: "timer")
              .font(.subheadline.weight(.semibold))
              .foregroundColor(accentBright)
            sizedSessionClock(state.sessionStartedAt)
              .font(.title2.weight(.bold))
              .monospacedDigit()
              .foregroundColor(accentBright)
          }
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      LinearGradient(
        stops: [
          .init(color: gradTop, location: 0),
          .init(color: gradMid, location: 0.55),
          .init(color: gradBottom, location: 1),
        ],
        startPoint: .top,
        endPoint: .bottom
      )
    )
  }
}
