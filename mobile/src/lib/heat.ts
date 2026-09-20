import { MOCK_CANVASES } from '../data/mock';
import { bearingDeg, haversineM } from './geo';
import type { Canvas } from '../types';

/**
 * "Activity near you": one model shared by the Explore map, the home-screen widget and the
 * proximity alerts. Each canvas becomes a hot spot weighted by how much paint it has and how
 * recently it was touched; everything is expressed relative to the user so the widget only has to
 * draw. Real canvases always win; sample spots (`sample: true`) are mixed in only when fewer than
 * three real ones are in range, so the demo never renders an empty radar.
 */
export type HotSpot = {
  id: string; n: string; who: string;
  /** metres east / north of the user */
  dx: number; dy: number;
  /** distance (m) and compass bearing (deg) from the user */
  d: number; b: number;
  /** normalised heat 0..1 */
  w: number;
  mine: boolean; found: boolean; sample: boolean;
};
export type HeatPayload = { v: 1; at: number; lat: number; lng: number; radiusM: number; seeded: boolean; nearestId: string | null; spots: HotSpot[] };

const R = 6371000, d2r = Math.PI / 180;
const RINGS = [250, 500, 1000, 2000];
/** A spot at or above this normalised heat counts as "hot" (nearest-hotspot pick, alerts). */
export const HOT = 0.25;
export const MAX_SPOTS = 12;

/** Recency-decayed activity: old big pieces stay as embers instead of vanishing. */
export function rawHeat(c: Pick<Canvas, 'stroke_count' | 'views' | 'updated_at'>, now = Date.now()) {
  const ageH = Math.max(0, (now - Date.parse(c.updated_at)) / 3600e3);
  return (c.stroke_count + 0.5 * c.views) * Math.max(0.15, Math.exp(-ageH / 36));
}

/** 0..3 heat level for the stepped ramp (`HEAT` in theme.ts). */
export const heatLevel = (w: number) => (w < 0.12 ? 0 : w < 0.35 ? 1 : w < 0.7 ? 2 : 3);
export const heatLabel = (w: number) => (w < 0.35 ? 'EMBER' : w < 0.7 ? 'WARM' : 'BLAZING');
export const compass = (b: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(((b % 360) + 360 + 22.5) % 360 / 45)];

let seedOrigin: { lat: number; lng: number } | null = null; // fixed for the session so samples don't drift as you walk

export function computeHeat(canvases: Canvas[], lat: number, lng: number, me: string | null, discovered: Record<string, true>, now = Date.now()): HeatPayload {
  const cosLat = Math.cos(lat * d2r);
  const mk = (c: Canvas, sample: boolean): HotSpot => ({
    id: c.id, n: c.title ?? `${c.author_name}'s piece`, who: c.author_name,
    dx: (c.lng - lng) * d2r * cosLat * R, dy: (c.lat - lat) * d2r * R,
    d: Math.round(haversineM(lat, lng, c.lat, c.lng)), b: Math.round(bearingDeg(lat, lng, c.lat, c.lng)),
    w: rawHeat(c, now), mine: !!me && c.author_id === me, found: !!discovered[c.id], sample,
  });
  const byId = new Map<string, HotSpot>(); // dedupe by canvas id
  for (const c of canvases) if (!c.flagged) byId.set(c.id, mk(c, false));
  let spots = [...byId.values()].filter((s) => s.d <= RINGS[RINGS.length - 1]);
  let seeded = false;
  if (spots.length < 3) {
    seeded = true;
    const near = MOCK_CANVASES.map((c) => mk(c, true)).filter((s) => s.d <= RINGS[RINGS.length - 1]); // Waterloo samples if you're there…
    if (near.length) spots.push(...near);
    else { // …otherwise lay them out around the user on a golden-angle spiral
      seedOrigin ??= { lat, lng };
      MOCK_CANVASES.forEach((c, i) => {
        const ang = i * 137.5 * d2r, dist = 90 + i * 110;
        const sl = seedOrigin!.lat + (dist * Math.cos(ang)) / R / d2r, sg = seedOrigin!.lng + (dist * Math.sin(ang)) / (R * cosLat) / d2r;
        spots.push(mk({ ...c, lat: sl, lng: sg }, true));
      });
    }
  }
  const max = Math.max(1e-6, ...spots.map((s) => s.w));
  spots = spots.map((s) => ({ ...s, w: Math.max(0.12, s.w / max) })).sort((a, b) => b.w - a.w).slice(0, MAX_SPOTS);
  const want = Math.min(3, spots.length);
  const radiusM = RINGS.find((r) => spots.filter((s) => s.d <= r).length >= want) ?? RINGS[RINGS.length - 1];
  spots = spots.filter((s) => s.d <= radiusM);
  const hot = spots.filter((s) => s.w >= HOT).sort((a, b) => a.d - b.d)[0] ?? [...spots].sort((a, b) => a.d - b.d)[0];
  return { v: 1, at: Math.floor(now / 1000), lat, lng, radiusM, seeded, nearestId: hot?.id ?? null, spots };
}

/** Normalised heat per canvas id for a whole list (map rendering). */
export function heatWeights(canvases: Canvas[], now = Date.now()): Record<string, number> {
  const raw = canvases.map((c) => [c.id, rawHeat(c, now)] as const);
  const max = Math.max(1e-6, ...raw.map(([, w]) => w));
  return Object.fromEntries(raw.map(([id, w]) => [id, Math.max(0.12, w / max)]));
}
