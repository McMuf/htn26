import ActivityKit
import Foundation

/// MUST stay byte-identical to modules/live-activity/ios/CosprayPaintAttributes.swift (scripts/check-live-activity-attrs.sh).
/// ActivityKit matches the app's request to the extension's ActivityConfiguration by this type's name and Codable shape.
struct CosprayPaintAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var paintA: Double        // 0..100
    var paintB: Double
    var sprayingSide: String  // "A" | "B" | "none"
    var startedAt: Date       // session start, for Text(timerInterval:)
    var strokes: Int          // strokes this session
  }
  var tag: String
  var colorA: String
  var nameA: String
  var colorB: String
  var nameB: String
}
