import WidgetKit
import SwiftUI

// The app writes these keys into the shared App Group UserDefaults (see src/lib/widget.ts):
//   paintA, paintB (0-100), shake (0-100), colorA, colorB (hex), tag (string), updatedAt (unix seconds),
//   refillAtA, refillAtB (unix seconds when that can is full again), streak (days),
//   nameA, nameB (colour names), strokes, paintUsed (all-time stats),
//   hot (JSON string: the activity-near-you payload, see RadarView.swift / src/lib/heat.ts)
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
  let nameA: String
  let nameB: String
  let strokes: Int
  let paintUsed: Int
  let heat: HeatPayload?

  static func load() -> CanEntry {
    let d = UserDefaults(suiteName: appGroup)
    let a = d?.object(forKey: "paintA") as? Double ?? 100
    let b = d?.object(forKey: "paintB") as? Double ?? 100
    let s = d?.object(forKey: "shake") as? Double ?? 100
    return CanEntry(
      date: Date(), paintA: a, paintB: b, shake: s,
      colorA: Color(hex: d?.string(forKey: "colorA") ?? "#ff2d95"),
      colorB: Color(hex: d?.string(forKey: "colorB") ?? "#19e6ff"),
      tag: d?.string(forKey: "tag") ?? "COSPRAY",
      refillAtA: Date(timeIntervalSince1970: d?.object(forKey: "refillAtA") as? Double ?? 0),
      refillAtB: Date(timeIntervalSince1970: d?.object(forKey: "refillAtB") as? Double ?? 0),
      streak: d?.object(forKey: "streak") as? Int ?? 0,
      nameA: d?.string(forKey: "nameA") ?? "Hot pink", nameB: d?.string(forKey: "nameB") ?? "Cyan",
      strokes: d?.object(forKey: "strokes") as? Int ?? 0, paintUsed: d?.object(forKey: "paintUsed") as? Int ?? 0,
      heat: HeatPayload.load(d))
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

/// Paint gauge: name, refill countdown, segmented bar (kit Gauge).
struct Gauge: View {
  let value: Double
  let color: Color
  let label: String
  let refillAt: Date
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack {
        Caps(text: label, color: .white, size: 8)
        Spacer()
        if value >= 99.5 || refillAt <= Date() {
          Text("FULL").font(.system(size: 8, weight: .bold)).foregroundStyle(T.dim)
        } else {
          (Text("full in ") + Text(refillAt, style: .timer)).font(.system(size: 8, weight: .semibold)).foregroundStyle(T.dim).monospacedDigit()
        }
      }
      SegBar(value: value, color: color, height: 7)
    }
  }
}

/// Equipped colour: a notched square swatch with a label. What the user sees first on the home screen.
struct Swatch: View {
  let color: Color
  let label: String
  let name: String
  var size: CGFloat = 22
  var body: some View {
    HStack(spacing: 5) {
      Notched(n: 2).fill(color).frame(width: size, height: size).overlay(Notched(n: 2).stroke(T.ink, lineWidth: 2))
      VStack(alignment: .leading, spacing: 0) {
        Text(label).font(.system(size: 8, weight: .heavy)).foregroundStyle(.white)
        Text(name).font(.system(size: 8, weight: .semibold)).foregroundStyle(T.dim).lineLimit(1)
      }
    }
  }
}

struct PaintCanView: View {
  var entry: CanEntry
  @Environment(\.widgetFamily) var family

  var status: String {
    entry.shake < 12 ? "shake the can" : (min(entry.paintA, entry.paintB) < 18 ? "running low…" : "ready to spray")
  }
  var nearest: HeatSpot? { entry.heat?.nearest }

  var body: some View {
    Group {
      switch family {
      case .systemMedium: medium
      case .accessoryRectangular: lockRect
      case .accessoryCircular: lockCircle
      case .accessoryInline: Text("🎨 \(Int(entry.paintA))% · \(Int(entry.paintB))% · 🔥\(entry.streak)")
      default: small
      }
    }
    .containerBackground(for: .widget) { T.bg }
  }

  /// Small: the nearest hotspot, then your two colours.
  var small: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack { Caps(text: "NEAREST"); Spacer(); Text("🔥\(entry.streak)").font(.system(size: 9, weight: .bold)).foregroundStyle(.white) }
      NearestView(spot: nearest)
      Spacer(minLength: 0)
      HStack(spacing: 8) {
        Swatch(color: entry.colorA, label: "A · \(Int(entry.paintA))%", name: entry.nameA, size: 18)
        Swatch(color: entry.colorB, label: "B · \(Int(entry.paintB))%", name: entry.nameB, size: 18)
      }
    }
  }

  /// Medium: the radar is the hero on the left; can status on the right.
  var medium: some View {
    HStack(spacing: 10) {
      RadarView(heat: entry.heat)
      VStack(alignment: .leading, spacing: 5) {
        HStack { Caps(text: "COSPRAY"); Spacer(); Text("🔥\(entry.streak)").font(.system(size: 9, weight: .bold)).foregroundStyle(.white) }
        HStack(spacing: 8) {
          Swatch(color: entry.colorA, label: "A", name: entry.nameA, size: 16)
          Swatch(color: entry.colorB, label: "B", name: entry.nameB, size: 16)
        }
        Gauge(value: entry.paintA, color: entry.colorA, label: entry.nameA.uppercased(), refillAt: entry.refillAtA)
        Gauge(value: entry.paintB, color: entry.colorB, label: entry.nameB.uppercased(), refillAt: entry.refillAtB)
        Spacer(minLength: 0)
        if let n = nearest {
          HStack(spacing: 4) {
            Image(systemName: "location.north.fill").font(.system(size: 8, weight: .bold)).rotationEffect(.degrees(Double(n.b))).foregroundStyle(heatColor(n.w))
            Text("\(n.n.uppercased()) · \(n.d) M").font(.system(size: 8, weight: .heavy)).foregroundStyle(T.dim).lineLimit(1)
          }
        } else {
          Text(status.uppercased()).font(.system(size: 8, weight: .heavy)).foregroundStyle(T.dim).lineLimit(1)
        }
      }
    }
  }

  /// Lock screen, rectangular: the nearest hotspot (monochrome-safe: the heat is in the label, not just the colour).
  var lockRect: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 4) {
        Text("COSPRAY").font(.system(size: 9, weight: .black)).tracking(1)
        Spacer()
        Text("🔥\(entry.streak)").font(.system(size: 9, weight: .bold))
      }
      if let n = nearest {
        Text(n.n).font(.system(size: 12, weight: .heavy)).lineLimit(1)
        HStack(spacing: 4) {
          Image(systemName: "location.north.fill").font(.system(size: 9, weight: .bold)).rotationEffect(.degrees(Double(n.b)))
          Text("\(n.d) m \(compass(n.b)) · \(heatLabel(n.w))").font(.system(size: 9, weight: .semibold))
        }
      } else {
        Text("A \(Int(entry.paintA))% · B \(Int(entry.paintB))%").font(.system(size: 11, weight: .heavy))
        Text(status).font(.system(size: 9)).opacity(0.8)
      }
    }
  }

  var lockCircle: some View {
    ZStack {
      AccessoryWidgetBackground()
      Circle().trim(from: 0, to: entry.paintA / 100).stroke(entry.colorA, style: StrokeStyle(lineWidth: 4, lineCap: .butt)).rotationEffect(.degrees(-90)).padding(3)
      Circle().trim(from: 0, to: entry.paintB / 100).stroke(entry.colorB, style: StrokeStyle(lineWidth: 4, lineCap: .butt)).rotationEffect(.degrees(-90)).padding(9)
      Text("\(Int(min(entry.paintA, entry.paintB)))").font(.system(size: 13, weight: .black))
    }
  }
}

struct PaintCanWidget: Widget {
  let kind = "widget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CanProvider()) { entry in PaintCanView(entry: entry) }
      .configurationDisplayName("Cospray radar")
      .description("Painting activity near you, your colours, paint left and streak.")
      .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}
