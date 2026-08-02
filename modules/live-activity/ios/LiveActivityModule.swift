import ActivityKit
import ExpoModulesCore

// ─── Shared attributes ────────────────────────────────────────────────────────
// ⚠️ DUPLICATED BY DESIGN: the same struct lives in `targets/widgets/index.swift`
// (the widget that renders the activity). ActivityKit matches app ↔ widget by the
// type's NAME and Codable shape, so any change must be mirrored there.
// (@available gate: the APP target deploys to iOS 15.1; ActivityKit is 16.1+.)
@available(iOS 16.2, *)
struct WorkoutActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var sessionStartedAt: Date
    var restEndsAt: Date?
    var restPaused: Bool
    var restPausedRemaining: Int
    var exercisesDone: Int
    var exercisesTotal: Int
    var currentExercise: String?
    var nextExercise: String?
  }
  var workoutName: String
}

/**
 * Starts / updates / ends the ONE workout Live Activity. The widget's clocks tick
 * natively (`Text(date, style: .timer)`), so the app only pushes an update when
 * something actually changes: session start, rest start/pause/resume/stop,
 * exercise progress, end.
 *
 * JS side: `lib/liveActivity.ts` (uses `requireOptionalNativeModule`, so builds
 * without this module — Expo Go — no-op instead of crashing).
 */
public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // A user can CLEAR the card from the lock screen, which ENDS the activity —
    // the app checks this on foreground and re-creates it for a running session.
    Function("hasActiveActivity") { () -> Bool in
      if #available(iOS 16.2, *) {
        return !Activity<WorkoutActivityAttributes>.activities.isEmpty
      }
      return false
    }

    // Ends any stale activity first — there is only ever ONE workout at a time,
    // and a re-entered/resumed session simply starts a fresh activity with the
    // original startedAt (self-healing after force-quit leftovers).
    AsyncFunction("startActivity") { (workoutName: String, sessionStartedAtMs: Double) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<WorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      let attributes = WorkoutActivityAttributes(workoutName: workoutName)
      let state = WorkoutActivityAttributes.ContentState(
        sessionStartedAt: Date(timeIntervalSince1970: sessionStartedAtMs / 1000),
        restEndsAt: nil,
        restPaused: false,
        restPausedRemaining: 0,
        exercisesDone: 0,
        exercisesTotal: 0,
        currentExercise: nil,
        nextExercise: nil
      )
      _ = try? Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil))
    }

    // Rest state sync. restEndsAtMs nil + restPaused false = no rest running.
    // staleDate is still set to the rest end, but ⚠️ it is NOT what flips the
    // clock red — iOS marks content stale without repainting (known limitation,
    // Apple forums 740406/759250). The widget instead checks `endsAt < now` at
    // every REPAINT, and the app forces a repaint at rest-end while alive.
    AsyncFunction("updateRest") { (restEndsAtMs: Double?, restPaused: Bool, restPausedRemaining: Int) in
      guard #available(iOS 16.2, *) else { return }
      let restEndsAt = restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) }
      for activity in Activity<WorkoutActivityAttributes>.activities {
        var state = activity.content.state
        state.restEndsAt = restEndsAt
        state.restPaused = restPaused
        state.restPausedRemaining = restPausedRemaining
        await activity.update(ActivityContent(state: state, staleDate: restEndsAt))
      }
    }

    // Workout progress: the count beside the name + the NOW/NEXT lines.
    AsyncFunction("updateProgress") { (done: Int, total: Int, current: String?, next: String?) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<WorkoutActivityAttributes>.activities {
        var state = activity.content.state
        state.exercisesDone = done
        state.exercisesTotal = total
        state.currentExercise = current
        state.nextExercise = next
        await activity.update(ActivityContent(state: state, staleDate: state.restEndsAt))
      }
    }

    AsyncFunction("endActivity") {
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<WorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
