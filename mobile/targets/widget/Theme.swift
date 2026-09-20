import SwiftUI

/// The app's pixel-arcade tokens (mobile/src/ui/theme.ts), for the widget and the Live Activity.
enum T {
  static let bg = Color(hex: "#12082b")
  static let bg2 = Color(hex: "#1c0f42")
  static let ink = Color(hex: "#0a0620")
  static let panel = Color(hex: "#2c1868")
  static let panelHi = Color(hex: "#4327a8")
  static let tile = Color(hex: "#2b2059")
  static let well = Color(hex: "#150a36")
  static let dim = Color(hex: "#cdbff5")
  static let faint = Color(hex: "#8f80c8")
  static let purple = Color(hex: "#7a45ff")
  static let purpleHi = Color(hex: "#ab8cff")
  static let green = Color(hex: "#59d92d")
  static let greenHi = Color(hex: "#9cff6b")
  static let greenLo = Color(hex: "#2b8a17")
  static let greenInk = Color(hex: "#0b2a05")
  static let red = Color(hex: "#ff3d55")
  /// cold -> ember -> warm -> blazing (theme.ts HEAT): purple world, green signal
  static let heat: [Color] = [bg2, purple, green, greenHi]
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

/// Notched (stair-step) rectangle: the PixelBox corner without any radius.
struct Notched: Shape {
  var n: CGFloat = 3
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.minX + n, y: r.minY))
    p.addLine(to: CGPoint(x: r.maxX - n, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX - n, y: r.minY + n)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY + n))
    p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - n)); p.addLine(to: CGPoint(x: r.maxX - n, y: r.maxY - n)); p.addLine(to: CGPoint(x: r.maxX - n, y: r.maxY))
    p.addLine(to: CGPoint(x: r.minX + n, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX + n, y: r.maxY - n)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY - n))
    p.addLine(to: CGPoint(x: r.minX, y: r.minY + n)); p.addLine(to: CGPoint(x: r.minX + n, y: r.minY + n)); p.closeSubpath()
    return p
  }
}

/// Small caps label in neon green, the widget's equivalent of `T v="label"` (named Caps to stay clear of SwiftUI.Label).
struct Caps: View {
  let text: String
  var color: Color = T.green
  var size: CGFloat = 9
  var body: some View { Text(text).font(.system(size: size, weight: .black)).tracking(1).foregroundStyle(color) }
}

/// Flat segmented meter (kit SegBar).
struct SegBar: View {
  let value: Double // 0..100
  let color: Color
  var segs = 10
  var height: CGFloat = 8
  var body: some View {
    let lit = Int((max(0, min(100, value)) / 100 * Double(segs)).rounded())
    HStack(spacing: 1.5) {
      ForEach(0..<segs, id: \.self) { i in Rectangle().fill(i < lit ? color : Color.white.opacity(0.12)) }
    }
    .padding(2).background(T.ink).frame(height: height + 4)
  }
}

/// The app's CRT backdrop: a posterised purple gradient with ordered-dither seams, for widget backgrounds.
struct Bands: View {
  var bands = 7
  var body: some View {
    GeometryReader { g in
      let h = g.size.height / CGFloat(bands)
      Canvas { ctx, _ in
        for i in 0..<bands {
          let t = Double(i) / Double(bands - 1)
          let c = Color(red: 0.227 + (0.071 - 0.227) * t, green: 0.102 + (0.031 - 0.102) * t, blue: 0.541 + (0.169 - 0.541) * t) // #3a1a8a -> #12082b
          ctx.fill(Path(CGRect(x: 0, y: CGFloat(i) * h, width: g.size.width, height: h + 1)), with: .color(c))
          if i > 0 { // dither seam: next band pokes into the previous one in a checker
            var x: CGFloat = 0
            while x < g.size.width { ctx.fill(Path(CGRect(x: x, y: CGFloat(i) * h - 3, width: 3, height: 3)), with: .color(c)); x += 6 }
          }
        }
      }
    }
  }
}
