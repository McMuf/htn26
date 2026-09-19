import WidgetKit
import SwiftUI

// The app writes these keys into the shared App Group UserDefaults (see src/lib/widget.ts):
//   paintA, paintB (0-100), shake (0-100), colorA, colorB (hex), tag (string), updatedAt (unix seconds)
let appGroup = "group.com.hamzakhan.tagged"

struct CanEntry: TimelineEntry {
  let date: Date
  let paintA: Double
  let paintB: Double
  let shake: Double
  let colorA: Color
  let colorB: Color
  let tag: String

  static func load() -> CanEntry {
    let d = UserDefaults(suiteName: appGroup)
    let a = d?.object(forKey: "paintA") as? Double ?? 100
    let b = d?.object(forKey: "paintB") as? Double ?? 100
    let s = d?.object(forKey: "shake") as? Double ?? 100
    return CanEntry(
      date: Date(), paintA: a, paintB: b, shake: s,
      colorA: Color(hex: d?.string(forKey: "colorA") ?? "#ff2d95"),
      colorB: Color(hex: d?.string(forKey: "colorB") ?? "#19e6ff"),
      tag: d?.string(forKey: "tag") ?? "TAGGED")
  }
}

struct CanProvider: TimelineProvider {
  func placeholder(in context: Context) -> CanEntry { CanEntry.load() }
  func getSnapshot(in context: Context, completion: @escaping (CanEntry) -> Void) { completion(CanEntry.load()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<CanEntry>) -> Void) {
    // Paint regenerates ~2.2/s in the app; the app pushes fresh values whenever they change, and we
    // also refresh every 15 minutes so a closed app still shows a filling can.
    let entry = CanEntry.load()
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct CanBar: View {
  let value: Double
  let color: Color
  let label: String
  var body: some View {
    VStack(spacing: 4) {
      GeometryReader { g in
        ZStack(alignment: .bottom) {
          RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.12))
          RoundedRectangle(cornerRadius: 8).fill(color).frame(height: max(4, g.size.height * value / 100))
        }
      }
      Text(label).font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
      Text("\(Int(value))%").font(.system(size: 9)).foregroundStyle(.white.opacity(0.7))
    }
  }
}

struct PaintCanView: View {
  var entry: CanEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("TAGGED").font(.system(size: 11, weight: .black)).tracking(2).foregroundStyle(.white)
        Spacer()
        Text(entry.tag).font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
      }
      HStack(spacing: 10) {
        CanBar(value: entry.paintA, color: entry.colorA, label: "VOL+")
        CanBar(value: entry.paintB, color: entry.colorB, label: "VOL−")
        CanBar(value: entry.shake, color: entry.shake < 12 ? Color(hex: "#ff5c1a") : Color(hex: "#7cff3a"), label: "CAN")
      }
      Text(entry.shake < 12 ? "shake the can" : (min(entry.paintA, entry.paintB) < 18 ? "running low…" : "ready to spray"))
        .font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
    }
    .padding(2)
    .containerBackground(Color(hex: "#0b0b0f"), for: .widget)
  }
}

struct PaintCanWidget: Widget {
  let kind = "widget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CanProvider()) { entry in PaintCanView(entry: entry) }
      .configurationDisplayName("Paint can")
      .description("How much paint is left in your cans.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}

extension Color {
  init(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    var n: UInt64 = 0
    Scanner(string: s).scanHexInt64(&n)
    let r = Double((n >> 16) & 0xff) / 255, g = Double((n >> 8) & 0xff) / 255, b = Double(n & 0xff) / 255
    self.init(red: r, green: g, blue: b)
  }
}
