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
      colorA: Color(hex: d?.string(forKey: "colorA") ?? "#59d92d"),
      colorB: Color(hex: d?.string(forKey: "colorB") ?? "#4a22b8"),
      tag: d?.string(forKey: "tag") ?? "COSPRAY",
      refillAtA: Date(timeIntervalSince1970: d?.object(forKey: "refillAtA") as? Double ?? 0),
      refillAtB: Date(timeIntervalSince1970: d?.object(forKey: "refillAtB") as? Double ?? 0),
      streak: d?.object(forKey: "streak") as? Int ?? 0,
      nameA: d?.string(forKey: "nameA") ?? "Neon green", nameB: d?.string(forKey: "nameB") ?? "Dark purple",
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

/// A row for one hotspot: heat chip, name, distance + bearing.
struct SpotRow: View {
  let s: HeatSpot
  var body: some View {
    HStack(spacing: 8) {
      Notched(n: 2).fill(heatColor(s.w)).frame(width: 10, height: 10).overlay(Notched(n: 2).stroke(T.ink, lineWidth: 1.5))
      Text(s.n).font(.system(size: 11, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
      Spacer(minLength: 4)
      Image(systemName: "location.north.fill").font(.system(size: 8, weight: .bold)).rotationEffect(.degrees(Double(s.b))).foregroundStyle(T.dim)
      Text(s.d < 1000 ? "\(s.d) m" : String(format: "%.1f km", Double(s.d) / 1000)).font(.system(size: 10, weight: .bold)).foregroundStyle(T.dim).monospacedDigit()
      Caps(text: heatLabel(s.w), color: heatColor(s.w), size: 7)
    }
  }
}

/// Header strip shared by the home-screen families: wordmark, tag, streak.
struct HeaderStrip: View {
  let entry: CanEntry
  var body: some View {
    HStack(spacing: 6) {
      Caps(text: "COSPRAY", size: 10)
      Text(entry.tag).font(.system(size: 9, weight: .bold)).foregroundStyle(T.dim).lineLimit(1)
      Spacer()
      Caps(text: "\(entry.streak) DAY STREAK", color: T.dim, size: 8)
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
  var top: [HeatSpot] { Array((entry.heat?.spots ?? []).sorted { $0.d < $1.d }.prefix(3)) }

  var body: some View {
    Group {
      switch family {
      case .systemMedium: medium
      case .systemLarge: large
      case .accessoryRectangular: lockRect
      case .accessoryCircular: lockCircle
      case .accessoryInline: Text("🎨 \(Int(entry.paintA))% · \(Int(entry.paintB))% · 🔥\(entry.streak)")
      default: small
      }
    }
    .containerBackground(for: .widget) { Bands() }
  }

  /// Small: the radar edge to edge, the nearest spot on a plate at the bottom.
  var small: some View {
    ZStack(alignment: .bottom) {
      RadarView(heat: entry.heat, density: 22, showScale: false)
      VStack(alignment: .leading, spacing: 2) {
        if let n = nearest {
          HStack(spacing: 4) {
            Notched(n: 2).fill(heatColor(n.w)).frame(width: 8, height: 8)
            Text(n.n).font(.system(size: 11, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
          }
          HStack(spacing: 4) {
            Image(systemName: "location.north.fill").font(.system(size: 8, weight: .bold)).rotationEffect(.degrees(Double(n.b))).foregroundStyle(heatColor(n.w))
            Text("\(n.d) m \(compass(n.b))").font(.system(size: 10, weight: .bold)).foregroundStyle(T.dim).monospacedDigit()
            Spacer()
            Caps(text: heatLabel(n.w), color: heatColor(n.w), size: 7)
          }
        } else {
          Caps(text: "COSPRAY", size: 9)
          Text("no pieces nearby yet").font(.system(size: 10, weight: .semibold)).foregroundStyle(T.dim)
        }
      }
      .padding(8).frame(maxWidth: .infinity, alignment: .leading)
      .background(Notched(n: 3).fill(T.ink.opacity(0.92)))
      .padding(6)
    }
    .padding(-4) // let the radar bleed to the container edge
  }

  /// Medium: radar hero on the left, can status on the right.
  var medium: some View {
    HStack(spacing: 10) {
      RadarView(heat: entry.heat, density: 24).aspectRatio(1, contentMode: .fit)
      VStack(alignment: .leading, spacing: 6) {
        HeaderStrip(entry: entry)
        Gauge(value: entry.paintA, color: entry.colorA, label: entry.nameA.uppercased(), refillAt: entry.refillAtA)
        Gauge(value: entry.paintB, color: entry.colorB, label: entry.nameB.uppercased(), refillAt: entry.refillAtB)
        Spacer(minLength: 0)
        if let n = nearest { SpotRow(s: n) } else { Caps(text: status, color: T.dim, size: 8) }
      }
    }
  }

  /// Large: a wide radar across the top, then cans and the closest three spots.
  var large: some View {
    VStack(alignment: .leading, spacing: 10) {
      HeaderStrip(entry: entry)
      RadarView(heat: entry.heat, density: 30).frame(height: 168)
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          Gauge(value: entry.paintA, color: entry.colorA, label: entry.nameA.uppercased(), refillAt: entry.refillAtA)
          Gauge(value: entry.paintB, color: entry.colorB, label: entry.nameB.uppercased(), refillAt: entry.refillAtB)
        }
        VStack(alignment: .leading, spacing: 2) {
          Caps(text: "CAN", color: T.dim, size: 8)
          SegBar(value: entry.shake, color: entry.shake < 12 ? T.purpleHi : T.green, segs: 8, height: 7)
          Text(status.uppercased()).font(.system(size: 8, weight: .heavy)).tracking(0.5).foregroundStyle(T.dim).lineLimit(1)
        }.frame(width: 96)
      }
      VStack(alignment: .leading, spacing: 5) {
        Caps(text: "NEAREST PIECES", size: 8)
        if top.isEmpty { Text("nothing painted near you yet — go first").font(.system(size: 10, weight: .semibold)).foregroundStyle(T.dim) }
        ForEach(top) { SpotRow(s: $0) }
      }
      Spacer(minLength: 0)
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
      .description("Painting activity near you as a pixel radar, the nearest pieces, your cans and streak.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}
