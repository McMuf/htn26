import WidgetKit
import SwiftUI

// The app writes these keys into the shared App Group UserDefaults (see src/lib/widget.ts):
//   paintA, paintB (0-100), shake (0-100), colorA, colorB (hex), tag (string), updatedAt (unix seconds),
//   refillAtA, refillAtB (unix seconds when that can is full again), streak (days)
let appGroup = "group.com.hamzakhan.tagged"

struct CanEntry: TimelineEntry {
  let date: Date
  let paintA: Double
  let paintB: Double
  let shake: Double
  let colorA: Color
  let colorB: Color
  let tag: String
  let refillAtA: Date
  let refillAtB: Date
  let streak: Int

  static func load() -> CanEntry {
    let d = UserDefaults(suiteName: appGroup)
    let a = d?.object(forKey: "paintA") as? Double ?? 100
    let b = d?.object(forKey: "paintB") as? Double ?? 100
    let s = d?.object(forKey: "shake") as? Double ?? 100
    return CanEntry(
      date: Date(), paintA: a, paintB: b, shake: s,
      colorA: Color(hex: d?.string(forKey: "colorA") ?? "#ff2d95"),
      colorB: Color(hex: d?.string(forKey: "colorB") ?? "#19e6ff"),
      tag: d?.string(forKey: "tag") ?? "FRESCO",
      refillAtA: Date(timeIntervalSince1970: d?.object(forKey: "refillAtA") as? Double ?? 0),
      refillAtB: Date(timeIntervalSince1970: d?.object(forKey: "refillAtB") as? Double ?? 0),
      streak: d?.object(forKey: "streak") as? Int ?? 0)
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

struct Gauge: View {
  let value: Double
  let color: Color
  let label: String
  let refillAt: Date
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack {
        Text(label).font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
        Spacer()
        if value >= 99.5 || refillAt <= Date() {
          Text("full").font(.system(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.7))
        } else {
          (Text("full in ") + Text(refillAt, style: .timer)).font(.system(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.7)).monospacedDigit()
        }
      }
      GeometryReader { g in
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.12))
          RoundedRectangle(cornerRadius: 5).fill(color).frame(width: max(4, g.size.width * value / 100))
        }
      }.frame(height: 9)
    }
  }
}

struct PaintCanView: View {
  var entry: CanEntry
  @Environment(\.widgetFamily) var family

  var status: String {
    entry.shake < 12 ? "shake the can" : (min(entry.paintA, entry.paintB) < 18 ? "running low…" : "ready to spray")
  }

  var body: some View {
    Group {
      if family == .systemMedium {
        HStack(spacing: 14) {
          VStack(alignment: .leading, spacing: 8) {
            HStack {
              Text("FRESCO").font(.system(size: 11, weight: .black)).tracking(2).foregroundStyle(.white)
              Spacer()
              Text(entry.tag).font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            }
            Gauge(value: entry.paintA, color: entry.colorA, label: "VOL+ · A", refillAt: entry.refillAtA)
            Gauge(value: entry.paintB, color: entry.colorB, label: "VOL− · B", refillAt: entry.refillAtB)
            Text(status).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
          }
          VStack(spacing: 6) {
            Text("🔥").font(.system(size: 22))
            Text("\(entry.streak)").font(.system(size: 26, weight: .black)).foregroundStyle(.white)
            Text(entry.streak == 1 ? "day streak" : "day streak").font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.7))
            CanBar(value: entry.shake, color: entry.shake < 12 ? Color(hex: "#ff5c1a") : Color(hex: "#7cff3a"), label: "CAN").frame(width: 34)
          }
          .frame(width: 72)
          .padding(8)
          .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.08)))
        }
      } else {
        VStack(alignment: .leading, spacing: 6) {
          HStack {
            Text("FRESCO").font(.system(size: 11, weight: .black)).tracking(2).foregroundStyle(.white)
            Spacer()
            Text("🔥\(entry.streak)").font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.8))
          }
          HStack(spacing: 10) {
            CanBar(value: entry.paintA, color: entry.colorA, label: "VOL+")
            CanBar(value: entry.paintB, color: entry.colorB, label: "VOL−")
            CanBar(value: entry.shake, color: entry.shake < 12 ? Color(hex: "#ff5c1a") : Color(hex: "#7cff3a"), label: "CAN")
          }
          Text(status).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
        }
      }
    }
    .padding(2)
    .containerBackground(Color(hex: "#0b0b0f"), for: .widget)
  }
}

struct PaintCanWidget: Widget {
  let kind = "widget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CanProvider()) { entry in PaintCanView(entry: entry) }
      .configurationDisplayName("Fresco can")
      .description("Paint left, refill countdown and your streak.")
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
