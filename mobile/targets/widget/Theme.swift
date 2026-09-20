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
  static let yellow = Color(hex: "#ffd21f")
  static let yellowHi = Color(hex: "#fff07a")
  static let yellowLo = Color(hex: "#c48f00")
  static let yellowInk = Color(hex: "#2a1a00")
  static let green = Color(hex: "#59d92d")
  static let greenHi = Color(hex: "#9cff6b")
  static let red = Color(hex: "#ff3d55")
  /// cold -> ember -> warm -> blazing (theme.ts HEAT)
  static let heat: [Color] = [bg2, yellowLo, yellow, red]
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

/// Small caps label in yellow, the widget's equivalent of `T v="label"` (named Caps to stay clear of SwiftUI.Label).
struct Caps: View {
  let text: String
  var color: Color = T.yellow
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
