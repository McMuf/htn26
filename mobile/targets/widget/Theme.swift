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

/// The app's faces (bundled with the extension, see Info.plist UIAppFonts).
enum PF {
  /// Pixelify Sans Bold: anything that carries weight.
  static func display(_ size: CGFloat) -> Font { .custom("PixelifySans-Bold", size: size) }
  /// Pixelify Sans Medium: the rest.
  static func body(_ size: CGFloat) -> Font { .custom("PixelifySans-Medium", size: size) }
  /// Press Start 2P: the COSPRAY wordmark only.
  static func arcade(_ size: CGFloat) -> Font { .custom("PressStart2P-Regular", size: size) }
}

/// Small caps label in neon green, the widget's equivalent of `T v="label"` (named Caps to stay clear of SwiftUI.Label).
struct Caps: View {
  let text: String
  var color: Color = T.green
  var size: CGFloat = 9
  var body: some View { Text(text.uppercased()).font(PF.display(max(size, 11))).tracking(0.8).foregroundStyle(color) }
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

/// The Cospray can (the app icon's sprite, mobile/src/ui/LogoCan.tsx) recoloured to a paint colour and
/// filled to `level`: body rows above the paint line go to bare metal, the cap and the C stay.
struct CanIcon: View {
  let color: Color
  let level: Double
  var cell: CGFloat = 1.5
  static let rows: [String] = [
    ".........................GG.",
    ".........................GG.",
    ".......................GG...",
    ".......................GG...",
    ".......................GG...",
    ".....................GGGGGG.",
    ".....................GGGGGG.",
    "...................GGGGGG...",
    "..........####.....GGGGGG...",
    ".........#lWWl#.GGGGGGGGGGG.",
    ".........##lW##.GGGGGGGGGGG.",
    ".........#h##h#....GGGGGG...",
    ".........#hlWh#...dGGGGGG...",
    ".......l###hh###...d.GGGGGGG",
    ".....pppp##dd..dppp.dGGGGGG.",
    ".....##.Wdd##ppW###ddGGGGGG.",
    "....#llhddd##ppdWWW#d..GG...",
    "...#lpppl......WWWWW#d.GG...",
    "..#lhdpppWWWWWWlWWWWW#...GG.",
    ".#hpddddppphhhllWWWWlW...GG.",
    ".#hpddddpppphhhllllllW......",
    "#dhpdddddppphhhhlllllW......",
    "#l#hdddddpppphhhhlllW#......",
    "#lp##hhhhlllWWWWWWW##h......",
    "h.p..#..#..........ddh......",
    ".#pd.##############pph#.....",
    ".##d.dppllWlWWWWWllpp##.....",
    ".#h##dppllWlWWWWWWl##h#.....",
    ".#lpd##############pph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWllhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.d##########hhpph#.....",
    ".#lpd.##gGWGGWWW##hpph#.....",
    ".#lpd##ggGWGGWWWG##pph#.....",
    ".#lpd#ggg#####WWGG#pph#.....",
    ".#lpd#ggg#Whh##WGG#pph#.....",
    ".#lpd#ggg#WhhW##GG#pph#.....",
    ".#lpd#ggg#WhhWW####pph#.....",
    ".#lpd#ggg#WhhWWWlhhpph#.....",
    ".#lpd#ggg#WhhWWWlhhpph#.....",
    ".#lpd#ggg#WhhWW####pph#.....",
    ".#lpd#ggg#WhhW##GG#pph#.....",
    ".#lpd#ggg#Whh##WGG#pph#.....",
    ".#lpd#ggg#####WWGG#pph#.....",
    ".#lpd##ggGWGGWWWG##pph#.....",
    ".#lpd.##gGWGGWWW##hpph#.....",
    ".#lpd.d##########hhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    ".#lpd.ddphWhhWWWlhhpph#.....",
    "#p#pddddphWhhWWWlhhpp#p#....",
    "#pd#ddddphWhhWWWlhhp#pp#....",
    "#pd#ddddphWhhWWWlhhp#hp#....",
    "#pd..#..phWhhWWWld#ddhp#....",
    ".#d...dd########dphhdh#.....",
    "..#...ddhlWllWWWlhhhd#......",
    "....#.ddhlWllWWWlpd###.#....",
    "....#.###########d#####.#..."
  ]
  static let bodyTop = 25, bodyBottom = 58 // sprite rows that hold paint
  /// `logo` draws the icon exactly as the app icon (puff included, original colours); otherwise the body is recoloured and filled.
  var logo = false
  var body: some View {
    let rows = CanIcon.rows
    let (r, g, b) = rgb(color)
    let filled = Int((max(0, min(100, level)) / 100 * Double(CanIcon.bodyBottom - CanIcon.bodyTop + 1)).rounded())
    let skip = logo ? 0 : 24 // the spray puff rows
    Canvas { ctx, _ in
      for (y, row) in rows.enumerated() {
        if y < skip { continue }
        for (x, ch) in row.enumerated() {
          if ch == "." { continue }
          let rect = CGRect(x: CGFloat(x) * cell, y: CGFloat(y - skip) * cell, width: cell + 0.3, height: cell + 0.3)
          let inBody = !logo && y >= CanIcon.bodyTop && y <= CanIcon.bodyBottom
          let painted = inBody && (CanIcon.bodyBottom - y) < filled
          ctx.fill(Path(rect), with: .color(shade(ch, r, g, b, tint: inBody, painted: painted)))
        }
      }
    }
    .frame(width: CGFloat(rows[0].count) * cell, height: CGFloat(rows.count - skip) * cell)
  }
  func shade(_ ch: Character, _ r: Double, _ g: Double, _ b: Double, tint: Bool, painted: Bool) -> Color {
    switch ch {
    case "#": return T.ink
    case "G": return T.green
    case "g": return T.greenLo
    case "k": return Color(hex: "#285a1e")
    default: break
    }
    // shading cuts d < p < h < l < W, remapped onto the paint colour (or bare metal above the paint line)
    let k: Double = ch == "d" ? 0.45 : ch == "p" ? 0.75 : ch == "h" ? 1.0 : ch == "l" ? 1.25 : 1.6
    if tint && !painted { let m = 0.22 + 0.16 * k; return Color(red: m, green: m * 0.95, blue: m * 1.25) }
    if !tint { return Color(hex: ch == "d" ? "#3a2580" : ch == "p" ? "#5b3fb0" : ch == "h" ? "#8e6fe8" : ch == "l" ? "#b49bff" : "#efe8ff") }
    let f = { (c: Double) -> Double in k <= 1 ? c * k : c + (1 - c) * (k - 1) }
    return Color(red: f(r), green: f(g), blue: f(b))
  }
  func rgb(_ c: Color) -> (Double, Double, Double) {
    let ui = UIColor(c); var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    ui.getRed(&r, green: &g, blue: &b, alpha: &a)
    return (Double(r), Double(g), Double(b))
  }
}
