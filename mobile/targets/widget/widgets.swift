import WidgetKit
import SwiftUI
import MapKit

// The app writes these keys into the shared App Group UserDefaults (see src/lib/widget.ts):
//   paintA, paintB (0-100), shake (0-100), colorA, colorB (hex), tag (string), updatedAt (unix seconds),
//   refillAtA, refillAtB (unix seconds when that can is full again), streak (days),
//   nameA, nameB (colour names), strokes, paintUsed (all-time stats),
//   hot (JSON string: the activity-near-you payload, see RadarView.swift / src/lib/heat.ts)
let appGroup = "group.com.hamzakhan.tagged"

/// Today's numbers and quests (the `today` key, JSON from src/lib/widget.ts).
struct Quest: Decodable, Identifiable { let id: String; let title: String; let got: Int; let goal: Int; let reward: Int; let claimed: Bool }
struct TodayPayload: Decodable {
  let strokes: Int; let pieces: Int; let paint: Int; let streak: Int; let quests: [Quest]
  static func load(_ d: UserDefaults?) -> TodayPayload? {
    guard let s = d?.string(forKey: "today"), let data = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(TodayPayload.self, from: data)
  }
}

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
  let today: TodayPayload?
  var map: MapSnap? = nil

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
      heat: HeatPayload.load(d), today: TodayPayload.load(d))
  }
}

/// A street-map snapshot of the user's vicinity plus every piece projected onto it (points, in the snapshot's coordinate space).
struct MapSnap {
  struct Pt { let x: CGFloat; let y: CGFloat; let w: Double; let id: String }
  let image: UIImage
  let size: CGSize
  let pts: [Pt]
}

struct CanProvider: TimelineProvider {
  func placeholder(in context: Context) -> CanEntry { CanEntry.load() }
  func getSnapshot(in context: Context, completion: @escaping (CanEntry) -> Void) { completion(CanEntry.load()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<CanEntry>) -> Void) {
    // Paint regenerates ~2.2/s in the app; the app pushes fresh values whenever they change, and we
    // also refresh every 15 minutes so a closed app still shows a filling can.
    var entry = CanEntry.load()
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
    let size = mapSize(for: context.family, display: context.displaySize)
    snapshotMap(heat: entry.heat, size: size) { snap in
      entry.map = snap
      completion(Timeline(entries: [entry], policy: .after(next)))
    }
  }

  func mapSize(for family: WidgetFamily, display: CGSize) -> CGSize {
    switch family {
    case .systemSmall: return CGSize(width: display.width, height: display.height)
    case .systemMedium: return CGSize(width: display.height, height: display.height)
    case .systemLarge: return CGSize(width: display.width, height: 190)
    default: return .zero
    }
  }

  /// Apple's dark tiles, no labels or POIs, framed on the user at the payload's radius; the pieces are
  /// projected with the snapshot's own transform. Times out to nil, and the view falls back to the radar.
  func snapshotMap(heat: HeatPayload?, size: CGSize, done: @escaping (MapSnap?) -> Void) {
    guard let h = heat, size.width > 0 else { done(nil); return }
    let center = CLLocationCoordinate2D(latitude: h.lat, longitude: h.lng)
    let opts = MKMapSnapshotter.Options()
    let aspect = size.width / max(1, size.height)
    // tight: a few blocks around you, whatever the payload's search radius was
    let span = min(h.radiusM, 150) * 2
    opts.region = MKCoordinateRegion(center: center, latitudinalMeters: span, longitudinalMeters: span * Double(max(1, aspect)))
    opts.size = size
    opts.scale = 1
    opts.mapType = .mutedStandard
    opts.pointOfInterestFilter = .excludingAll
    opts.showsBuildings = false
    opts.traitCollection = UITraitCollection(userInterfaceStyle: .dark)
    var finished = false
    let snapper = MKMapSnapshotter(options: opts)
    let timeout = DispatchWorkItem { if !finished { finished = true; snapper.cancel(); done(nil) } }
    DispatchQueue.global().asyncAfter(deadline: .now() + 6, execute: timeout)
    snapper.start { snap, _ in
      guard !finished else { return }
      finished = true; timeout.cancel()
      guard let snap = snap else { done(nil); return }
      let cosLat = cos(h.lat * .pi / 180)
      let pts = h.spots.map { s -> MapSnap.Pt in
        let c = CLLocationCoordinate2D(latitude: h.lat + s.dy / 111320, longitude: h.lng + s.dx / (111320 * cosLat))
        let p = snap.point(for: c)
        return MapSnap.Pt(x: p.x, y: p.y, w: s.w, id: s.id)
      }
      done(MapSnap(image: pixelate(snap.image, cell: 4), size: size, pts: pts))
    }
  }
}

/// Downsamples an image so each `cell`-point block becomes one flat pixel (drawn back up with no interpolation).
func pixelate(_ img: UIImage, cell: CGFloat) -> UIImage {
  let w = max(1, Int(img.size.width / cell)), h = max(1, Int(img.size.height / cell))
  let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1
  return UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: fmt).image { ctx in
    ctx.cgContext.interpolationQuality = .none
    img.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
  }
}

/// The map plate: the snapshot desaturated and tinted purple, then every piece as a neon-green pixel
/// with a glow (bigger and brighter the hotter it is), and you as a green block in the middle.
struct MapPlate: View {
  let entry: CanEntry
  var showScale = true
  var body: some View {
    GeometryReader { g in
      ZStack {
        if let m = entry.map {
          Image(uiImage: m.image).interpolation(.none).resizable().scaledToFill().frame(width: g.size.width, height: g.size.height).clipped()
            .saturation(0).colorMultiply(T.purpleHi).brightness(-0.08)
          Rectangle().fill(T.bg.opacity(0.35))
          let sx = g.size.width / m.size.width, sy = g.size.height / m.size.height
          ForEach(m.pts, id: \.id) { p in
            let d: CGFloat = 5 + 7 * CGFloat(p.w)
            Notched(n: 1.5).fill(p.w >= 0.7 ? T.greenHi : T.green).frame(width: d, height: d)
              .overlay(Notched(n: 1.5).stroke(T.ink, lineWidth: 1.5))
              .shadow(color: T.green.opacity(0.9), radius: 3 + 4 * p.w)
              .position(x: p.x * sx, y: p.y * sy)
          }
          Rectangle().fill(T.ink).frame(width: 12, height: 12).position(x: g.size.width / 2, y: g.size.height / 2)
          Rectangle().fill(T.green).frame(width: 8, height: 8).shadow(color: T.green, radius: 4).position(x: g.size.width / 2, y: g.size.height / 2)
        } else {
          RadarView(heat: entry.heat, density: 24, showScale: false)
        }
        if showScale {
          VStack { Spacer(); HStack { if entry.heat?.seeded == true { Caps(text: "SAMPLE", color: T.faint, size: 9) }; Spacer(); Text("\(Int(min(entry.heat?.radiusM ?? 150, 150)) * 2) M").font(PF.display(10)).foregroundStyle(T.dim) } }.padding(5)
        }
      }
      .background(Notched(n: 3).fill(T.ink))
      .clipShape(Notched(n: 3))
      .overlay(Notched(n: 3).stroke(T.ink, lineWidth: 2))
    }
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
        Caps(text: label, color: .white, size: 9)
        Spacer()
        if value >= 99.5 || refillAt <= Date() {
          Text("FULL").font(PF.display(10)).foregroundStyle(T.dim)
        } else {
          (Text("full in ") + Text(refillAt, style: .timer)).font(PF.body(10)).foregroundStyle(T.dim)
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
        Text(label).font(PF.display(10)).foregroundStyle(.white)
        Text(name).font(PF.body(10)).foregroundStyle(T.dim).lineLimit(1)
      }
    }
  }
}

/// The two cans: the logo can as drawn on the app icon, each with its paint colour and level underneath.
struct Cans: View {
  let entry: CanEntry
  var cell: CGFloat = 1.3
  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      CanSlot(color: entry.colorA, level: entry.paintA, name: entry.nameA, cell: cell)
      CanSlot(color: entry.colorB, level: entry.paintB, name: entry.nameB, cell: cell)
    }
  }
}
struct CanSlot: View {
  let color: Color; let level: Double; let name: String; let cell: CGFloat
  var body: some View {
    VStack(spacing: 3) {
      CanIcon(color: color, level: level, cell: cell, logo: true)
      HStack(spacing: 4) {
        Notched(n: 1.5).fill(color).frame(width: 10, height: 10).overlay(Notched(n: 1.5).stroke(T.ink, lineWidth: 1.5))
        Text("\(Int(level))%").font(PF.display(11)).foregroundStyle(.white)
      }
      SegBar(value: level, color: color, segs: 8, height: 4).frame(width: 44)
    }
  }
}

/// Stat tile: big number over a caption on a notched plate (kit Tile).
struct Stat: View {
  let n: Int
  let label: String
  var body: some View {
    VStack(spacing: 0) {
      Text("\(n)").font(PF.display(15)).foregroundStyle(.white)
      Text(label).font(PF.body(8)).foregroundStyle(T.dim)
    }
    .frame(maxWidth: .infinity).padding(.vertical, 2)
    .background(Notched(n: 2).fill(T.tile)).overlay(Notched(n: 2).stroke(T.ink, lineWidth: 2))
  }
}

/// A row for one hotspot: heat chip, name, distance + bearing.
struct SpotRow: View {
  let s: HeatSpot
  var body: some View {
    HStack(spacing: 8) {
      Notched(n: 2).fill(heatColor(s.w)).frame(width: 10, height: 10).overlay(Notched(n: 2).stroke(T.ink, lineWidth: 1.5))
      Text(s.n).font(PF.display(13)).foregroundStyle(.white).lineLimit(1)
      Spacer(minLength: 4)
      Image(systemName: "location.north.fill").font(.system(size: 8, weight: .bold)).rotationEffect(.degrees(Double(s.b))).foregroundStyle(T.dim)
      Text(s.d < 1000 ? "\(s.d) M" : String(format: "%.1f KM", Double(s.d) / 1000)).font(PF.display(11)).foregroundStyle(T.dim)
      Caps(text: heatLabel(s.w), color: heatColor(s.w), size: 9)
    }
  }
}

/// Header strip shared by the home-screen families: wordmark, tag, streak.
struct HeaderStrip: View {
  let entry: CanEntry
  var body: some View {
    HStack(spacing: 6) {
      Text("COSPRAY").font(PF.arcade(9)).foregroundStyle(T.green)
      Text(entry.tag).font(PF.display(11)).foregroundStyle(T.dim).lineLimit(1)
      Spacer()
      Caps(text: "\(entry.streak) day streak", color: T.dim, size: 9)
    }
  }
}

struct PaintCanView: View {
  var entry: CanEntry
  @Environment(\.widgetFamily) var family

  var status: String { min(entry.paintA, entry.paintB) < 18 ? "running low…" : "ready to spray" }
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

  /// Small: today's numbers and two quests; the arrow says there's more in the app.
  var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack { Caps(text: "TODAY", size: 11); Spacer(); Caps(text: "\(entry.today?.streak ?? entry.streak)d", color: T.dim, size: 10) }
      HStack(spacing: 4) {
        Stat(n: entry.today?.strokes ?? 0, label: "strokes")
        Stat(n: entry.today?.pieces ?? 0, label: "walls")
        Stat(n: entry.today?.paint ?? 0, label: "paint")
      }
      if let qs = entry.today?.quests, !qs.isEmpty {
        ForEach(qs.prefix(3)) { q in
          VStack(alignment: .leading, spacing: 0) {
            HStack { Text(q.title).font(PF.body(9.5)).foregroundStyle(.white).lineLimit(1); Spacer(); Text(q.claimed ? "DONE" : "\(q.got)/\(q.goal)").font(PF.display(9)).foregroundStyle(q.claimed || q.got >= q.goal ? T.greenHi : T.dim) }
            SegBar(value: q.claimed ? 100 : Double(q.got) / Double(max(1, q.goal)) * 100, color: q.claimed ? T.greenHi : T.green, segs: 12, height: 3)
          }
        }
      } else {
        Text("open the app to start today's quests").font(PF.body(10)).foregroundStyle(T.dim)
      }
      Spacer(minLength: 0)
    }
  }

  /// Medium: radar hero on the left, can status on the right.
  var medium: some View {
    HStack(spacing: 10) {
      MapPlate(entry: entry).aspectRatio(1, contentMode: .fit)
      VStack(alignment: .leading, spacing: 6) {
        HeaderStrip(entry: entry)
        HStack(alignment: .top, spacing: 10) {
          Cans(entry: entry)
          VStack(alignment: .leading, spacing: 3) {
            Caps(text: "nearest", size: 9)
            if top.isEmpty { Text("nothing near you yet").font(PF.body(10)).foregroundStyle(T.dim) }
            ForEach(top.prefix(2)) { sp in
              Text(sp.n).font(PF.display(11)).foregroundStyle(.white).lineLimit(1)
              Text("\(sp.d) m \(compass(sp.b)) · \(heatLabel(sp.w).lowercased())").font(PF.body(9)).foregroundStyle(T.dim).lineLimit(1)
            }
          }
        }
        Spacer(minLength: 0)
      }
    }
  }

  /// Large: a wide radar across the top, then cans and the closest three spots.
  var large: some View {
    VStack(alignment: .leading, spacing: 10) {
      HeaderStrip(entry: entry)
      MapPlate(entry: entry).frame(height: 196)
      HStack(alignment: .top, spacing: 14) {
        Cans(entry: entry, cell: 1.6)
        VStack(alignment: .leading, spacing: 4) {
          Caps(text: "nearest pieces", size: 10)
          if top.isEmpty { Text("nothing painted near you yet — go first").font(PF.body(11)).foregroundStyle(T.dim) }
          ForEach(top) { sp in
            HStack(alignment: .firstTextBaseline, spacing: 6) {
              Text(sp.n).font(PF.display(13)).foregroundStyle(.white).lineLimit(1)
              Spacer(minLength: 4)
              Text("\(sp.d) M \(compass(sp.b))").font(PF.display(11)).foregroundStyle(T.dim)
            }
          }
        }
      }
      Spacer(minLength: 0)
    }
  }

  /// Lock screen, rectangular: the nearest hotspot (monochrome-safe: the heat is in the label, not just the colour).
  var lockRect: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 4) {
        Text("COSPRAY").font(PF.arcade(8))
        Spacer()
        Text("🔥\(entry.streak)").font(PF.display(10))
      }
      if let n = nearest {
        Text(n.n).font(PF.display(13)).lineLimit(1)
        HStack(spacing: 4) {
          Image(systemName: "location.north.fill").font(.system(size: 9, weight: .bold)).rotationEffect(.degrees(Double(n.b)))
          Text("\(n.d) m \(compass(n.b)) · \(heatLabel(n.w))").font(PF.body(10))
        }
      } else {
        Text("A \(Int(entry.paintA))% · B \(Int(entry.paintB))%").font(PF.display(12))
        Text(status).font(PF.body(10)).opacity(0.8)
      }
    }
  }

  var lockCircle: some View {
    ZStack {
      AccessoryWidgetBackground()
      Circle().trim(from: 0, to: entry.paintA / 100).stroke(entry.colorA, style: StrokeStyle(lineWidth: 4, lineCap: .butt)).rotationEffect(.degrees(-90)).padding(3)
      Circle().trim(from: 0, to: entry.paintB / 100).stroke(entry.colorB, style: StrokeStyle(lineWidth: 4, lineCap: .butt)).rotationEffect(.degrees(-90)).padding(9)
      Text("\(Int(min(entry.paintA, entry.paintB)))").font(PF.display(14))
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
