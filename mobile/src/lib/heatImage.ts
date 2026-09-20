import { AlphaType, ColorType, ImageFormat, Skia } from '@shopify/react-native-skia';
import { rgb } from '../ui/color';
import { C } from '../ui/theme';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type HeatPoint = { lat: number; lng: number; w: number };

const M_PER_LAT = 110574, M_PER_LNG_EQ = 111320;
/** Quantised ramp: nothing, purple ember, green, bright green core. Alpha per level. */
const LEVELS: [string, number][] = [[C.purple, 0.55], [C.green, 0.62], [C.greenHi, 0.85]];
const THRESH = [0.12, 0.38, 0.75];

/**
 * Renders the heat for a map region as a chunky PNG (data URI) to lay over the map: every spot is
 * a gaussian in metres (wider and hotter with its weight), summed, then snapped to CELL-sized
 * pixels and three colour levels. Returns null when there is nothing to draw.
 */
export function renderHeat(points: HeatPoint[], region: Region, size = 128, cell = 4): { uri: string; bounds: [[number, number], [number, number]] } | null {
  if (!points.length) return null;
  const cosLat = Math.cos((region.latitude * Math.PI) / 180);
  const spanX = region.longitudeDelta * M_PER_LNG_EQ * cosLat, spanY = region.latitudeDelta * M_PER_LAT;
  const pts = points.map((p) => ({
    x: (p.lng - region.longitude) * M_PER_LNG_EQ * cosLat, y: (p.lat - region.latitude) * M_PER_LAT,
    w: p.w, s2: 2 * Math.pow(40 + 110 * p.w, 2),
  }));
  const px = new Uint8Array(size * size * 4);
  const cols = LEVELS.map(([hex, a]) => [...rgb(hex), Math.round(a * 255)]);
  const n = size / cell;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = ((cx + 0.5) / n - 0.5) * spanX, y = (0.5 - (cy + 0.5) / n) * spanY;
      let h = 0;
      for (const p of pts) { const dx = x - p.x, dy = y - p.y; h += p.w * Math.exp(-(dx * dx + dy * dy) / p.s2); }
      const lvl = h >= THRESH[2] ? 2 : h >= THRESH[1] ? 1 : h >= THRESH[0] ? 0 : -1;
      // dither the boundary so blobs read as spray, not stamps
      const next = lvl + 1 < THRESH.length && h >= THRESH[lvl + 1] * 0.8 && (cx + cy) % 2 === 0 ? lvl + 1 : lvl;
      if (next < 0) continue;
      const [r, g, b, a] = cols[next];
      for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
        const o = ((cy * cell + j) * size + cx * cell + i) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
      }
    }
  }
  const img = Skia.Image.MakeImage({ width: size, height: size, alphaType: AlphaType.Unpremul, colorType: ColorType.RGBA_8888 }, Skia.Data.fromBytes(px), size * 4);
  if (!img) return null;
  const uri = `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
  const south = region.latitude - region.latitudeDelta / 2, north = region.latitude + region.latitudeDelta / 2;
  const west = region.longitude - region.longitudeDelta / 2, east = region.longitude + region.longitudeDelta / 2;
  return { uri, bounds: [[south, west], [north, east]] };
}
