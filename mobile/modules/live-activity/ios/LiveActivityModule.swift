import ExpoModulesCore
import ActivityKit

struct AttrsRecord: Record {
  @Field var tag: String = "COSPRAY"
  @Field var colorA: String = "#ff2d95"
  @Field var nameA: String = "Hot pink"
  @Field var colorB: String = "#19e6ff"
  @Field var nameB: String = "Cyan"
}

struct StateRecord: Record {
  @Field var paintA: Double = 100
  @Field var paintB: Double = 100
  @Field var sprayingSide: String = "none"
  @Field var startedAt: Double = 0 // unix ms from JS
  @Field var strokes: Int = 0
  func toState() -> CosprayPaintAttributes.ContentState {
    .init(paintA: paintA, paintB: paintB, sprayingSide: sprayingSide, startedAt: Date(timeIntervalSince1970: startedAt / 1000), strokes: strokes)
  }
}

/// The painting session as a Live Activity. One activity at a time; stale ones (from a killed app) are
/// ended before a new request. All calls are fire-and-forget from JS (src/lib/liveActivity.ts).
public class LiveActivityModule: Module {
  private var current: Activity<CosprayPaintAttributes>?

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Constants(["hasLiveActivity": true])

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }
    Function("isActive") { () -> Bool in
      if #available(iOS 16.2, *) { return self.current?.activityState == .active }
      return false
    }

    AsyncFunction("start") { (attrs: AttrsRecord, state: StateRecord, promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.reject("E_UNSUPPORTED", "iOS 16.2+"); return }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { promise.reject("E_DISABLED", "Live Activities are off in Settings"); return }
      Task {
        for a in Activity<CosprayPaintAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
        do {
          let a = try Activity.request(
            attributes: CosprayPaintAttributes(tag: attrs.tag, colorA: attrs.colorA, nameA: attrs.nameA, colorB: attrs.colorB, nameB: attrs.nameB),
            content: ActivityContent(state: state.toState(), staleDate: Date().addingTimeInterval(120)),
            pushType: nil)
          self.current = a
          promise.resolve(a.id)
        } catch { promise.reject("E_START", error.localizedDescription) }
      }
    }

    AsyncFunction("update") { (state: StateRecord, promise: Promise) in
      guard #available(iOS 16.2, *), let a = self.current else { promise.resolve(false); return }
      Task { await a.update(ActivityContent(state: state.toState(), staleDate: Date().addingTimeInterval(120))); promise.resolve(true) }
    }

    AsyncFunction("end") { (state: StateRecord?, afterSeconds: Double?, promise: Promise) in
      guard #available(iOS 16.2, *), let a = self.current else { promise.resolve(false); return }
      self.current = nil
      Task {
        let final = state.map { ActivityContent(state: $0.toState(), staleDate: nil) }
        let policy: ActivityUIDismissalPolicy = afterSeconds.map { .after(Date().addingTimeInterval($0)) } ?? .default
        await a.end(final, dismissalPolicy: policy)
        promise.resolve(true)
      }
    }

    AsyncFunction("endAll") { (promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(false); return }
      Task {
        for a in Activity<CosprayPaintAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
        self.current = nil
        promise.resolve(true)
      }
    }
  }
}
