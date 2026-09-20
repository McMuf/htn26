import ActivityKit
import SwiftUI
import WidgetKit

/// Compact paint gauge for the island and the banner: label, segmented bar, percent.
struct PaintBar: View {
  let value: Double
  let color: Color
  let label: String
  var body: some View {
    HStack(spacing: 6) {
      Text(label).font(.system(size: 9, weight: .heavy)).foregroundStyle(.white).frame(width: 10)
      SegBar(value: value, color: color, height: 7)
      Text("\(Int(value))%").font(.system(size: 9, weight: .bold)).foregroundStyle(T.dim).monospacedDigit().frame(width: 30, alignment: .trailing)
        .contentTransition(.numericText())
    }
  }
}

/// A paint swatch as a notched square; lit (white edge + glow) while that colour is spraying.
struct Dot: View {
  let hex: String
  let on: Bool
  var size: CGFloat = 18
  var body: some View {
    Notched(n: 2).fill(Color(hex: hex)).frame(width: size, height: size)
      .overlay(Notched(n: 2).stroke(on ? .white : T.ink, lineWidth: 2))
      .shadow(color: Color(hex: hex).opacity(on ? 0.9 : 0), radius: on ? 5 : 0)
  }
}

/// The painting session: lock-screen banner + Dynamic Island. Data comes from CosprayPaintAttributes.
struct PaintActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CosprayPaintAttributes.self) { ctx in
      let a = ctx.attributes, s = ctx.state
      HStack(spacing: 12) {
        VStack(spacing: 6) { Dot(hex: a.colorA, on: s.sprayingSide == "A", size: 22); Dot(hex: a.colorB, on: s.sprayingSide == "B", size: 22) }
        VStack(alignment: .leading, spacing: 5) {
          HStack {
            Caps(text: "COSPRAY"); Text(a.tag).font(.system(size: 12, weight: .black)).foregroundStyle(.white).lineLimit(1)
            Spacer()
            Text(timerInterval: s.startedAt...Date(timeIntervalSinceNow: 4 * 3600), countsDown: false).font(.system(size: 12, weight: .bold)).monospacedDigit().foregroundStyle(.white).frame(maxWidth: 60)
          }
          PaintBar(value: s.paintA, color: Color(hex: a.colorA), label: "A")
          PaintBar(value: s.paintB, color: Color(hex: a.colorB), label: "B")
          Text(s.sprayingSide == "none" ? "PAUSED · \(s.strokes) STROKES" : "SPRAYING \(s.sprayingSide == "A" ? a.nameA.uppercased() : a.nameB.uppercased()) · \(s.strokes) STROKES")
            .font(.system(size: 8, weight: .heavy)).tracking(0.6).foregroundStyle(T.dim)
        }
      }
      .padding(14)
      .activityBackgroundTint(T.bg)
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { ctx in
      let a = ctx.attributes, s = ctx.state
      let side = s.sprayingSide == "B" ? "B" : "A"
      let sideHex = side == "A" ? a.colorA : a.colorB
      let sidePaint = side == "A" ? s.paintA : s.paintB
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(spacing: 6) { Dot(hex: a.colorA, on: s.sprayingSide == "A", size: 22); Dot(hex: a.colorB, on: s.sprayingSide == "B", size: 22) }.padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: s.startedAt...Date(timeIntervalSinceNow: 4 * 3600), countsDown: false)
            .font(.system(size: 14, weight: .bold)).monospacedDigit().foregroundStyle(.white).frame(width: 56, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text(a.tag).font(.system(size: 13, weight: .black)).foregroundStyle(.white)
            Text(s.sprayingSide == "none" ? "paused" : "spraying \(s.sprayingSide == "A" ? a.nameA : a.nameB)").font(.system(size: 9, weight: .semibold)).foregroundStyle(T.dim)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 4) {
            PaintBar(value: s.paintA, color: Color(hex: a.colorA), label: "A")
            PaintBar(value: s.paintB, color: Color(hex: a.colorB), label: "B")
            Text("\(s.strokes) strokes this session").font(.system(size: 9)).foregroundStyle(T.faint)
          }.padding(.horizontal, 4)
        }
      } compactLeading: {
        Dot(hex: sideHex, on: s.sprayingSide != "none", size: 16)
      } compactTrailing: {
        ProgressView(value: sidePaint, total: 100).progressViewStyle(.circular).tint(Color(hex: sideHex)).frame(width: 18, height: 18)
      } minimal: {
        Dot(hex: sideHex, on: s.sprayingSide != "none", size: 16)
      }
      .keylineTint(Color(hex: sideHex))
    }
  }
}
