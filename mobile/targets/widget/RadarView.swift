import SwiftUI
import WidgetKit

// The `hot` key in the App Group is this payload as a JSON string (mobile/src/lib/heat.ts). Everything
// is already relative to the user: `dx`/`dy` are metres east/north, `w` is normalised heat 0..1.
struct HeatSpot: Decodable, Identifiable {
  let id: String; let n: String; let who: String
  let dx: Double; let dy: Double; let d: Int; let b: Int
  let w: Double
  let mine: Bool; let found: Bool; let sample: Bool
}
struct HeatPayload: Decodable {
  let v: Int; let at: Int; let lat: Double; let lng: Double
  let radiusM: Double; let seeded: Bool; let nearestId: String?
  let spots: [HeatSpot]
  var nearest: HeatSpot? { spots.first { $0.id == nearestId } }
  static func load(_ d: UserDefaults?) -> HeatPayload? {
    guard let s = d?.string(forKey: "hot"), let data = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(HeatPayload.self, from: data)
  }
}

func heatLevel(_ w: Double) -> Int { w < 0.12 ? 0 : w < 0.35 ? 1 : w < 0.7 ? 2 : 3 }
func heatLabel(_ w: Double) -> String { w < 0.35 ? "EMBER" : w < 0.7 ? "WARM" : "BLAZING" }
func heatColor(_ w: Double) -> Color { T.heat[max(1, heatLevel(w))] }
func compass(_ b: Int) -> String { ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(((b % 360) + 360 + 22) % 360) / 45] }

/**
 * Pixel radar: a coarse cell grid where each cell's heat is the sum of the spots' gaussian falloff,
 * quantised to the theme's four-step ramp. Range rings are dotted cells, the user is a green block,
 * north is up. No blur, no gradients — it is drawn once per timeline entry with SwiftUI Canvas.
 */
struct RadarView: View {
  let heat: HeatPayload?
  var cells: Int = 27

  var body: some View {
    GeometryReader { g in
      let side = min(g.size.width, g.size.height)
      let cell = side / CGFloat(cells)
      let ox = (g.size.width - side) / 2, oy = (g.size.height - side) / 2
      ZStack {
        Canvas { ctx, _ in
          let mid = CGFloat(cells - 1) / 2
          let R = mid // in cells
          let radius = heat?.radiusM ?? 500
          let spots = heat?.spots ?? []
          // per-spot position in cells + falloff width scaling with heat
          let pts = spots.map { s -> (x: CGFloat, y: CGFloat, w: Double, sig: Double) in
            (mid + CGFloat(s.dx / radius) * R, mid - CGFloat(s.dy / radius) * R, s.w, 1.2 + 2.2 * s.w)
          }
          for cy in 0..<cells {
            for cx in 0..<cells {
              let dxm = CGFloat(cx) - mid, dym = CGFloat(cy) - mid
              let rr = sqrt(dxm * dxm + dym * dym)
              if rr > R + 0.5 { continue }
              var h = 0.0
              for p in pts {
                let ddx = Double(CGFloat(cx) - p.x), ddy = Double(CGFloat(cy) - p.y)
                h += p.w * exp(-(ddx * ddx + ddy * ddy) / (2 * p.sig * p.sig))
              }
              var lvl = h < 0.10 ? 0 : h < 0.32 ? 1 : h < 0.66 ? 2 : 3
              // ordered dither on the boundaries so the blobs read as spray, not stamps
              let checker = (cx + cy) % 2 == 0
              if lvl < 3 && h > [0.10, 0.32, 0.66][lvl] * 0.72 && checker { lvl = min(3, lvl + (h >= [0.10, 0.32, 0.66][lvl] * 0.85 ? 1 : 0)) }
              var color = T.heat[lvl]
              // range rings at 1/3, 2/3, 1 as dotted cells under the heat
              let ring = abs(rr - R) < 0.5 || abs(rr - R * 2 / 3) < 0.45 || abs(rr - R / 3) < 0.45
              if lvl == 0 && ring && checker { color = T.panelHi.opacity(0.7) }
              else if lvl == 0 && (cx == Int(mid) || cy == Int(mid)) && (cx + cy) % 3 == 0 { color = T.panel }
              let rect = CGRect(x: ox + CGFloat(cx) * cell, y: oy + CGFloat(cy) * cell, width: cell + 0.5, height: cell + 0.5)
              ctx.fill(Path(rect), with: .color(color))
            }
          }
          // hot cores: a white pixel at the centre of blazing spots
          for (p, s) in zip(pts, spots) where s.w >= 0.7 {
            let rect = CGRect(x: ox + (p.x.rounded()) * cell, y: oy + (p.y.rounded()) * cell, width: cell, height: cell)
            ctx.fill(Path(rect), with: .color(.white))
          }
          // you: a 3x3 green block with an ink outline
          let you = CGRect(x: ox + (mid - 1) * cell, y: oy + (mid - 1) * cell, width: cell * 3, height: cell * 3)
          ctx.fill(Path(you.insetBy(dx: -1, dy: -1)), with: .color(T.ink))
          ctx.fill(Path(you), with: .color(T.green))
        }
        VStack {
          HStack { Caps(text: "N", color: .white.opacity(0.7), size: 8); Spacer(); if heat?.seeded == true { Caps(text: "SAMPLE", color: T.faint, size: 7) } }
          Spacer()
          HStack { Spacer(); Text("\(Int(heat?.radiusM ?? 500)) m").font(.system(size: 8, weight: .bold)).foregroundStyle(T.dim) }
        }.padding(5)
      }
      .frame(width: side, height: side).position(x: g.size.width / 2, y: g.size.height / 2)
      .background(Notched(n: 3).fill(T.ink))
      .clipShape(Notched(n: 3))
    }
    .aspectRatio(1, contentMode: .fit)
  }
}

/// Nearest hotspot summary: name, bearing + distance, heat chip.
struct NearestView: View {
  let spot: HeatSpot?
  var compact = false
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      if let n = spot {
        Text(n.n).font(.system(size: compact ? 11 : 13, weight: .heavy)).foregroundStyle(.white).lineLimit(compact ? 1 : 2).minimumScaleFactor(0.8)
        HStack(spacing: 5) {
          Image(systemName: "location.north.fill").font(.system(size: 10, weight: .bold)).rotationEffect(.degrees(Double(n.b))).foregroundStyle(heatColor(n.w))
          Text(n.d < 1000 ? "\(n.d) m" : String(format: "%.1f km", Double(n.d) / 1000)).font(.system(size: 11, weight: .bold)).foregroundStyle(.white).monospacedDigit()
          Text(compass(n.b)).font(.system(size: 9, weight: .semibold)).foregroundStyle(T.dim)
        }
        HStack(spacing: 5) {
          Text(heatLabel(n.w)).font(.system(size: 7, weight: .black)).tracking(0.8).padding(.horizontal, 5).padding(.vertical, 2)
            .background(Notched(n: 2).fill(heatColor(n.w))).foregroundStyle(n.w < 0.7 ? .white : T.greenInk)
          Text(n.found ? "found" : n.mine ? "yours" : n.sample ? "sample" : "undiscovered").font(.system(size: 8, weight: .semibold)).foregroundStyle(T.dim)
        }
      } else {
        Text("No pieces nearby yet").font(.system(size: 11, weight: .semibold)).foregroundStyle(T.dim)
        Text("open the app to scan").font(.system(size: 9)).foregroundStyle(T.faint)
      }
    }
  }
}
