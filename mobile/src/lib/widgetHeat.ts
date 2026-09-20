import { ExtensionStorage } from '@bacons/apple-targets';
import { useStore } from '../store';
import { haversineM } from './geo';
import { computeHeat } from './heat';

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
      storage.set('hot', JSON.stringify(computeHeat(cs, loc.lat, loc.lng, st.painter?.id ?? null, st.discovered)));
      ExtensionStorage.reloadWidget('widget');
    } catch {}
  };
  const unsub = useStore.subscribe(() => { if (!timer) timer = setTimeout(() => { timer = null; push(); }, DEBOUNCE_MS); });
  push();
  return () => { unsub(); if (timer) clearTimeout(timer); };
}
