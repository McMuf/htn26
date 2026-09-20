import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { liveActivityGroupPath } from '../../modules/ar-paint';
import { useStore } from '../store';
import { computeHeat } from './heat';
import { wrapDiff } from './geo';
import { rgb } from '../ui/color';
import { C } from '../ui/theme';

/**
 * The Minecraft-style locator bar for the Dynamic Island: a strip with you in the middle and the
 * three nearest pieces as neon pixels placed by their bearing relative to where the phone points
 * (±90° across the bar; further round than that sits hollow at the edge). Rendered with Skia to a
 * tiny PNG in expo-live-activity's App Group container, which the activity loads by file name.
 */
const W = 240, H = 24, HALF_FOV = 90;
let flip = 0;

const color = (hex: string, a = 1) => { const [r, g, b] = rgb(hex); return Skia.Color(`rgba(${r},${g},${b},${a})`); };

export function renderLocatorBar(headingDeg: number | null): string | null {
  if (!liveActivityGroupPath) return null;
  const st = useStore.getState();
  const loc = st.location;
  if (!loc) return null;
  const heat = computeHeat(Object.values(st.canvases), loc.lat, loc.lng, st.painter?.id ?? null, st.discovered);
  const spots = [...heat.spots].sort((a, b) => a.d - b.d).slice(0, 3);
  const surface = Skia.Surface.MakeOffscreen(W, H);
  if (!surface) return null;
  const cv = surface.getCanvas();
  const paint = Skia.Paint();
  const rect = (x: number, y: number, w: number, h: number, hex: string, a = 1) => { paint.setColor(color(hex, a)); cv.drawRect(Skia.XYWHRect(x, y, w, h), paint); };
  rect(0, 0, W, H, C.ink);
  rect(2, 2, W - 4, H - 4, C.bg);
  // ticks at ±45° / ±90°
  for (const t of [-90, -45, 45, 90]) { const x = W / 2 + (t / HALF_FOV) * (W / 2 - 10); rect(Math.round(x) - 1, 6, 2, H - 12, C.panelHi); }
  // you / the phone's heading
  rect(W / 2 - 1, 2, 2, H - 4, C.white);
  const heading = headingDeg ?? 0;
  spots.forEach((s, i) => {
    const rel = headingDeg == null ? s.b : wrapDiff(s.b, heading); // -180..180, 0 = straight ahead
    const inFov = Math.abs(rel) <= HALF_FOV;
    const x = W / 2 + (Math.max(-HALF_FOV, Math.min(HALF_FOV, rel)) / HALF_FOV) * (W / 2 - 10);
    const size = s.d < 60 ? 10 : s.d < 200 ? 8 : 6;
    const hex = i === 0 ? C.greenHi : C.green;
    const x0 = Math.round(x - size / 2), y0 = Math.round(H / 2 - size / 2);
    rect(x0 - 1, y0 - 1, size + 2, size + 2, C.ink);
    if (inFov) rect(x0, y0, size, size, hex);
    else { rect(x0, y0, size, size, hex); rect(x0 + 2, y0 + 2, size - 4, size - 4, C.bg); } // hollow: it's behind you
  });
  const img = surface.makeImageSnapshot();
  const bytes = img.encodeToBytes(ImageFormat.PNG, 100);
  flip = 1 - flip;
  const name = `locator-${flip}.png`;
  try { new File(`${liveActivityGroupPath}/${name}`).write(bytes); } catch { return null; }
  return name;
}
