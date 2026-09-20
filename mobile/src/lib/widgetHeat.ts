import { ExtensionStorage } from '@bacons/apple-targets';
import { useStore } from '../store';
import { haversineM } from './geo';
import { computeHeat, type HeatPayload } from './heat';
import { mapSnapshot } from '../../modules/ar-paint';

/**
 * Pushes the "activity near you" payload (src/lib/heat.ts) into the App Group as the `hot` key, as a
 * JSON string, whenever it is worth redrawing the radar: the user moved >= 150 m, the canvases we
 * know about changed, five minutes passed, or the first GPS fix arrived. The widget reads it
 * verbatim; all geometry is precomputed here.
 */
const MOVE_M = 150, MAX_AGE_MS = 5 * 60e3, DEBOUNCE_MS = 2000;

export function startHeatSync(storage: ExtensionStorage) {
  let lastLoc: { lat: number; lng: number } | null = null, lastSig = '', lastAt = 0, timer: ReturnType<typeof setTimeout> | null = null;
  const push = () => {
    const st = useStore.getState();
    const loc = st.location;
    if (!loc) return;
    const cs = Object.values(st.canvases);
    const sig = `${cs.length}:${cs.reduce((m, c) => (c.updated_at > m ? c.updated_at : m), '')}`;
    const moved = !lastLoc || haversineM(loc.lat, loc.lng, lastLoc.lat, lastLoc.lng) >= MOVE_M;
    if (!moved && sig === lastSig && Date.now() - lastAt < MAX_AGE_MS) return;
    lastLoc = { lat: loc.lat, lng: loc.lng }; lastSig = sig; lastAt = Date.now();
    try {
      const heat = computeHeat(cs, loc.lat, loc.lng, st.painter?.id ?? null, st.discovered);
      storage.set('hot', JSON.stringify(heat));
      ExtensionStorage.reloadWidget('widget');
      snapshotMaps(heat, storage).catch(() => {});
    } catch {}
  };
  const unsub = useStore.subscribe(() => { if (!timer) timer = setTimeout(() => { timer = null; push(); }, DEBOUNCE_MS); });
  push();
  return () => { unsub(); if (timer) clearTimeout(timer); };
}

/**
 * Apple Maps snapshots for the widget, rendered by the app (the extension can't): a square one for
 * the small/medium families and a wide one for the large. Each carries the pieces projected into it.
 */
async function snapshotMaps(heat: HeatPayload, storage: ExtensionStorage) {
  const st = useStore.getState();
  const byId = st.canvases;
  const spots = heat.spots.map((s) => {
    const c = byId[s.id];
    // sample spots have no canvas row: place them from their offsets
    const lat = c?.lat ?? heat.lat + s.dy / 111320, lng = c?.lng ?? heat.lng + s.dx / (111320 * Math.cos((heat.lat * Math.PI) / 180));
    return { id: s.id, lat, lng, w: s.w };
  });
  const spanM = Math.min(heat.radiusM, 150) * 2;
  const sq = await mapSnapshot({ name: 'widgetmap_sq', lat: heat.lat, lng: heat.lng, spanM, width: 360, height: 360, spots });
  const wide = await mapSnapshot({ name: 'widgetmap_wide', lat: heat.lat, lng: heat.lng, spanM, width: 680, height: 352, spots });
  storage.set('map', JSON.stringify({ at: Math.floor(Date.now() / 1000), sq: { w: sq.width, h: sq.height, pts: sq.pts }, wide: { w: wide.width, h: wide.height, pts: wide.pts } }));
  ExtensionStorage.reloadWidget('widget');
}
