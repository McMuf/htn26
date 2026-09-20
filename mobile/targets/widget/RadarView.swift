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
 * Pixel radar: a coarse cell grid filling whatever frame it gets (square or wide). Each cell's heat is
 * the sum of the spots' gaussian falloff, quantised to the theme's four-step purple→green ramp with
 * an ordered dither on the boundaries. Range rings are dotted cells, the user is a green block with an
 * ink outline, north is up, and a faint grid keeps it reading as a scanner even when nothing is hot.
 */
struct RadarView: View {
  let heat: HeatPayload?
  /// cell size as a fraction of the shorter side
  var density: Int = 27
  var showScale = true

  var body: some View {
    GeometryReader { g in
      let cell = min(g.size.width, g.size.height) / CGFloat(density)
      let cols = Int(g.size.width / cell), rows = Int(g.size.height / cell)
      let ox = (g.size.width - CGFloat(cols) * cell) / 2, oy = (g.size.height - CGFloat(rows) * cell) / 2
      ZStack {
        Canvas { ctx, _ in
          let mx = CGFloat(cols - 1) / 2, my = CGFloat(rows - 1) / 2
          let R = min(mx, my) // ring radius in cells
          let radius = heat?.radiusM ?? 500
          let spots = heat?.spots ?? []
          let pts = spots.map { s -> (x: CGFloat, y: CGFloat, w: Double, sig: Double) in
            (mx + CGFloat(s.dx / radius) * R, my - CGFloat(s.dy / radius) * R, s.w, 1.2 + 2.2 * s.w)
          }
          for cy in 0..<rows {
            for cx in 0..<cols {
              let dxm = CGFloat(cx) - mx, dym = CGFloat(cy) - my
              let rr = sqrt(dxm * dxm + dym * dym)
              var h = 0.0
              for p in pts {
                let ddx = Double(CGFloat(cx) - p.x), ddy = Double(CGFloat(cy) - p.y)
                h += p.w * exp(-(ddx * ddx + ddy * ddy) / (2 * p.sig * p.sig))
              }
              var lvl = h < 0.10 ? 0 : h < 0.32 ? 1 : h < 0.66 ? 2 : 3
              let checker = (cx + cy) % 2 == 0
              if lvl < 3 && h > [0.10, 0.32, 0.66][lvl] * 0.72 && checker { lvl = min(3, lvl + (h >= [0.10, 0.32, 0.66][lvl] * 0.85 ? 1 : 0)) }
              var color = T.heat[lvl]
              if lvl == 0 {
                let ring = abs(rr - R) < 0.5 || abs(rr - R * 2 / 3) < 0.45 || abs(rr - R / 3) < 0.45
                if ring && checker { color = T.panelHi.opacity(0.75) }
                else if (cx == Int(mx) || cy == Int(my)) && (cx + cy) % 3 == 0 { color = T.panel }
                else if cx % 6 == 0 && cy % 6 == 0 { color = T.panel.opacity(0.6) } // faint scanner grid
              }
              let rect = CGRect(x: ox + CGFloat(cx) * cell, y: oy + CGFloat(cy) * cell, width: cell + 0.5, height: cell + 0.5)
              ctx.fill(Path(rect), with: .color(color))
            }
          }
          for (p, s) in zip(pts, spots) where s.w >= 0.7 {
            let rect = CGRect(x: ox + (p.x.rounded()) * cell, y: oy + (p.y.rounded()) * cell, width: cell, height: cell)
            ctx.fill(Path(rect), with: .color(.white))
          }
          let you = CGRect(x: ox + (mx - 1) * cell, y: oy + (my - 1) * cell, width: cell * 3, height: cell * 3)
          ctx.fill(Path(you.insetBy(dx: -1, dy: -1)), with: .color(T.ink))
          ctx.fill(Path(you), with: .color(T.green))
        }
        if showScale {
          VStack {
            HStack { Caps(text: "N", color: .white.opacity(0.7), size: 8); Spacer(); if heat?.seeded == true { Caps(text: "SAMPLE", color: T.faint, size: 7) } }
            Spacer()
            HStack { Spacer(); Text("\(Int(heat?.radiusM ?? 500)) M").font(PF.display(10)).foregroundStyle(T.dim) }
          }.padding(5)
        }
      }
      .background(Notched(n: 3).fill(T.ink))
      .clipShape(Notched(n: 3))
    }
  }
}

